# Adapter: browser game (2D, canvas/WebGL)

Know-how for browser games from past runs. None of it is required: you decide what to use.

## Defaults that worked
- **Stack:** Phaser 3 (exact version) + TypeScript + Vite with `base: './'`. Use native resolution with integer scaling, `pixelArt: true` for pixel art, and a fixed-timestep simulation (update at 1/60 s from an accumulator, render with interpolation), so speed never depends on the display's refresh rate. A frame-rate cap (`fps.limit`) is only a stopgap until the fixed timestep lands. Never rely on `fps.target` alone (lesson 14).
- **Tuning:** all feel numbers in one tuning file and names in one names file, so tuning numbers from feedback drop straight in.
- **Ownership:** split scenes early (level/flow, combat/enemies/bosses, vehicles, audio, art pipeline, harness), so no single scene file becomes a merge hotspot (lesson 12).

## Agent mode (a test contract, if you want scripted tests)
- **Loop:** with `?agent=1`, the game's loop is stopped and `window.__AGENT__.step(n)` advances exactly n frames at a fixed 1/60 s.
- **Input:** key events come from Playwright between steps and are real Phaser input, not faked.
- **Loading:** `start` waits for asset loading, then resets the frame counter, so the first step returns frame 1 with untouched state (lesson 5).
- **Events:** every moment a player would see or hear goes to an event log: `sfx`, `music`, `voice` (text), `death`, `pickup`, `checkpoint`, `boss`, `scene`, `missionComplete`, `gameOver`.
- **Hooks:**
  - `__AGENT__.debug()` returns state for gates;
  - `__AGENT__.trace()` returns per-frame state for detectors (player x/y/visible/alive/controllable/invuln, camera, key actors such as a boss: x/y/onCamera/hp, counts, held keys);
  - URL params `seed`, `skipintro`, `level|mission`, `checkpoint`, `invuln` (protects the player ONLY, lesson 9) and `mute`.
- **Template:** `assets/harness-phaser/` contains a working harness (`tools/play`: start/step/shot/stop/record/replay/detect/bot/smoke) and the in-game agent mode (`src/agent`). See its README-ADAPT.md for what to rename and rewrite (the registry API, scripted routes, smoke legs).

## Gate (`team/gate.json`)
If you use the gate: smoke asserts the visible UI state per phase (title → play → pause → results), not just the simulation state. Every harness script supports `--help` with no side effects.

Map each check to the spec's acceptance ids with `"covers": ["A1", …]`; the board shows each id's status from the last gate run. On a shared machine, run one heavy browser gate at a time, use the GPU for WebGL checks, and re-run a timeout once before calling it a code failure.

`typecheck`, `build`, `smoke`:
- **Normal play:** no console or page errors, a kill or score, every death paired with a respawn.
- **Completion run:** play to the end condition (e.g. boss defeated, last puzzle solved) without assists, and assert that completion follows it and that the actors it depends on are visible and on camera. An `invuln` run is coverage only: label it assisted (`--assist invuln`) and keep it out of judged evidence.

Each feature adds an assertion.

## Bots and evidence (zero tokens)
- **Runs:** `bot --mode full` per level (scripted routes committed in `tools/play/routes/<level>.txt`, not in `team/scripts/`, because the gate runs only committed files) plus `bot --mode fuzz` for 5 minutes per level with fixed seeds. Use the same seeds every round so the numbers are comparable.
- **Processing:** replay each to 60 fps video, then `detect`, which flags:
  - stuck, invisible, off-camera player or key actor (e.g. a boss);
  - teleport, death with no visible attacker;
  - HUD overlap, flash or black frames, errors;
  - no-progress stretches, as softlock suspects: only the game's own recovery predicate confirms a softlock, because a pause, a wall or a loop back to the start also shows no net progress.
  - **judder** (any real-time camera or scrolling game): sample the rendered, interpolated transforms of the camera, the player and the world once per display frame, at the real rate and at an emulated 120 Hz. Per-step simulation traces can't see an ignored interpolation. Fix the metric and its limit in round 1 from a known-good trace and a broken-interpolation control, and log them in the spec. With a deterministic emulated clock, simulation steps per display frame follow the expected cadence (1 at 60 Hz; alternating 0 and 1 at 120 Hz, after start-up). On real display timing, check instead that simulated time tracks elapsed time with bounded catch-up: 0- or 2-step frames there aren't failures. Measure from samples, not video: low-fps captures hide real judder and can fake it. In one run, a camera feedback loop and a `draw(alpha)` that ignored alpha passed the gate, the judge and the TL's replay, and the owner saw the shake at once.
