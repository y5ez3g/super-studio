#!/usr/bin/env bash
# Scaffolds the team/ folder (dashboard, state, gate config) inside a project repo.
#   usage: init_team.sh <repo-root> [--rounds <N>] [--until <HH:MM or ISO time> | --hours <h>] [--no-refresh]
# Creates team/{tools,specs,rounds,builds,art}, copies the dashboard + tools, writes state.json from the template (startedAt=now;
# phase planning; roundsMax=N, the most improvement rounds, or null for no cap; endsAt=the time limit, or none), gate.json from the
# template if missing, keeps team/ out of git via .git/info/exclude, and starts the board's refresh loop (tools/collect-loop.sh:
# st touch --no-bump every minute; it stops itself when the phase is done). --no-refresh skips the loop (tests); a loop already
# running is kept.
set -eu
repo=${1:?usage: init_team.sh <repo-root> [--rounds N] [--until TIME | --hours H] [--no-refresh]}; shift
hours=""; until=""; rounds=""; refresh=1
die() { echo "init_team.sh: $*" >&2; exit 3; }
repo_arg=$repo; repo=$(cd "$repo" 2>/dev/null && pwd) || die "no such folder: $repo_arg"   # absolute, so paths survive the cd below
while [ $# -gt 0 ]; do
  case "$1" in
    --no-refresh) refresh=0; shift; continue;;
    --cycles) die "--cycles was replaced by --rounds in v0.11";;
    --hours|--until|--rounds) { [ $# -ge 2 ] && [ -n "$2" ]; } || die "$1 needs a value";;
    *) die "unknown option: $1";;
  esac
  case "$1" in --hours) hours=$2;; --until) until=$2;; --rounds) rounds=$2;; esac
  shift 2
done
[ -z "$rounds" ] || case "$rounds" in [1-9]|[1-9][0-9]) ;; *) die "--rounds must be a whole number from 1 to 99";; esac
[ -z "$hours" ] || [ -z "$until" ] || die "give --until or --hours, not both"
here=$(cd "$(dirname "$0")/.." && pwd)
team="$repo/team"
mkdir -p "$team/tools" "$team/specs" "$team/rounds" "$team/builds" "$team/art"
cp "$here/assets/dashboard/dashboard.html" "$team/"
cp "$here/assets/dashboard/"{state.mjs,collect-loop.sh,quota-codex.mjs,st} "$team/tools/"
chmod +x "$team/tools/"*.sh "$team/tools/st"
[ -f "$team/PLAN.md" ] || printf '# Plan\n\n## Product\n\n## Team (model, why)\n\n## Phases\n\n## Rules\n' > "$team/PLAN.md"
[ -f "$team/gate.json" ] || cp "$here/assets/templates/gate.template.json" "$team/gate.json"
if [ ! -f "$team/state.json" ]; then
  python3 - "$here/assets/templates/state.template.json" "$team/state.json" "$rounds" "$until" "$hours" <<'EOF' || exit 3
import json, sys, datetime
src, dst, rounds, until, hours = sys.argv[1:6]
now = datetime.datetime.now().astimezone()
s = json.load(open(src))
s["startedAt"] = now.isoformat(timespec="seconds")
s["roundsMax"] = int(rounds) if rounds else None       # no cap unless the owner gave one
ends = None                                          # no time limit unless the owner gave one
try:
    if until and len(until) <= 5:                    # HH:MM: the next time the clock shows it
        h, m = (int(x) for x in until.split(":"))
        ends = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if ends <= now: ends += datetime.timedelta(days=1)
    elif until:
        ends = datetime.datetime.fromisoformat(until)
        ends = ends if ends.tzinfo else ends.astimezone()
    elif hours:
        ends = now + datetime.timedelta(hours=float(hours))
except ValueError as e:
    sys.exit("init_team.sh: bad --until or --hours value (%s)" % e)
if ends is not None and ends <= now: sys.exit("init_team.sh: the time limit is in the past")
s["endsAt"] = ends.isoformat(timespec="seconds") if ends else None
json.dump(s, open(dst, "w"), indent=1)
EOF
fi
# .git is a file inside a worktree, so ask git where the shared info/exclude lives.
gd=$(git -C "$repo" rev-parse --git-common-dir 2>/dev/null || true)
if [ -n "$gd" ]; then case "$gd" in /*) ;; *) gd="$repo/$gd";; esac; mkdir -p "$gd/info"; grep -qx "team/" "$gd/info/exclude" 2>/dev/null || echo "team/" >> "$gd/info/exclude"; fi
"$team/tools/st" touch
# The refresh loop: one per team/, kept if it's already running. `;` (not `&&`) so that only the loop is backgrounded;
# nothing may keep the caller's stdout open.
pidf="$team/tools/collector.pid"
if [ "$refresh" = 1 ] && ! { [ -f "$pidf" ] && ps -o command= -p "$(cat "$pidf")" 2>/dev/null | grep -q collect-loop.sh; }; then
  ( cd "$team/tools" || exit 1; nohup bash collect-loop.sh </dev/null >/dev/null 2>&1 & echo $! > "$pidf" ) </dev/null >/dev/null 2>&1
fi
echo "team/ ready: open $team/dashboard.html"
