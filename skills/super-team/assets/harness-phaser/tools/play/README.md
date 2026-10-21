# play harness: bots, replays and detectors

`tools/play/` drives the built game in lockstep with **real key presses**: a key script advances an exact number of frames. Every session writes an input log (`.play/<session>.log.jsonl`) that replays to video plus a per-frame `trace.jsonl`, and the detectors read those. Scripted bots and seeded fuzzers run it at zero tokens; the TL uses `start`/`step` to reproduce a bug. Also runnable as `npm run play -- <cmd>`. `<cmd> --help` prints usage and exits 0 without running anything.

## Commands

| Command | What it does |
|---|---|
| `serve --dist <dir> [--port 8901]` | Serves the build as static files, for a look by hand |
| `start --session <name> [--dist <dir>] [--params "mission=1&seed=1"] [--scale 2] [--log-dir .play] [--assist invuln]` | Starts a lockstep session (`?agent=1`) in a detached browser; prints `{session, ok, assisted}`. With `--assist invuln` the session is named `<name>-assisted` |
| `step --session <s> --seq "<script>" [--shot <png>] [--contact <n> --contact-out <png>]` | Runs a key script; prints `{frame, scene, events, errorCount, assisted}`, plus an optional screenshot or n-frame contact sheet |
| `shot --session <s> --out <png>` | Screenshots the current frame (canvas only, 608x448 at scale 2). In an assisted session the file is `<name>-assisted.png` |
| `stop --session <s>` | Ends the session and clears its session file |
| `invuln --session <s> [--on\|--off]` | Toggles the invulnerability switch (protects the player only); for repro, never for scoring. Each switch is written to the session's input log with its frame; the output carries `assisted`, and a session that has had it on stays assisted, also after it stops |
| `record --dist <dir> --params "..." --seq "<script>" --out <mp4\|webm> [--scale 2] [--assist invuln]` | Records a realtime (not lockstep) clip; `audiorec=1` in `--params` muxes the game audio. With `--assist invuln` the clip is written as `<name>-assisted.<ext>` |
| `bot --dist <dir> --mode full\|fuzz [--seed N] [--params "..."] [--frames F] [--log-dir .play] [--assist invuln]` | `full` plays the level's scripted route (committed in `tools/play/routes/<name>.txt`); `fuzz` plays F frames of seeded plausible input. Unassisted unless asked. Prints a JSON summary with the session log path and `assisted` |
| `replay --log <session.log.jsonl> --dist <dir> --out <folder>` | Re-runs a session log frame by frame, assist switches at the frames they were logged at: `frames/`, `trace.jsonl` and a 60 fps `video.mp4`. For an assisted log they are `trace-assisted.jsonl` and `video-assisted.mp4`. Checks the log first and never replaces anything: a folder that already holds a replay keeps it and the new files get `-2`, `-3` ... names (see below) |
| `detect --rec <folder> [--run <n>] [--hook <module.mjs>] [--strict-suspects]` | Runs the detectors on a replay folder: `anomalies.json`, `suspects.json`, `clips/` (sheet per anomaly), `overview/` (one sheet per 10 s) and `summary.md` (`summary-assisted.md` etc. for an assisted run). `--run n` reads run n of a folder that holds several replays (`trace-n.jsonl`, `frames-n/`) and writes `summary-n.md` etc. |
| `smoke --dist <dir> --out <folder> [--phase a\|b] [--expect-kills N] [--assist invuln]` | The gate: (a) normal play, unassisted: no errors, a kill, every death paired with a respawn; (b) with `--assist invuln` only, an assisted completion run within a frame budget. Exits 0/1 with a JSON summary |

## One record round

```sh
node tools/play/play.mjs bot --dist ./dist --mode full --params "mission=1" --log-dir rec
node tools/play/play.mjs bot --dist ./dist --mode fuzz --seed 7 --frames 18000 --log-dir rec
node tools/play/play.mjs replay --log rec/<session>.log.jsonl --dist ./dist --out rec/full-m1
node tools/play/play.mjs detect --rec rec/full-m1
```

Use the same seeds every round, so the numbers compare across rounds. Replay into a new folder per round (evidence is never deleted; see the next section for what happens when you replay into a folder twice). A reviewer can get `summary.md`, `overview/` and the flagged `clips/` as extra evidence next to its own use of the game, not the raw frames, and only from unassisted runs (next section).

## The input log, and replays that never destroy evidence

