#!/usr/bin/env python3
"""What this machine offers the PM step, at zero model tokens: Claude Code and Codex versions, logins, models, plan
meters, the recommended model and effort for each role, and whether the Art question (Screen 2) is asked.
super-pm runs on both hosts: the host reports itself with --host.

    python3 detect_env.py --host claude   # JSON on stdout; --host is the CLI running this skill (claude or codex)
    python3 detect_env.py --host claude --no-meters  # skip the Claude meter (`claude -p "/usage"` takes a few seconds)

Sources, none of which calls a model:
  Claude: `claude --version`, `claude -p "/usage" --no-session-persistence` (plan meters),
          `claude -p "/model" --no-session-persistence` (new-session default model and effort, available models).
  Codex:  `codex --version`, `codex login status`, `codex debug models` (models and their efforts),
          ~/.codex/config.toml (the local default, which may be a max-effort model), and the newest session log's
          rate_limits (meters as of the last Codex call; each window is named by its length, never by its position).
Environment: DETECT_HOME replaces ~ for the Codex files (tests use it). Exit 0 even when a tool is missing.
"""
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys

HOME = os.path.expanduser(os.environ.get("DETECT_HOME", "~"))
EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"]
WANT_EFFORT = "xhigh"      # the default for every role; the user may pick another


def run(cmd, timeout=30, merge=False):
    """(returncode, stdout) or (None, error text) when the command is missing or hangs. merge: stderr too (some CLIs
    print their status there)."""
    if not shutil.which(cmd[0]):
        return None, f"{cmd[0]} not found"
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        return p.returncode, (p.stdout or "") + (p.stderr or "" if merge or p.returncode else "")
    except subprocess.TimeoutExpired:
        return None, f"{' '.join(cmd)} timed out after {timeout}s"
    except OSError as e:
        return None, str(e)


def claude_info(meters=True):
    rc, out = run(["claude", "--version"], 20)
    if rc is None:
        return {"installed": False, "error": out}
    info = {"installed": True, "version": out.strip().splitlines()[0] if out.strip() else None,
            "login": None, "meters": [], "default_model": None, "default_effort": None, "models": []}
    if meters:
        rc, out = run(["claude", "-p", "/usage", "--no-session-persistence"], 90)
        if rc == 0:
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("You are currently using your subscription"):
                    info["login"] = "subscription"
                m = re.match(r"^Current (.+?): (\d+(?:\.\d+)?)% used(?: · resets (.+?))?$", line)
                if m:
                    info["meters"].append({"label": m.group(1), "used": float(m.group(2)), "resets": m.group(3)})
        else:
            info["meters_error"] = out.strip()[:200]
    rc, out = run(["claude", "-p", "/model", "--no-session-persistence"], 60)
    if rc == 0:
        m = re.search(r"Current model: `?([^`(\n]+?)`?\s*\(effort: (\w+)\)", out)
        if m:
            info["default_model"], info["default_effort"] = m.group(1).strip(), m.group(2)
        m = re.search(r"Available: (.+?)(?:, or a full model ID)?\.?\s*$", out, re.M)
        if m:
            info["models"] = [x.strip() for x in m.group(1).split(",") if x.strip()]
    return info


def version_key(slug):
    m = re.match(r"^gpt-(\d+(?:\.\d+)*)-sol$", slug)
    return tuple(int(x) for x in m.group(1).split(".")) if m else None


def pick_effort(efforts):
    if WANT_EFFORT in efforts:
        return WANT_EFFORT
    below = [e for e in EFFORTS[:EFFORTS.index(WANT_EFFORT)] if e in efforts]
    return below[-1] if below else (efforts[0] if efforts else None)


def codex_config():
    path = os.path.join(HOME, ".codex", "config.toml")
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    top = text.split("\n[", 1)[0]          # top-level keys only, before the first [table]
    get = lambda k: (re.search(rf'^\s*{k}\s*=\s*"([^"]*)"', top, re.M) or [None, None])[1]
    return {"model": get("model"), "effort": get("model_reasoning_effort")}


