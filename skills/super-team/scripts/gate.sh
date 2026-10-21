#!/usr/bin/env bash
# The TL's merge gate. Merges <ref> into the main branch inside a throwaway worktree, runs the project's
# checks from team/gate.json, and fast-forwards main only if everything is green and nothing is held. Prints one JSON line.
#   usage: gate.sh <repo-root> <ref> [--dry-run] [--allow-binaries] [--allow-protected]
#   <repo-root> is the MAIN CHECKOUT (main must be checked out there), even if you run from a worktree.
#   Added, modified, renamed or copied binaries, or changes under protected paths, HOLD the merge (exit 4, main untouched) until you
#   have checked provenance / read the diff and re-run with the matching --allow-* flag. Binaries are listed with rename and copy
#   detection off, so a renamed (even renamed-and-modified) binary is an added path and cannot slip past as git status R or C.
# team/gate.json (see assets/templates/gate.template.json):
#   {"main":"main","install":"npm ci","checks":[{"name":"build","cmd":"npm run build","timeout":600,"enabled":true}],
#    "protected":["tools/play","src/agent"],"binaryPattern":"..."}
# Checks the gate runs must live in the repo (team/ is not in the temp worktree). "enabled":false stages a check for later.
# Check names must be unique (a check without a name is known by its cmd): a duplicate is a config error (exit 3), because results
#   and "covers" are keyed by name.
# Exit codes: 0 merged+green, 1 checks failed (main untouched), 2 merge conflict, 3 usage/config error,
#   4 checks green but held for TL review (newBinaries / protectedChanged without --allow-*; main untouched).
# Progress board: every run (any exit code) also writes team/gate/last.json (the result JSON plus time, ref, commit, config, verdict,
#   passed[], failed[], skipped[]) and appends one line {time, ref, commit, config, verdict, passed, failed, skipped} to team/gate/log.jsonl, then
#   refreshes team/state.js.
#   verdict: merged | green (checks passed, nothing merged: --dry-run) | held | failed | conflict | error.
#   commit: the full sha of the branch head being gated (<ref> peeled to a commit; null if <ref> does not resolve).
#   config: the sha256 of team/gate.json's bytes (null if the file is missing). The run reads those bytes once, at the start, into a
#     private temp file, then hashes, parses and runs that snapshot only (run_checks.py is given its path). An install step or a check
#     that rewrites team/gate.json mid-run therefore changes neither what runs nor the hash the run is logged under. A board binds a
#     result to a build with commit and to a check configuration with config; stdout carries neither.
#   A check may carry "covers": ["A1", ...] in gate.json: the spec ids it proves. Without a team/ folder this is skipped silently.
set -u
here=$(cd "$(dirname "$0")" && pwd)
merged=""   # set once the temp worktree has merged; record_gate falls back to the branch head before that
snap=""     # the private copy of team/gate.json this run hashes, parses and executes
tmp=""      # the throwaway worktree
cleanup() {
  if [ -n "$tmp" ]; then git -C "$repo" worktree remove --force "$tmp" >/dev/null 2>&1; rm -rf "$tmp"; fi
  if [ -n "$snap" ]; then rm -f "$snap"; fi
}
trap cleanup EXIT
# record_gate <verdict> <result-json>: keep the run for the progress board. Silent, never changes the exit code,
# and does nothing when the repo has no team/ folder.
record_gate() {
  [ -n "${repo:-}" ] && [ -d "$repo/team" ] || return 0
  # commit = the tested commit: the temp worktree's merge result, which a green run fast-forwards main to (it equals the
  # branch head when main hadn't moved). Before the merge exists (conflict, config error) it falls back to the branch head.
  python3 - "$repo/team/gate" "${ref:-}" "$1" "$2" "${merged:-${tip:-}}" "${cfg_sha:-}" "${tip:-}" >/dev/null 2>&1 <<'PYEOF' || true
import datetime, json, os, sys
gate_dir, ref, verdict, raw, commit, config, head = sys.argv[1:8]
try:
    res = json.loads(raw)
except Exception:
    res = None
if not isinstance(res, dict):
    res = {"raw": raw}
checks = res.get("checks") if isinstance(res.get("checks"), list) else []
passed = [c.get("name") for c in checks if isinstance(c, dict) and c.get("ok") is True]
failed = [c.get("name") for c in checks if isinstance(c, dict) and c.get("ok") is False]
skipped = [c.get("name") for c in checks if isinstance(c, dict) and c.get("ok") is None]   # disabled checks: never counted as passed
now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
# commit and config bind this result to a build and to a check configuration; null when unknown (ref did not resolve, no gate.json)
line = {"time": now, "ref": ref, "commit": commit or None, "head": head or None, "config": config or None, "verdict": verdict, "passed": passed, "failed": failed, "skipped": skipped}
out = dict(line)
out.update({k: v for k, v in res.items() if k not in out})
os.makedirs(gate_dir, exist_ok=True)
tmp = os.path.join(gate_dir, ".last.json.%d" % os.getpid())
with open(tmp, "w") as f:
    json.dump(out, f, indent=1)
    f.write("\n")
os.replace(tmp, os.path.join(gate_dir, "last.json"))
with open(os.path.join(gate_dir, "log.jsonl"), "a") as f:
    f.write(json.dumps(line) + "\n")
PYEOF
  # state.js is derived from these files, so refresh it now (--no-bump: a gate run is not TL activity)
  if [ -x "$repo/team/tools/st" ]; then "$repo/team/tools/st" touch --no-bump >/dev/null 2>&1 || true; fi
}
fail3() {
  local j; j=$(python3 -c 'import json,sys;print(json.dumps({"ok":False,"error":sys.argv[1]}))' "$1")
  echo "$j"; record_gate error "$j"; exit 3
}
[ $# -ge 2 ] || fail3 "usage: gate.sh <repo-root> <ref> [--dry-run] [--allow-binaries] [--allow-protected]"
repo=$(cd "$1" 2>/dev/null && pwd) || fail3 "repo not found: $1"
ref=$2
dry=false; allow_bins=false; allow_prot=false
for a in "${@:3}"; do
  case "$a" in
    --dry-run) dry=true ;; --allow-binaries) allow_bins=true ;; --allow-protected) allow_prot=true ;;
    *) fail3 "unknown option $a" ;;
  esac