Every session appends to `<log-dir>/<session>.log.jsonl`, one JSON object per line: a `start` entry (dist, params, seed), a `step` entry per `step` (the script, and the game's frame counter before and after), and an `assist` entry whenever an assist is switched while the session runs (`invuln --on|--off`, or smoke's completion run): `{"event":"assist","assist":"invuln","on":true,"frame":120}`. The daemon writes the assist entry **before** it flips the switch, and refuses the switch if it cannot write it, so an assisted frame never exists without its record. The log is the run's record: `replay` plays it back, each assist switch at the frame it was logged at, and whether a run counts as assisted is read from it (the start params and every assist entry), never from state a session loses when it stops.

`replay` never replaces, renames or deletes anything that is already in `--out`:

1. **It checks the whole log first**: every line must be JSON, every step script must parse, every assist entry must be `{assist, on, frame}`, there must be a start and a step, and the dist folder must exist. A bad log is refused with the file and line named, while nothing has been touched, not even `--out`. **The log is read once**, and that read is the snapshot the whole replay works from: what it runs, whether the run is assisted and what the files are called all come from it, and nothing opens the log again. A session that is still appending to the log (a step, an `invuln --on`) cannot make the frames and the labels disagree; what is appended after the read belongs to the next replay.
2. **It replays into a fresh `attempt-*` folder inside `--out`**, so nothing it does can reach the files already there (`runReplay` itself also refuses to write over an existing `trace.jsonl`, `video.mp4` or frame). `runReplay` takes the parsed log (`input: readInputLog(file)`), never a path.
3. **Only a finished replay is published**, to the first free *run* of the folder: run 1 is `trace.jsonl`, `video.mp4`, `frames/`; run 2 is `trace-2.jsonl`, `video-2.mp4`, `frames-2/`; and so on, with the `-assisted` mark always last (`trace-2-assisted.jsonl`). A run is taken as soon as anything of it is there, in either flavour. The result names what was used: `run`, `trace`, `video`, `frames`, `outDir`, and `assistApplied` (each switch, the frame it was logged at and the frame it was applied at; `assistNotApplied` lists any logged after the last frame the replay reached). `detect --rec <outDir> --run <run>` reads it.

A replay that dies half way keeps what it wrote in its `attempt-*` folder (named in the error, `-assisted`-marked if the log is): a partial recording is still a recording. The earlier files stay byte-identical. Nothing in the harness removes these folders; that is for a person to decide.

## Assisted runs

Nothing is assisted unless you ask. Invulnerability (`--assist invuln`, `invuln=1` in `--params`, or the live `invuln` command) protects the player only, but a run that survives with it says nothing about normal play or balance.

- **No default.** No bot, mission or level turns an assist on by itself: `bot --mode full` plays mission 1 and mission 2 unassisted, and `smoke` runs phase (a) only. Phase (b), the completion run, plays under invulnerability, so it needs `--assist invuln`; naming `--phase b` without it is an error.
- **Everything an assisted run writes is marked**, so judged evidence can leave it out by name or by field: the JSON summary has `"assisted": true`; the session log is `<session>-assisted.log.jsonl`; `record` writes `<name>-assisted.<ext>`; `replay` of an assisted log writes `trace-assisted.jsonl` and `video-assisted.mp4`; `detect` on those writes `summary-assisted.md`, `anomalies-assisted.json` and `suspects-assisted.json`, and the summary opens with an ASSISTED RUN banner; smoke's phase (b) shots are `b-*-assisted.png` and `contact-assisted.png`. Setting `invuln=1` by hand in `--params` counts as `--assist invuln`, so no run with the switch on comes out unmarked; a live session that has had the `invuln` switch on stays assisted for good: the switch is in the input log, so `step` and `shot` report `assisted` and write `-assisted.png` files, and a replay of that log is `trace-assisted.jsonl` and `video-assisted.mp4` with `"assisted": true` and the switches re-applied at their frames, also after the session has stopped. A run (slot) of a folder holds one flavour: `replay` puts an assisted replay beside a plain one as run 2 (`trace-2-assisted.jsonl`) and never clears the other, and `detect` refuses a run whose plain and assisted files are both there.
- **Normal-play acceptance and judged evidence use unassisted runs. Assisted runs are coverage only**: they show that a route reaches the end and that the scenes, bosses and events fire, never that a player can complete the level or that it is balanced. A spec's completion claim needs an unassisted run that gets there (a bot route that survives, or the owner's play). In `team/gate.json`, give the assisted smoke its own check and keep it out of the `covers` of a normal-play acceptance id.

