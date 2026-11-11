"""Secret tooling. Values never reach logs, command arguments or error text."""
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

KEY = re.compile(r"^[A-Z][A-Z0-9_]*$")
ROOT = Path(__file__).resolve().parents[2]


def parse_env(text):
    result = {}
    # POSIX quoting, export and multiline quoted values; no evaluation/expansion.
    lexer = shlex.shlex(text, posix=True)
    lexer.whitespace_split = True
    for token in lexer:
        if token == "export":
            continue
        name, sep, value = token.partition("=")
        if not sep or not KEY.fullmatch(name) or name in result:
            raise ValueError("Invalid or duplicate env assignment")
        result[name] = value
    return result


def op(args, data=None):
    result = subprocess.run(["op", *args], input=data, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("1Password operation failed; check authentication and field names")
    return result.stdout


def names():
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", (ROOT / ".env.example").read_text(), re.M))


def item_name(value):
    if value not in {"dev", "staging", "prod"}:
        raise ValueError("Expected dev, staging or prod")
    return value


def main():
    command = sys.argv[1]
    if command == "import":
        source, item = Path(sys.argv[2]), item_name(sys.argv[3])
        values = parse_env(source.read_text())
        current = json.loads(op(["item", "get", item, "--vault", "ttd", "--format", "json"]))
        fields = current.setdefault("fields", [])
        for name, value in values.items():
            field = next((f for f in fields if f.get("label") == name), None)
            if field is None:
                field = {"label": name, "type": "CONCEALED"}
                fields.append(field)
            field["value"] = value
        # Existing item JSON enters stdin. Neither input nor op response is printed.
        op(["item", "edit", item, "--vault", "ttd"], json.dumps(current))
        print(f"{len(values)} campos importados: " + ", ".join(sorted(values)))
    elif command == "check":
        failed = False
        for item in sys.argv[2:] or ["dev", "staging", "prod"]:
            item_name(item)
            data = json.loads(op(["item", "get", item, "--vault", "ttd", "--format", "json"]))
            actual = {f.get("label") for f in data.get("fields", []) if KEY.fullmatch(f.get("label", ""))}
            missing, extra = names() - actual, actual - names()
            print(item + " faltan: " + ", ".join(sorted(missing)))
            print(item + " sobran: " + ", ".join(sorted(extra)))
            failed |= bool(missing or extra)
        return int(failed)
    elif command == "render":
        template, target = Path(sys.argv[2]), Path(sys.argv[3])
        references = parse_env(template.read_text())
        if not all(re.fullmatch(r"op://ttd/(dev|staging|prod)/[A-Z][A-Z0-9_]*", ref) for ref in references.values()):
            raise ValueError("Only ttd secret references are allowed")
        marker = "__TTD_" + uuid.uuid4().hex + "__"
        payload = "".join("{{ " + ref + " }}" + marker for ref in references.values())
        rendered = op(["inject"], payload).rstrip("\n")
        parts = rendered.split(marker)
        if len(parts) != len(references) + 1 or parts[-1] != "":
            raise ValueError("Invalid inject output")
        values = dict(zip(references, parts[:-1]))
        # Compose dotenv single quotes preserve $, backticks and multiline PEMs.
        text = "".join(name + "='" + value.replace("'", "\\'") + "'\n" for name, value in values.items())
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".runtime-", dir=target.parent)
        try:
            with os.fdopen(fd, "w") as output:
                output.write(text)
            os.chmod(temporary, 0o600)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    else:
        raise ValueError("Unknown operation")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Never print op errors or parser exceptions: they may contain a value.
        print("Secret operation failed; check input format, item and authentication", file=sys.stderr)
        sys.exit(1)
