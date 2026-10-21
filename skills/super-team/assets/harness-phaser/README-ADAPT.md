# Phaser harness template — how to adapt

This is a working harness taken from a shipped Phaser 3 + Vite project. If you want scripted testing, copy `tools/play/` and `src/agent/` into the new game and adapt them early in phase 1. It's much faster than rebuilding it.

## In-game side (`src/agent/`)
`agentMode.ts` imports four project modules. Provide them (or change the imports):
- `../core/events`: `getFrame`, `setFrame`, `setAgentMode`. A frame counter, plus a global event log `window.__AGENT_EVENTS__` that every gameplay moment writes to via `agentEvent(type, name, data)`.
- `../core/registry`: `readDebug()` (score, lives, bombs, ammo, credits, player state), `invuln` + `setInvulnFlag` (protects the player only), `getMission()`.
- `../core/params`: parsed URL params (`agent`, `seed`, `skipintro`, `mission`, `checkpoint`, `invuln`, `mute`, `audiorec`).
- `../game/tuning` (`VIEW_WIDTH`) and `../vehicles/vehicles` (`isPlayerAboardTank`). Remove the vehicle import if the game has no vehicles, or point it at the equivalent.

`sceneState.ts` has no project imports. It reports the live scene and holds lockstep stepping until asset loading is idle.

## Node side (`tools/play/`)
- `play.mjs` commands: `serve`, `start`, `step`, `shot`, `stop`, `record`, `replay`, `detect`, `bot`, `smoke`, `invuln`.
- `lib/detect.mjs` reads `trace.jsonl`. Keep the trace field names (`player`, `boss`, `cam`, …) or update the detectors.
  - Keep `paused` in the trace (`agentMode.ts` and the `trace` polyfill in `lib/replay.mjs` write it from the game's pause flag; rename `pausedGame` to yours). The softlock check skips a stretch only when the trace says outright that it is not play: `paused`, a scene that is not in `SOFTLOCK.playScenes`, or a non-play `uiPhase`/`phase`. `player.controllable` and `player.alive` do not skip a stretch: a player who cannot act for ten seconds goes to the game's `canRecover` hook, so a pause that only shows up as `controllable: false` would be judged as a stun.
- **Game-specific, rewrite these:**
  - `play.mjs` `cmdSmoke` phase (b): a scripted full-level route to a named boss's defeat event (`brassback-*`, `longhaul-*`). Use the new game's levels and event names.
  - `lib/bot.mjs` `full` mode: scripted routes. Keep them as data in a committed folder, e.g. `tools/play/routes/<level>.txt` (`readRoute(<level>)` reads it relative to cwd), not in code and not in `team/scripts/`: the gate runs in a temp worktree that holds only committed files.
  - The detector thresholds: HUD height, stuck/softlock frames.
- Needs Node ≥ 20, the `playwright` dev dependency (it uses installed Chrome via `channel: 'chrome'` or the cached Playwright Chromium), and `ffmpeg` for `record`/`replay`.

## Keep these properties when adapting
- Determinism: same seed + same inputs give identical frames. Add a determinism check: same seed and script twice, diff `trace.jsonl`.
- One frame counter, live and in replay (`getFrame`): the input log indexes assist switches (`invuln --on|--off`) by it, and `replay` applies each when it reaches that number.
- `start` returns at frame 1 with untouched game state, even when assets load asynchronously.
- Every claim a bot or worker makes is checkable from `trace.jsonl` and the event log.

## Phaser ≥ 3.60: tweens in lockstep
The TweenManager reads `Date.now()`, so tweens freeze or jump while `?agent=1` stops the clock. In agent mode, patch the scene's tween manager so it advances by the stepped 1/60 s per `step()`. Check by recording a tween in lockstep and comparing it against real time.