```sh
node tools/play/play.mjs smoke --dist ./dist --out smoke-out                        # normal play only: the acceptance check
node tools/play/play.mjs smoke --dist ./dist --out smoke-out-assisted --assist invuln   # adds the assisted completion run: coverage only
node tools/play/play.mjs bot --dist ./dist --mode full --params "mission=1" --log-dir rec --assist invuln   # rec/<session>-assisted.log.jsonl
```

## Detectors

`detect` flags, from the trace and the video: `stuck`, `invisible`, `offscreen-player`, `offscreen-boss`, `teleport`, `unseen-death`, `hud-overlap`, `flash`, `black`, and `softlock` (only when the game confirms it, below). Thresholds and trace field names are game-specific: tune them in `lib/detect.mjs`. Give each new detector a negative control before it gates anything.

Findings go to `anomalies.json` and count: they are what the TL and the judge act on. Suspicions go to `suspects.json` and to their own `summary.md` section; they do not count as anomalies unless `--strict-suspects` is given.

**Softlock is a suspicion first.** "No progress while a key is held" also describes a player pressed against a wall, a pause menu with a key down and a puzzle that wants a wait, so `detect` does not call it a softlock. It measures movement as the cumulative path length of the live-play frames over a 10 s window (start versus end position would call a loop or an out-and-back "stuck"); wobble under 1.5 px is not movement. It skips only what the trace says outright is not play: a pause flag (`paused`), a scene other than `Game` (menus, game over, credits ...) or a non-play UI phase (`uiPhase`, `phase`, `screen`, ...), and only fields the trace has. **Losing control is not skipped**: a player who is stunned, frozen, dead or stuck in a cutscene that never ends (`player.controllable` or `player.alive` false) for a whole window while inputs are held is what this check is for, so those frames count, and `canRecover` decides (below); `ctx.uncontrollableFrames` says how much of the stretch the trace marked the player as not controllable. That is why the trace carries the pause as its own `paused` flag, and why a pause that only shows up as `controllable: false` would be judged as a stun. A window with no scene change, no score change and almost no path is reported as `softlock-suspect` in `suspects.json`; overlapping windows merge into one entry.

To confirm a real, blocking `softlock`, give the project a recovery predicate: `tools/play/hooks.mjs` (found next to `play.mjs`) or `detect --hook <module.mjs>`, exporting `canRecover(ctx)`. `ctx` has the stretch's `traces`, `first`, `last`, `startFrame`, `endFrame`, `frames`, `playFrames`, `uncontrollableFrames`, `pathPx` and `heldKeys`. Return `false` (or `{recoverable: false, reason}`) when no permitted input or action gets the player out: the suspect becomes a `softlock` in `anomalies.json`. Return `true` when the game can recover: the suspicion is dropped. Anything else, a throw or no hook leaves it a suspect. Give the predicate a negative control too: a trace that is stuck but recoverable (a stun that ends), one that is stuck for good, and a genuine pause that must not reach it.

## Key script syntax

Tokens separated by spaces: `<keys>*<frames>`. Keys joined with `+`. `.` means no keys. Names: `left right up down z x c enter 5 esc`.

```sh
--seq "right*30 right+z*4 .*2 right+z*4 x*1 right*20 c*1 .*30"
```

A key held across consecutive tokens **stays down** (no re-press); a key absent from the next token is **released**. So `right*30 right+z*4` walks right for 30 frames, then shoots while walking for 4. Taps need gaps: `z*2 .*2 z*2` fires twice, while `z*4` is one press held 4 frames. In the template game, `z` shoots, `x` jumps, `c` throws a grenade, `5` inserts a coin and `enter` starts; remap for your game.

## Reproducing a bug by hand

```sh
node tools/play/play.mjs start --session run1 --dist ./dist --params "mission=1&seed=1"
node tools/play/play.mjs step --session run1 --seq "5*5 .*10 enter*5 .*150"
node tools/play/play.mjs step --session run1 --seq "right*120 right+z*60 x*1 right*60" --contact 6 --contact-out run1.png
node tools/play/play.mjs stop --session run1
```

- `events` drains the game's `window.__AGENT_EVENTS__` since the last step (pickups, deaths, checkpoints, scene changes). A nonzero `errorCount` is a bug.
- `--contact` captures n frames evenly across the script into one labeled grid. Use it for any movement longer than about 60 frames, because one frame hides motion.
- The session's input log replays to the same frames (same seed, same inputs), so a repro becomes a `replay` + `detect` check.
