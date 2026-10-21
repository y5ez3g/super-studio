#!/usr/bin/env python3
"""Token usage and API-equivalent cost per CLI and per model, for one project since a given time.

Reads only local logs, so it costs no tokens:
  claude : ~/.claude/projects/<dir containing the project name>/**/*.jsonl  (message.usage and message.model, per response)
  codex  : ~/.codex/sessions/**/rollout-*.jsonl whose session cwd contains the project name (token_count events, per
           request, each priced at the model of the turn it belongs to)

usage: usage_report.py --project "My Game" --since "2026-10-16 22:00" [--prices prices.json] [--json]
                       [--exclude <other run>] [--claude-dir <name>=<dir>]
  --since       "YYYY-MM-DD HH:MM" in local time, or ISO 8601 (e.g. 2026-10-18T01:54:02-07:00; no offset = local time)
  --exclude     skip project dirs/sessions whose path contains this (another run's worktree in the same repo); repeatable
  --claude-dir  another Claude Code config dir, counted as its own row; repeatable
Every request is priced by its model's entry in prices.json, at the long-prompt rates when its prompt is over that entry's
"long.over" tokens. A model without an entry makes its row's $ n/a. Prices are per 1M tokens and MUST be verified before
quoting money (they change); see assets/templates/prices.json.
"""
import argparse, datetime, glob, json, os, re, time

def since_ts(s):
    """'YYYY-MM-DD HH:MM' (local time) or ISO 8601; an ISO time without an offset is local time."""
    s = s.strip()
    try:
        return time.mktime(time.strptime(s, "%Y-%m-%d %H:%M"))
    except ValueError:
        pass
    if s.endswith(("Z", "z")):  # fromisoformat accepts "Z" only from Python 3.11
        s = s[:-1] + "+00:00"
    return datetime.datetime.fromisoformat(s).timestamp()

def before(ts, t0):
    """True when an ISO timestamp from a log line is earlier than t0 (an unreadable one counts as later)."""
    try:
        return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() < t0
    except Exception:
        return False

EXCLUDE = []
FIELDS = ("input", "cache_read", "cache_write", "output")

def price_for(prices, model):
    """The prices.json entry for a model id: its own key, else the longest key the id contains."""
    if not model:
        return None
    if model in prices:
        return prices[model]
    keys = [k for k in prices if not k.startswith("_") and k in model]
    return prices[max(keys, key=len)] if keys else None

def request_cost(p, u):
    """USD for one request; a prompt (input + cache reads + cache writes) over p["long"]["over"] takes the long rates."""
    if not p:
        return None
    long = p.get("long")
    prompt = u["input"] + u["cache_read"] + u["cache_write"]
    rate = long if isinstance(long, dict) and prompt > long.get("over", float("inf")) else p
    return sum(u[f] * rate.get(f, 0) for f in FIELDS) / 1e6

class Tally:
    """Tokens and dollars per model; a row's dollars are n/a (None) when any model in it has no price."""
    def __init__(self, prices):
        self.prices, self.models = prices, {}

    def add(self, model, u):
        m = self.models.setdefault(model or "unknown", dict(input=0, cache_read=0, cache_write=0, output=0, calls=0, usd=0.0))
        for f in FIELDS:
            m[f] += u[f]
        m["calls"] += 1
        c = request_cost(price_for(self.prices, model), u)
        m["usd"] = None if c is None or m["usd"] is None else m["usd"] + c

    def row(self, **extra):
        models = {k: v for k, v in self.models.items() if any(v[f] for f in FIELDS)}  # zero-token records cost nothing
        r = {f: sum(v[f] for v in models.values()) for f in FIELDS}
        r["calls"] = sum(v["calls"] for v in models.values())
        unpriced = sorted(k for k, v in models.items() if v["usd"] is None)
        r["usd_api_equivalent"] = None if unpriced else sum(v["usd"] for v in models.values())
        if unpriced:
            r["unpriced"] = unpriced
        r["models"] = models
        r.update(extra)
        return r

def claude_usage(project, t0, prices, config_dir="~/.claude"):
    slug = re.sub(r"[^A-Za-z0-9]", "-", project)
    tally, dirs = Tally(prices), []
    for d in glob.glob(os.path.join(os.path.expanduser(config_dir), "projects", "*")):
        base = os.path.basename(d)
        if slug not in base or any(re.sub(r"[^A-Za-z0-9]", "-", x) in base for x in EXCLUDE):
            continue
        if any(os.path.getmtime(f) >= t0 for f in glob.glob(d + "/*.jsonl")):
            dirs.append(base)
        seen = {}  # one API response is logged once per content block: dedupe on (message.id, requestId)
        for f in glob.glob(d + "/**/*.jsonl", recursive=True):
            if os.path.getmtime(f) < t0:
                continue
            for n, line in enumerate(open(f, errors="ignore")):
                if '"usage"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                    msg = rec.get("message") or {}
                    u = msg.get("usage")
                except Exception:
                    continue
                # long-lived sessions span days: count only messages after --since
                if not isinstance(u, dict) or (rec.get("timestamp") and before(rec["timestamp"], t0)):
                    continue
                key = (msg.get("id"), rec.get("requestId"))
                if key == (None, None):
                    key = (f, n)
                prev = seen.get(key)
                if prev is None or u.get("output_tokens", 0) > prev[1].get("output_tokens", 0):
                    seen[key] = (msg.get("model"), u)
        for model, u in seen.values():
            tally.add(model, dict(input=u.get("input_tokens", 0), cache_read=u.get("cache_read_input_tokens", 0),
                                  cache_write=u.get("cache_creation_input_tokens", 0), output=u.get("output_tokens", 0)))
    return tally.row(dirs=dirs)

