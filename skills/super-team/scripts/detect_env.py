#!/usr/bin/env python3
"""What this machine offers a super-team run, at zero model tokens: Claude Code and Codex versions, logins, models and
plan meters; the build tools; whether super-team can run here; and each mode's roles with a recommended model and effort.
super-team runs from Claude Code with Codex logged in: its two modes, Super Engineer and Super Team, start with a Claude
session and use Codex as reviewer and artist. A single agent building a spec needs no skill.

    python3 detect_env.py --host claude   # JSON on stdout; --host is the CLI running this skill (claude or codex)
    python3 detect_env.py --host claude --no-meters  # skip the Claude meter (`claude -p "/usage"` takes a few seconds)

Sources, none of which calls a model:
  Claude: `claude --version`, `claude -p "/usage" --no-session-persistence` (plan meters),
          `claude -p "/model" --no-session-persistence` (new-session default model and effort, available models).
  Codex:  `codex --version`, `codex login status`, `codex debug models` (models and their efforts),
          ~/.codex/config.toml (the local default, which may be a max-effort model), and the newest session log's
          rate_limits (meters as of the last Codex call; each window is named by its length, never by its position).
Environment: DETECT_HOME replaces ~ for the Codex files (tests use it). Exit 0 even when a tool is missing.
Facade itself is not visible from here: Tier A needs mcp__facade__* tools in the running session.
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


def tools():
    has = lambda c: shutil.which(c) is not None
    chrome = any(os.path.exists(c) or has(c) for c in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "chromium", "chromium-browser"))
    pw = any(os.path.isdir(os.path.join(HOME, d)) for d in ("Library/Caches/ms-playwright", ".cache/ms-playwright"))
    return {"git": has("git"), "node": has("node"), "npm": has("npm"), "python3": has("python3"), "ffmpeg": has("ffmpeg"),
            "chrome": chrome, "playwright_browsers": pw}


NAMES = {"super-engineer": "Super Engineer", "super-team": "Super Team (experimental)"}
# The one line the skill says when it can't run, and stops (the question script, references/start-up.md).
NO_CODEX = ("super-team needs Codex as reviewer. Run codex login and ask again, "
            "or ask Claude to build the spec directly.")
CODEX_HOST = ("super-team runs from Claude Code with Codex logged in. "
              "To build with Codex alone, ask Codex to build the spec directly.")


def roles(codex_pick):
    """Each mode's roles. The session the user starts becomes the first role; it starts the others with these settings."""
    eng = {"cli": "claude", "model": "opus", "effort": WANT_EFFORT}
    cx = {"cli": "codex", **codex_pick}
    return {
        "super-engineer": [{"role": "Builder and lead, TL (the session you start)", **eng}, {"role": "Reviewer and artist", **cx},
                           {"role": "Fallback reviewer, only if Codex runs out", **eng}],
        "super-team": [{"role": "Manager, EM (the session you start)", "cli": "claude", "model": "haiku", "effort": "medium"},
                       {"role": "Builder and lead, TL: one long-lived session", **eng},
                       {"role": "Helpers, when the TL wants them: one task each", "cli": "claude", "model": "sonnet", "effort": "high"},
                       {"role": "Reviewer and artist", **cx}],
    }


def main():
    args = sys.argv[1:]
    host = args[args.index("--host") + 1] if "--host" in args[:-1] else "claude"
    if host not in ("claude", "codex"):
        sys.exit("usage: detect_env.py --host claude|codex [--no-meters]")
    now = dt.datetime.now().astimezone()
    claude, codex = claude_info("--no-meters" not in args), codex_info(now)
    cx = bool(codex.get("installed") and codex.get("logged_in") and codex.get("recommended"))
    why_not = CODEX_HOST if host == "codex" else None if cx else NO_CODEX
    modes = [] if why_not else ["super-engineer", "super-team"]
    out = {
        "time": now.isoformat(timespec="seconds"),
        "host": host,
        "claude": claude,
        "codex": codex,
        "tools": tools(),
        "facade_dir_present": os.path.isdir(os.path.join(HOME, ".facade")),
        "os": os.uname().sysname,
        # Whether super-team runs here; if not, the line to say. Then the modes, their names and their roles.
        "can_run": not why_not,
        "why_not": why_not,
        "modes": modes,
        "names": {m: NAMES[m] for m in modes},
        "roles": roles(codex["recommended"]) if modes else {},
    }
    json.dump(out, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