- **Evidence for reviewers:** clips around each anomaly, one overview contact sheet per 10 s, and a short clip of ordinary motion, because stills and anomaly clips can't certify feel. When sound matters, give recordings a soundtrack (e.g. render the logged audio events offline and mux them in), or the audio judge has nothing to hear.
- **Robustness:** `trace()` and the detectors must work in every scene, including game over and credits.

## Art and audio without downloads
- **Image model output:** sprite sheets on magenta with grid, manifest and caps.
- **Pipeline:** chroma key with despill, then one scale per character from the standing height (never fit-to-cell), a per-sheet palette (snap to anchors only when close), outline and despeckle, atlas plus anims, and a preview page.
- **Never fix a built atlas:** change the pipeline input instead (lesson 13).
- **Audio gate:** vision models can't hear, so measure the real mix in the browser (a MediaRecorder on the master bus, then ffmpeg `volumedetect` and `silencedetect`) and gate on sane levels. One run shipped at -41.5 dB until this check caught it.
- **Audio:** WebAudio synthesis for SFX and music; local TTS (e.g. macOS `say` + ffmpeg) for announcer and voice. A master compressor; music ducks under voice.

## 3D games (Three.js / WebGL / WebGPU)
The Phaser template doesn't apply. If you want scripted testing, build the same contract early in phase 1, reusing `tools/play`'s command shape:
- **Deterministic loop:** a fixed-timestep simulation (1/60 s) separate from rendering. `?agent=1` stops the clock, `__AGENT__.step(n)` advances n steps, and `seed` fixes every random source (spawns, particles that affect gameplay, procedural terrain).
  - `step()` must run the same per-frame path as the real loop, including UI and phase hooks, DOM updates and timers. Only the clock differs. A step that skips the UI hooks once left a title card over every recorded run.
  - In agent mode, disable CSS transitions or advance real time before capturing, because CSS fades don't paint in lockstep captures.
  - Engine tweens and timers may read the wall clock (Phaser ≥ 3.60's TweenManager uses `Date.now()`). Drive them from the stepped clock in agent mode, e.g. by patching the tween manager's delta to a fixed 1/60 s, or they freeze or jump in lockstep.
- **Trace:** per step, record the key objects' world positions and their projection onto the screen (NDC within ±1, in front of the camera, plus projected size in px), the camera pose, velocities, the game state, and the visible UI phase (which DOM screen is showing). Detectors use these: player on screen, no NaN or Infinity, no tunnelling through colliders, no falling out of the world, objectives reachable.
- **Bot:** a steering controller that follows the authored path (waypoints, rings, a track spline) using the same input API as the player, so a scripted full run proves the level can be completed.
- **Real-time check:** headless Chromium renders on a software GPU, so frame times there mean nothing. Measure median and p95 frame time in headed Chrome with the GPU on, for 20–30 s of normal play. Assert that game speed doesn't depend on refresh rate (the same input over the same wall time covers the same distance).
- **Renderer check:** before trusting any frame time, judder number or recording, read the WebGL renderer (`WEBGL_debug_renderer_info`, `UNMASKED_RENDERER_WEBGL`). SwiftShader or llvmpipe means software rendering, and those numbers are void.
- **Browser robustness:** resizing keeps the view and the HUD intact. `visibilitychange` pauses the game, and the fixed-step accumulator is clamped on return, so the simulation doesn't jump ahead. A forced context loss (`WEBGL_lose_context`) recovers. The first `pageerror` fails the run.
- **Draw calls:** read `renderer.info.render.calls` during play and gate on the spec's budget (default 300 on desktop, 150 on phone).
- **Evidence:** record in headed Chrome with the GPU on (headless software rendering captures at about 6 fps), using Playwright `recordVideo` or canvas capture plus ffmpeg, at a fixed size. Sample contact sheets by time and check that consecutive sheets differ.
- **Composition numbers:** turn the look into numbers (e.g. the hero's on-screen size and key objects' px size at gameplay distance), and add a detector for them. Make contact sheets every 2–3 s. Give reviewers the video for feel, and the sheets for composition and palette.
- **From a super-pm spec:** ART.md's sizes on screen become the projected-size detector's thresholds, and concept/chosen.png is the reviewer's reference.
- **Art:** the artist makes textures, skyboxes or gradients, decals, the logo and UI. Geometry is procedural or built from primitives in code, never downloaded models. Lock the palette and toon-shading or post-processing parameters in the tuning file, so tuning numbers from feedback drop straight in.
