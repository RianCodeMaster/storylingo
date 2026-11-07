"""Reading and writing the files in content/: YAML that people and LLMs can edit without surprises.

Plain YAML reads yes, no, on and off as true/false, so a teacher's `yes:` list or the word "no" would silently
change meaning. Here only true and false are booleans. Written files keep long texts readable (block style) and
the order of the keys as the code gives them.
"""
import re
from pathlib import Path

import yaml


class _Loader(yaml.SafeLoader):
    pass


# Drop YAML 1.1's yes/no/on/off booleans; keep true/false.
_Loader.yaml_implicit_resolvers = {
    first: [(tag, regexp) for tag, regexp in resolvers if tag != "tag:yaml.org,2002:bool"]
    for first, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:bool", re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF")
)


def load(path: Path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=_Loader)


class _Dumper(yaml.SafeDumper):
    pass


def _text(dumper, value: str):
    # Long or multi-line texts as a block, so a diff shows the sentence that changed.
    if "\n" in value:
        return dumper.represent_scalar("tag:yaml.org,2002:str", value, style="|")
    # Words YAML 1.1 readers take for booleans stay quoted for other tools.
    if value.lower() in {"yes", "no", "on", "off", "y", "n"}:
        return dumper.represent_scalar("tag:yaml.org,2002:str", value, style='"')
    return dumper.represent_scalar("tag:yaml.org,2002:str", value)


def _list(dumper, value: list):
    # Short lists of words on one line: options: [Ja, Nein], tags: [algemeen, geld].
    short = all(isinstance(v, str) and "\n" not in v for v in value) and sum(len(v) + 2 for v in value) < 80
    return dumper.represent_sequence("tag:yaml.org,2002:seq", value, flow_style=short and bool(value))


_Dumper.add_representer(str, _text)
_Dumper.add_representer(list, _list)


def dump(data) -> str:
    return yaml.dump(data, Dumper=_Dumper, allow_unicode=True, sort_keys=False, width=120, default_flow_style=False)


def save(path: Path, data, header: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + dump(data), encoding="utf-8", newline="\n")
