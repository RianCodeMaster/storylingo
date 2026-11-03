"""Third LLM pass: which emotion each sentence is spoken with, like a storyteller marking up a script."""
import json
import re

from llm import MODEL, client
from models import Story, VoiceLine

VOICE_VERSION = "voice-v1"
EMOTIONS = ["amused", "angry", "disgusted", "neutral", "sleepy", "surprised", "whisper"]

SYSTEM = f"""You direct the narrator of an absurd, exaggerated children's story for language learners.
For every sentence choose one emotion from: {", ".join(EMOTIONS)}.
Make it theatrical: surprised at twists and big numbers, whisper for secrets and fear, angry for conflicts,
amused for funny moments, sleepy for night or boredom. Use neutral only for plain facts, at most a third of the time.

Return ONLY JSON: {{"scenes": [{{"position": 1, "emotions": ["surprised", "neutral"]}}]}}
with exactly one emotion per sentence, in order."""


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?…])\s+", text.strip()) if s]


def add_voice(story: Story) -> dict:
    """Fill scene.voice for every scene in place. Returns usage stats."""
    split = [sentences(s.text) for s in story.scenes]
    payload = [{"position": i, "sentences": lines} for i, lines in enumerate(split, 1)]
    response = client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.7,
    )
    data = json.loads(response.choices[0].message.content)
    chosen = {s.get("position"): s.get("emotions", []) for s in data.get("scenes", [])}

    for position, (scene, lines) in enumerate(zip(story.scenes, split), 1):
        emotions = chosen.get(position, [])
        scene.voice = [
            VoiceLine(text=line, emotion=emotions[i] if i < len(emotions) and emotions[i] in EMOTIONS else "neutral")
            for i, line in enumerate(lines)
        ]
    print("  voice: " + " | ".join(" ".join(v.emotion for v in s.voice) for s in story.scenes))
    return {
        "voice_version": VOICE_VERSION,
        "voice_input_tokens": response.usage.prompt_tokens,
        "voice_output_tokens": response.usage.completion_tokens,
    }
