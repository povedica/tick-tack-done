"""Read Environment secrets privately; never evaluate values as shell code."""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

KEY = re.compile(r"^[A-Z][A-Z0-9_]*$")
ROOT = Path(__file__).resolve().parents[2]


def op(args):
    result = subprocess.run(["op", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("1Password operation failed")
    return result.stdout


def names():
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", (ROOT / ".env.example").read_text(), re.M))


def secrets(environment, reveal=False):
    if not environment or environment.startswith("-"):
        raise ValueError("Expected Environment ID or name")
    args = ["environment", "secret", "list", environment]
    if reveal:
        args.append("--reveal")
    data = json.loads(op([*args, "--format=json"]))
    if not isinstance(data, list):
        raise ValueError("Expected Environment secret list")
    result = {}
    for entry in data:
        name = entry["name"]
        if not KEY.fullmatch(name) or name in result:
            raise ValueError("Invalid or duplicate name")
        value = entry.get("value", "") if reveal else ""
        if not isinstance(value, str) or "\0" in value or "\r" in value:
            raise ValueError("Invalid value")
        result[name] = value
    return result


def compose_values(candidate, directory):
    compose = directory / "compose.json"
    compose.write_text(json.dumps({"services": {"probe": {"image": "scratch", "env_file": str(candidate)}}}))
    result = subprocess.run(["docker", "compose", "--env-file", str(candidate), "-f", str(compose), "config", "--format", "json"], capture_output=True, text=True)
    if result.returncode:
        return None
    values = json.loads(result.stdout)["services"]["probe"].get("environment", {})
    if not all(isinstance(value, str) for value in values.values()):
        return None
    # Compose escapes dollars in its reusable config output.
    return {name: value.replace("$$", "$") for name, value in values.items()}


def write_env(values, target, dotenv):
    # Compose single quotes preserve dollars, backticks and literal newlines.
    text = "".join(name + "='" + value.replace("'", "\\'") + "'\n" for name, value in values.items())
    target.parent.mkdir(parents=True, exist_ok=True)
    # Try the CLI dotenv, but prove it round-trips through the actual Compose parser.
    # JSON supplies the exact independent values for comparison and fallback.
    with tempfile.TemporaryDirectory(prefix=".verify-env-", dir=target.parent) as directory:
        directory = Path(directory)
        candidate = directory / "candidate.env"
        candidate.write_text(dotenv)
        candidate.chmod(0o600)
        if compose_values(candidate, directory) == values:
            text = dotenv
        else:
            candidate.write_text(text)
            if compose_values(candidate, directory) != values:
                raise ValueError("Cannot preserve Environment values in Compose")
    fd, temporary = tempfile.mkstemp(prefix=".runtime-", dir=target.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(text)
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    command, environment = sys.argv[1:3]
    if command == "check":
        actual = set(secrets(environment))
        missing, extra = names() - actual, actual - names()
        print("Faltan: " + ", ".join(sorted(missing)))
        print("Sobran: " + ", ".join(sorted(extra)))
        return int(bool(missing or extra))
    if command == "render":
        values = secrets(environment, reveal=True)
        # Runtime metadata belongs to the immutable image, not configuration.
        values.pop("GIT_COMMIT", None)
        values.pop("BUILD_TIME", None)
        dotenv = op(["environment", "secret", "list", environment, "--reveal", "--format=dotenv"])
        write_env(values, Path(sys.argv[3]), dotenv)
        return 0
    raise ValueError("Unknown operation")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("Secret operation failed; check Environment, format and authentication", file=sys.stderr)
        sys.exit(1)