def find_rate_limits(obj):
    if isinstance(obj, dict):
        rl = obj.get("rate_limits")
        if isinstance(rl, dict):
            return rl
        for v in obj.values():
            r = find_rate_limits(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find_rate_limits(v)
            if r:
                return r
    return None


def codex_meters(now):
    """The newest session log's last rate_limits with numbers; each window named by window_minutes."""
    files = sorted(glob.glob(os.path.join(HOME, ".codex", "sessions", "**", "*.jsonl"), recursive=True), key=os.path.getmtime, reverse=True)
    for f in files[:40]:
        found = None
        try:
            for line in open(f, encoding="utf-8", errors="replace"):
                if "rate_limits" not in line:
                    continue
                try:
                    rl = find_rate_limits(json.loads(line))
                except ValueError:
                    continue
                if rl and any(isinstance(rl.get(k), dict) and rl[k].get("used_percent") is not None for k in ("primary", "secondary")):
                    found = rl
        except OSError:
            continue
        if found:
            windows = []
            for k in ("primary", "secondary"):
                w = found.get(k)
                if not isinstance(w, dict) or w.get("used_percent") is None:
                    continue
                mins = w.get("window_minutes")
                label = {300: "5-hour", 10080: "week"}.get(mins, f"{mins} min" if mins else "window")
                resets = w.get("resets_at")
                stale = bool(resets and resets < now.timestamp())
                windows.append({"label": label, "window_minutes": mins, "used": 0.0 if stale else float(w["used_percent"]),
                                "resets_at": dt.datetime.fromtimestamp(resets).astimezone().isoformat(timespec="minutes") if resets else None,
                                "reset_since": stale})
            return {"windows": windows, "plan": found.get("plan_type"), "source": f}
    return {"windows": [], "plan": None, "source": None}


def codex_info(now):
    rc, out = run(["codex", "--version"], 20)
    if rc is None:
        return {"installed": False, "error": out}
    info = {"installed": True, "version": out.strip().splitlines()[0] if out.strip() else None}
    rc, out = run(["codex", "login", "status"], 20, merge=True)
    info["logged_in"] = rc == 0 and "logged in" in out.lower()
    info["login"] = out.strip().splitlines()[0] if out.strip() else None
    rc, out = run(["codex", "debug", "models"], 30)
    models = []
    if rc == 0:
        try:
            cat = json.loads(out)
            for m in (cat.get("models", []) if isinstance(cat, dict) else cat):
                if isinstance(m, dict) and m.get("visibility", "list") == "list" and m.get("slug"):
                    efforts = [e.get("effort") for e in m.get("supported_reasoning_levels", []) if isinstance(e, dict)]
                    models.append({"slug": m["slug"], "efforts": [e for e in efforts if e]})
        except ValueError:
            info["models_error"] = "codex debug models: not JSON"
    info["models"] = models
    info["config_default"] = codex_config()
    sols = sorted((m for m in models if version_key(m["slug"])), key=lambda m: version_key(m["slug"]))
    info["recommended"] = {"model": sols[-1]["slug"], "effort": pick_effort(sols[-1]["efforts"])} if sols else None
    info["meters"] = codex_meters(now)
    return info


def main():
    args = sys.argv[1:]
    host = args[args.index("--host") + 1] if "--host" in args[:-1] else "claude"
    if host not in ("claude", "codex"):
        sys.exit("usage: detect_env.py --host claude|codex [--no-meters]")
    now = dt.datetime.now().astimezone()
    claude, codex = claude_info("--no-meters" not in args), codex_info(now)
    cx = {"cli": "codex", **codex["recommended"]} if codex.get("installed") and codex.get("logged_in") and codex.get("recommended") else None
    out = {
        "time": now.isoformat(timespec="seconds"),
        "host": host,
        "claude": claude,
        "codex": codex,
        # Screen 2 (Art) is asked only on a Claude Code host with Codex ready (references/questions.md).
        "ask_art": host == "claude" and cx is not None,
        # The session that writes the spec, and the art director to start after Screen 2. null: the host draws the
        # looks itself (a Codex host generates them; a Claude host without Codex draws code-rendered mockups).
        "recommend": {"pm": {"cli": "claude", "model": "opus", "effort": WANT_EFFORT} if host == "claude" else cx,
                      "art_director": cx if host == "claude" else None},
    }
    json.dump(out, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
