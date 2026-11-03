"""Talks to DeepSeek through its OpenAI-compatible API."""
import json
import os

from openai import OpenAI
from pydantic import ValidationError

from models import Brief, Story, check_story
from prompts import SYSTEM, fix_prompt, user_prompt

MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
MAX_ATTEMPTS = 3


def client() -> OpenAI:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise SystemExit("DEEPSEEK_API_KEY is not set.")
    return OpenAI(api_key=key, base_url="https://api.deepseek.com")


def write_story(brief: Brief) -> tuple[Story, dict]:
    """Ask for a story, check it, and ask for fixes until it passes. Returns the story and usage stats."""
    api = client()
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_prompt(brief)}]
    usage = {"model": MODEL, "attempts": 0, "input_tokens": 0, "output_tokens": 0}

    for attempt in range(1, MAX_ATTEMPTS + 1):
        response = api.chat.completions.create(
            model=MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=1.0,
        )
        usage["attempts"] = attempt
        usage["input_tokens"] += response.usage.prompt_tokens
        usage["output_tokens"] += response.usage.completion_tokens
        content = response.choices[0].message.content

        try:
            story = Story.model_validate(json.loads(content))
            problems = check_story(brief, story)
        except (json.JSONDecodeError, ValidationError) as e:
            story, problems = None, [f"Invalid JSON structure: {e}"]

        if not problems:
            return story, usage
        print(f"  attempt {attempt}: {len(problems)} problem(s), asking for a fix")
        for p in problems:
            print(f"    - {p}")
        messages += [{"role": "assistant", "content": content}, {"role": "user", "content": fix_prompt(problems)}]

    raise SystemExit(f"No valid story after {MAX_ATTEMPTS} attempts.")
