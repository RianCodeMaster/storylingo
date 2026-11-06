/**
 * Recording the learner's own voice for shadowing. Stays in the browser: nothing is uploaded or stored.
 */

export function canRecord(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices && "MediaRecorder" in window;
}

export type Recording = { stop: () => void; done: Promise<string> };

/** Record until stop() or maxMs; `done` gives a URL to play the recording back (revoke it when finished). */
export async function record(maxMs: number): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<string>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); // the browser's "recording" indicator goes off
      resolve(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })));
    };
  });
  recorder.start();
  const timer = setTimeout(() => recorder.state === "recording" && recorder.stop(), maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state === "recording") recorder.stop();
    },
    done,
  };
}