done
cfg="$repo/team/gate.json"
# For the board's record: the commit this run gates and the check configuration it uses. Either is empty (recorded as null) when
# unknown. The ref is resolved again below, fatally and in the original order of the checks.
tip=$(git -C "$repo" rev-parse --verify -q "$ref^{commit}" 2>/dev/null) || tip=""
[ -f "$cfg" ] || fail3 "missing $cfg"
# Snapshot gate.json's bytes once, here, before anything else reads them. The hash, the parse and the checks below all use the
# snapshot and never reopen team/gate.json, which an install step or a check can rewrite: what is logged under a config hash is
# then exactly what ran. Read-only, and removed on every exit by cleanup.
snap=$(mktemp "${TMPDIR:-/tmp}/gate-config.XXXXXX") || { snap=""; fail3 "cannot create a temp file for $cfg"; }
cp "$cfg" "$snap" 2>/dev/null || fail3 "cannot read $cfg"
chmod 400 "$snap" 2>/dev/null || true
cfg_sha=$(python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$snap" 2>/dev/null) || cfg_sha=""
# Parse and validate the snapshot once; emit shell assignments.
conf=$(python3 - "$snap" <<'EOF'
import json, shlex, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print(json.dumps({"ok": False, "error": f"gate.json is not valid JSON: {e}"})); sys.exit(3)
checks = d.get("checks", [])
if not isinstance(checks, list) or any(not isinstance(c, dict) or not isinstance(c.get("cmd"), str) or not c["cmd"].strip() for c in checks):
    print(json.dumps({"ok": False, "error": "gate.json: every check needs a non-empty string 'cmd'"})); sys.exit(3)
seen = set()
for c in checks:   # results and "covers" are keyed by name (a check without one is known by its cmd), so a name may appear only once
    key = json.dumps(c.get("name", c["cmd"]), sort_keys=True)
    if key in seen:
        print(json.dumps({"ok": False, "error": f"gate.json: duplicate check name {key}: check names must be unique (results and covers are keyed by name)"})); sys.exit(3)
    seen.add(key)
prot = d.get("protected", [])
if not isinstance(prot, list) or not all(isinstance(p, str) for p in prot):
    print(json.dumps({"ok": False, "error": "gate.json: 'protected' must be a list of paths"})); sys.exit(3)
default_pat = r"\.(ttf|otf|woff2?|mp3|wav|ogg|m4a|png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|mov|glb|gltf|fbx|obj|ktx2|hdr|exr)$"
print("main=" + shlex.quote(str(d.get("main", "main"))))
print("install=" + shlex.quote(str(d.get("install", ""))))
print("pattern=" + shlex.quote(str(d.get("binaryPattern", default_pat))))
print("prot=(" + " ".join(shlex.quote(p) for p in prot) + ")")
EOF
) || { echo "$conf"; record_gate error "$conf"; exit 3; }
eval "$conf"
cd "$repo" || fail3 "cannot cd to $repo"
head_branch=$(git symbolic-ref --short -q HEAD || echo "")
[ "$head_branch" = "$main" ] || fail3 "the main checkout has '${head_branch:-detached HEAD}' checked out, not '$main'; pass the main checkout's path"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then fail3 "main checkout has uncommitted changes"; fi
base=$(git rev-parse --verify -q "$main") || fail3 "unknown main branch $main"
tip=$(git rev-parse --verify -q "$ref^{commit}") || fail3 "unknown ref $ref"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/gate.XXXXXX")
git worktree add --detach "$tmp" "$base" >/dev/null 2>&1 || fail3 "worktree add failed"
cd "$tmp"
if ! git merge --no-edit "$tip" >/dev/null 2>&1; then
  files=$(git diff --name-only --diff-filter=U | python3 -c "import sys,json;print(json.dumps(sys.stdin.read().split()))")
  git merge --abort >/dev/null 2>&1
  out="{\"ok\":false,\"conflict\":true,\"files\":$files}"
  echo "$out"; record_gate conflict "$out"; exit 2
fi
merged=$(git rev-parse HEAD)
# Binaries: every path the merge adds or modifies. Rename and copy detection are OFF (--no-renames also overrides a diff.renames=copies
# config): a renamed binary, even one modified enough to stay R099, is then an added path instead of a status the filter skips.
# -z keeps git from quoting names with non-ASCII or control characters ("caf\303\251.png" would end in a quote and dodge a \.png$ pattern).
new_bins=$(git diff -z --no-renames --name-only --diff-filter=AM "$base" "$merged" | tr '\0' '\n' | grep -a -E -i "$pattern" | python3 -c "import sys,json;print(json.dumps([p for p in sys.stdin.buffer.read().decode('utf-8','surrogateescape').split('\n') if p]))")
prot_changed='[]'
if [ ${#prot[@]} -gt 0 ]; then prot_changed=$(git diff --name-only "$base" "$merged" -- "${prot[@]}" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read().splitlines()))"); fi
# dependencies: reuse main's node_modules unless the manifest changed
if [ -d "$repo/node_modules" ] && git diff --quiet "$base" "$merged" -- package.json package-lock.json 2>/dev/null; then
  ln -s "$repo/node_modules" node_modules
elif [ -n "$install" ]; then
  sh -c "$install" >/dev/null 2>&1 || { out='{"ok":false,"error":"install failed"}'; echo "$out"; record_gate error "$out"; exit 1; }
fi
allok=true
results=$(python3 "$here/run_checks.py" "$snap") || allok=false   # the snapshot, not team/gate.json: install may have rewritten that
case "$results" in \[*) ;; *) results='[]'; allok=false ;; esac
cd "$repo"
hold=""
[ "$new_bins" != "[]" ] && ! $allow_bins && hold="newBinaries"
[ "$prot_changed" != "[]" ] && ! $allow_prot && hold="${hold:+$hold,}protectedChanged"
ff=false
if $allok && ! $dry && [ -z "$hold" ]; then
  if git merge --ff-only "$merged" >/dev/null 2>&1; then ff=true; else allok=false; fi
fi
out="{\"ok\":$allok,\"merged\":\"${merged:0:9}\",\"fastForwarded\":$ff,\"held\":\"$hold\",\"newBinaries\":$new_bins,\"protectedChanged\":$prot_changed,\"checks\":$results}"
echo "$out"
if ! $allok; then gv=failed; elif $ff; then gv=merged; elif [ -n "$hold" ] && ! $dry; then gv=held; else gv=green; fi
record_gate "$gv" "$out"
# Log the verdict to the dashboard so the TL doesn't spend a call on it (no-op without team/tools/st).
if [ -x "$repo/team/tools/st" ] && ! $dry; then
  verdict=$($allok && { [ -n "$hold" ] && echo "held ($hold)" || { $ff && echo "merged" || echo "green, not fast-forwarded"; }; } || echo "FAILED")
  "$repo/team/tools/st" decision "gate $ref -> $verdict (${merged:0:9})" >/dev/null 2>&1 || true
fi
$allok || exit 1
if [ -n "$hold" ] && ! $dry; then exit 4; fi
exit 0
