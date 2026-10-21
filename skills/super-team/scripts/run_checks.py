#!/usr/bin/env python3
"""Runs the checks listed in a gate.json in the current directory and prints a JSON array of results.
Each check: {"name", "cmd", "timeout": seconds (default 900), "enabled": true}. Disabled checks are listed
as skipped (use this to stage checks that switch on later). Exit 0 if all enabled checks pass,
1 if any fails, 3 if the config is invalid (then it prints {"error": ...} instead of an array, and no check runs).
Check names must be unique (a check without a name is known by its cmd): results and "covers" are keyed by name,
so a duplicate would let one check's pass stand in for another's failure. Duplicates are a config error (exit 3),
whether or not the checks are enabled.
A check that times out is killed with its whole process group, so no child keeps running.
usage: run_checks.py <gate.json>
The file is read once. scripts/gate.sh passes a private snapshot of team/gate.json (the bytes it hashed for the run log), not the
live file, which an install step or a check can rewrite; so what runs is what the logged config hash names.
"""
import json, os, re, signal, subprocess, sys

def main():
    try:
        cfg = json.load(open(sys.argv[1]))
    except Exception as e:
        print(json.dumps({"error": f"cannot read gate config: {e}"})); sys.exit(3)
    checks = cfg.get("checks", [])
    if not isinstance(checks, list) or any(not isinstance(c, dict) or not isinstance(c.get("cmd"), str) or not c["cmd"].strip() for c in checks):
        print(json.dumps({"error": "every check needs a non-empty string 'cmd'"})); sys.exit(3)
    seen = set()
    for c in checks:
        key = json.dumps(c.get("name", c["cmd"]), sort_keys=True)
        if key in seen:
            print(json.dumps({"error": f"duplicate check name {key}: check names must be unique (results and covers are keyed by name)"})); sys.exit(3)
        seen.add(key)
    results, ok = [], True
    for c in checks:
        name = c.get("name", c["cmd"])
        if not c.get("enabled", True):
            results.append({"name": name, "ok": None, "skipped": True})
            continue
        timeout = c.get("timeout", 900)
        p = subprocess.Popen(c["cmd"], shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        try:
            out, _ = p.communicate(timeout=timeout)
            lines = [l for l in (out or "").strip().splitlines() if l.strip()]
            passed = p.returncode == 0
            last = lines[-1] if lines else ""
            if not passed:
                bad = [l for l in lines if re.search(r"fail|error|✘|✗|×|assert", l, re.I)]
                if bad:
                    last = " | ".join(bad[-3:])
            results.append({"name": name, "ok": passed, "last": last[:300]})
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            p.communicate()
            passed = False
            results.append({"name": name, "ok": False, "last": f"timeout after {timeout}s (process group killed)"})
        ok = ok and passed
    print(json.dumps(results))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