def codex_usage(project, t0, prices):
    tally, sessions = Tally(prices), 0
    for f in glob.glob(os.path.expanduser("~/.codex/sessions/**/rollout-*.jsonl"), recursive=True):
        if os.path.getmtime(f) < t0:
            continue
        with open(f, errors="ignore") as fh:
            if any(x in fh.read(4000) for x in EXCLUDE):
                continue
        cwd_ok, model, reqs, high, total, base = False, None, [], 0, None, None
        for line in open(f, errors="ignore"):
            if not cwd_ok and '"cwd"' in line and project in line:
                cwd_ok = True
            if '"turn_context"' not in line and '"token_count"' not in line:
                continue
            try:
                d = json.loads(line)
                p = d.get("payload", d)
            except Exception:
                continue
            if not isinstance(p, dict):
                continue
            if d.get("type") == "turn_context":
                model = p.get("model") or model
                continue
            info = p.get("info") if p.get("type") == "token_count" else None
            t = (info or {}).get("total_token_usage")
            if not t:
                continue
            n = t.get("total_tokens", 0)
            fresh = n > high  # a repeated event (a rate-limit update) carries the same totals and adds nothing
            high = max(high, n)
            if d.get("timestamp") and before(d["timestamp"], t0):
                base = t  # the session's totals before this run: never charged to it
                continue
            if not fresh:
                continue
            total = (model, t)
            if info.get("last_token_usage"):
                reqs.append((model, info["last_token_usage"]))
        if not cwd_ok:
            continue
        if not reqs and total:  # an older log without per-request usage: what the session used since t0, as one request
            m, t = total
            reqs = [(m, {k: max(0, v - (base or {}).get(k, 0)) for k, v in t.items() if isinstance(v, (int, float))})]
        sessions += bool(reqs)
        for m, u in reqs:
            # input_tokens includes the cached and cache-written tokens
            cached, written = u.get("cached_input_tokens", 0), u.get("cache_write_input_tokens", 0)
            tally.add(m, dict(input=max(0, u.get("input_tokens", 0) - cached - written), cache_read=cached,
                              cache_write=written, output=u.get("output_tokens", 0)))
    return tally.row(sessions=sessions)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="substring of the project folder name (matches worktrees too)")
    ap.add_argument("--since", required=True, help='"YYYY-MM-DD HH:MM" local time, or ISO 8601 (e.g. 2026-10-18T01:54:02-07:00)')
    ap.add_argument("--prices", default=os.path.join(os.path.dirname(__file__), "..", "assets", "templates", "prices.json"))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--exclude", action="append", default=[], metavar="SUBSTR",
                    help="skip project dirs/sessions whose path contains SUBSTR (e.g. another run's worktree name in the same repo)")
    ap.add_argument("--claude-dir", action="append", default=[], metavar="NAME=DIR",
                    help="another Claude Code config dir, counted as its own row named NAME")
    a = ap.parse_args()
    if not a.project.strip():
        ap.error("--project must not be empty (it would match every project)")
    try:
        t0 = since_ts(a.since)
    except ValueError:
        ap.error('--since must look like "YYYY-MM-DD HH:MM" (local time) or ISO 8601, e.g. 2026-10-18T01:54:02-07:00')
    EXCLUDE.extend(a.exclude)
    extra = []
    for item in a.claude_dir:
        if "=" not in item:
            ap.error("--claude-dir takes NAME=DIR")
        extra.append(item.split("=", 1))
    prices = json.load(open(a.prices)).get("models", {}) if os.path.exists(a.prices) else {}
    report = {"claude": claude_usage(a.project, t0, prices), "codex": codex_usage(a.project, t0, prices)}
    for name, d in extra:
        report[name] = claude_usage(a.project, t0, prices, d)
    matched = sorted({d for t in report.values() for d in t.get("dirs", [])})
    if len(matched) > 1:
        report["_matched_claude_dirs"] = matched
    report["_codex_note"] = "codex calls = requests; image generation is not in these token counts (read the Codex meter)"
    if a.json:
        print(json.dumps(report, indent=1)); return

    def line(label, t, usd):
        print(f"{label:22} {t['calls']:>7} {t['input']/1e6:>8.1f}M {t['cache_read']/1e6:>8.1f}M {t['cache_write']/1e6:>8.1f}M "
              f"{t['output']/1e6:>7.2f}M {('$%.2f' % usd) if usd is not None else 'n/a':>9}")
    print(f"{'cli / model':22} {'calls':>7} {'input':>9} {'cache_rd':>9} {'cache_wr':>9} {'output':>8} {'$ api-eq':>9}")
    notes = []
    for k, t in report.items():
        if k == "_codex_note":
            notes.append(t)
        elif k.startswith("_"):
            notes.append("counted these Claude project dirs (use --exclude to drop another run's worktree): " + ", ".join(t))
        else:
            line(k, t, t["usd_api_equivalent"])
            for m in sorted(t["models"]):
                line("  " + m, t["models"][m], t["models"][m]["usd"])
            if t.get("unpriced"):
                notes.append(f"{k}: no price in prices.json for {', '.join(t['unpriced'])}, so its $ is n/a")
    for n in notes:
        print("note: " + n)

if __name__ == "__main__":
    main()
