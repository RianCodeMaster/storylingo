"""Local image and voice generation, as a tiny HTTP server.

Runs in its own environment (.venv-local, Python 3.11, see requirements.txt next to this file)
because the ML libraries pin their own versions. The pipeline talks to it like to any other provider:

    .venv-local/Scripts/python localgen/server.py        then:  storylingo.py media <slug>

POST /image   {"prompt", "negative_prompt", "seed", "width", "height", "steps"} -> image/png  (SDXL, GPU)
POST /speech  {"lines": [{"text", "emotion"}], "language"}                      -> audio/wav  (Piper, CPU)
GET  /health

Images run on the GPU, speech on the CPU, so the two never compete for the 8 GB of GPU memory.
"""
import io
import json
import os
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer

import torch

PORT = int(os.environ.get("LOCALGEN_PORT", "8765"))
IMAGE_MODEL = os.environ.get("LOCALGEN_IMAGE_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
PIPER_DIR = os.path.join(os.path.dirname(__file__), "..", "voices", "piper")
# A native speaker who recorded every emotion. Download: python -m piper.download_voices --data-dir voices/piper <name>
PIPER_VOICES = {"de": "de_DE-thorsten_emotional-medium"}

_image_pipe = None
_voices: dict[str, object] = {}


def _image_model():
    global _image_pipe
    if _image_pipe is None:
        from diffusers import AutoencoderKL, StableDiffusionXLPipeline

        print("loading image model...", flush=True)
        # The standard SDXL VAE produces black images in fp16; this fixed VAE does not.
        vae = AutoencoderKL.from_pretrained("madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
        _image_pipe = StableDiffusionXLPipeline.from_pretrained(
            IMAGE_MODEL, vae=vae, torch_dtype=torch.float16, variant="fp16", use_safetensors=True
        )
        _image_pipe.enable_model_cpu_offload()  # fits SDXL in 8 GB by moving idle parts to normal memory
    return _image_pipe


def image(req: dict) -> bytes:
    result = _image_model()(
        prompt=req["prompt"],
        negative_prompt=req.get("negative_prompt"),
        width=int(req.get("width", 1152)),
        height=int(req.get("height", 896)),
        num_inference_steps=int(req.get("steps", 28)),
        guidance_scale=float(req.get("guidance", 6.5)),
        generator=torch.Generator("cpu").manual_seed(int(req.get("seed", 0))),
    )
    buffer = io.BytesIO()
    result.images[0].save(buffer, format="PNG")
    return buffer.getvalue()


def speech(req: dict) -> bytes:
    """Native-speaker voice, each sentence with its own emotion, joined with short pauses."""
    from piper import PiperVoice, SynthesisConfig

    language = req.get("language", "de")
    if language not in PIPER_VOICES:
        raise ValueError(f"no voice configured for language '{language}' (see PIPER_VOICES)")
    name = PIPER_VOICES[language]
    if name not in _voices:
        _voices[name] = PiperVoice.load(os.path.join(PIPER_DIR, f"{name}.onnx"))
    voice = _voices[name]
    speakers = voice.config.speaker_id_map
    rate = voice.config.sample_rate
    pause = b"\x00\x00" * int(rate * 0.4)

    frames = []
    for line in req["lines"]:
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as w:
            config = SynthesisConfig(
                speaker_id=speakers.get(line.get("emotion"), speakers["neutral"]),
                length_scale=float(req.get("length_scale", 1.1)),  # slightly slower than natural, for learners
            )
            voice.synthesize_wav(line["text"], w, config)
        buffer.seek(0)
        with wave.open(buffer) as r:
            frames += [r.readframes(r.getnframes()), pause]

    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(frames[:-1]))
    return out.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, json.dumps({"ok": True, "cuda": torch.cuda.is_available()}).encode(), "application/json")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        routes = {"/speech": (speech, "audio/wav"), "/image": (image, "image/png")}
        if self.path not in routes:
            return self._send(404, b"not found", "text/plain")
        make, content_type = routes[self.path]
        try:
            req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            body = make(req)
            self._send(200, body, content_type)
        except Exception as e:  # report the error to the pipeline instead of dropping the connection
            self._send(500, f"{type(e).__name__}: {e}".encode(), "text/plain")


if __name__ == "__main__":
    print(f"localgen on http://127.0.0.1:{PORT}  (cuda: {torch.cuda.is_available()})", flush=True)
    # One thread for every request: GPU work from changing threads crashed the process on this laptop.
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
