// Anomaly detector for play recordings (RECORD-PIPELINE Part 3).
// Pure code analysis on trace.jsonl + video frames.
// Generates anomalies.json, suspects.json, clips/<frame>_<type>.png, clips/<frame>_<type>_x3.png,
// overview/<n>.png, and summary.md.
//
// anomalies.json holds findings: what the TL and the judge must act on (blocking). suspects.json holds suspicions that
// only deserve a look (non-blocking unless strictSuspects asks otherwise); today that is `softlock-suspect`.
// A recording of an assisted run has trace-assisted.jsonl / video-assisted.mp4; everything detect writes for it is marked
// too: summary-assisted.md, anomalies-assisted.json, suspects-assisted.json, `assisted: true` in the result.
// A folder can hold several replays (replay never replaces one): run 1 has the plain names, run N > 1 has -N before the
// extension (trace-2.jsonl, frames-2/ ...), and `run` picks which one is analyzed; what detect writes for it follows the same
// naming (summary-2.md, anomalies-2-assisted.json ...). See lib/evidence.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ASSIST_SUFFIX } from './bot.mjs';
import { slotSuffix, listRuns } from './evidence.mjs';
// playwright is imported when the clip sheets are drawn (runDetect), so the analysis below loads without it.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 608;
const H = 448;
const LABEL_H = 18;

function parseLuminanceFromVideo(videoFile) {
  const r = spawnSync(
    'ffmpeg',
    ['-i', videoFile, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  if (r.status !== 0) return [];
  const lines = (r.stdout || r.stderr || '').split('\n');
  const yavg = [];
  for (const line of lines) {
    const m = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
    if (m) yavg.push(parseFloat(m[1]));
  }
  return yavg;
}

// ---- softlock -------------------------------------------------------------------------------------------------
// "No progress while inputs are held" is a SUSPICION, not a verdict: a player held against a wall, a pause menu with a key
// down, or a puzzle that wants the player to wait all look like it. So the detector reports `softlock-suspect` (listed in
// suspects.json, non-blocking), and only the game can confirm a real `softlock` (blocking): an optional project hook,
// tools/play/hooks.mjs next to play.mjs (or `detect --hook <module>`), exports
//     export function canRecover(ctx) { ... }   // -> false | true | anything else
// false = no permitted input or action gets the player out: the episode is a `softlock`.
// true  = the game can recover: it is not a softlock, and the suspicion is dropped.
// anything else (no hook, undefined, a throw) = the game cannot tell: it stays a suspect.
// A verdict may also be an object, {recoverable: false, reason: '...'}; the reason goes into the detail.
// ctx = { traces: the episode's frames, first, last, startFrame, endFrame, frames, playFrames, uncontrollableFrames, pathPx, heldKeys }.
// Everything about the trace fields is game-specific (like the other detectors): tune SOFTLOCK, isPlayFrame and the
// position read in windowStats for the game at hand.
//
// What is NOT live play is only what the trace says outright: a pause flag, a scene that is not a play scene (a menu, game over,
// credits ...) and a UI phase that is not play. Losing control is not on that list. A player who cannot act (stunned, frozen,
// dead, stuck in a cutscene that never ends) for a whole window while inputs are held is what this check exists for, so those
// frames count, and the recovery predicate decides: recoverable (a stun that ends) is no softlock, "no way out" is a confirmed
// softlock, and with no predicate or no answer it is a suspect. ctx.uncontrollableFrames tells the predicate how much of the
// stretch the trace marked the player as not controllable.
export const SOFTLOCK = {
  windowFrames: 600, // a no-progress window is 10 s at 60 fps
  stepFrames: 120, // windows start every 2 s; overlapping stuck windows merge into one episode
  minPathPx: 8, // less cumulative path than this over the window = the player did not move
  moveEpsPx: 1.5, // a step counts only once the player is this far from where the last counted step ended
  minPlayFraction: 0.8, // share of the window that must be live play, else it is mostly pause, menu or cutscene
  minHeldFraction: 0.8, // share of the live-play frames with a key held
  playScenes: ['Game'], // `scene` values that are live play (the other detectors use 'Game' too)
};

const PLAY_PHASE = /^(play|playing|game|gameplay|live|running|in-?game)$/i;
const PHASE_FIELDS = ['uiPhase', 'phase', 'uiScreen', 'screen', 'ui'];

// A frame is live play unless the trace says outright that it is not. Each field is read only if the trace has it: a position
// to measure, no pause flag, a play scene, and (when the trace names a UI phase) a play phase. Pauses, menus, game over and
// credits are skipped, not counted as standing still. Whether the player is alive or controllable is deliberately NOT asked
// here: losing control in the middle of play is the thing the recovery predicate has to be able to judge.
function isPlayFrame(tr, playScenes) {
  const p = tr && tr.player;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  if (tr.paused === true || tr.isPaused === true || tr.pause === true || p.paused === true) return false;
  if (typeof tr.scene === 'string' && !playScenes.includes(tr.scene)) return false;
  for (const k of PHASE_FIELDS) {
    if (typeof tr[k] === 'string' && tr[k] && !PLAY_PHASE.test(tr[k])) return false;
  }
  return true;
}

// Movement over traces[a..b] as cumulative PATH LENGTH of the live-play frames (not start versus end, which calls a
// player who walked a loop, or out and back, "stuck"). Wobble below moveEpsPx is not movement: a step is counted only once
// the player is that far from the end of the last counted step, so a body jittering against a wall adds nothing while a
// slow walk adds all of it.
function windowStats(traces, a, b, cfg) {
  const st = { frames: b - a + 1, play: 0, held: 0, uncontrollable: 0, pathPx: 0, scenes: new Set(), scores: new Set(), heldKeys: new Set(), lastPos: null };
  let anchor = null;
  for (let k = a; k <= b; k++) {
    const tr = traces[k];
    if (!isPlayFrame(tr, cfg.playScenes)) continue;
    st.play++;
    if (tr.player.controllable === false) st.uncontrollable++;
    if (Array.isArray(tr.keys) && tr.keys.length > 0) {
      st.held++;
      for (const key of tr.keys) st.heldKeys.add(key);
    }
    st.scenes.add(tr.scene);
    st.scores.add(tr.score);
    const p = tr.player;
    st.lastPos = p;
    if (anchor === null) {
      anchor = p;
    } else {
      const d = Math.hypot(p.x - anchor.x, p.y - anchor.y, (p.z ?? 0) - (anchor.z ?? 0));
      if (d >= cfg.moveEpsPx) {
        st.pathPx += d;
        anchor = p;
      }
    }
  }
  return st;
}

const noProgress = (st, cfg) =>
  st.play >= cfg.minPlayFraction * st.frames &&
  st.held >= cfg.minHeldFraction * st.play &&
  st.scenes.size <= 1 &&
  st.scores.size <= 1 &&
  st.pathPx < cfg.minPathPx;

// Text from a project hook ends up in a markdown table cell: keep it on one line, without pipes.
const cell = (x, n = 200) => String(x).replace(/[\r\n|]+/g, ' ').slice(0, n);

function recoveryVerdict(res) {
  if (res === false || (res && typeof res === 'object' && res.recoverable === false)) return 'none';
  if (res === true || (res && typeof res === 'object' && res.recoverable === true)) return 'recoverable';
  return 'unknown';
}

/**
 * Softlocks and softlock suspects in a trace (an array of per-frame objects). Pure: no files, no browser.
 * opts overrides SOFTLOCK; opts.canRecover is the game's recovery predicate (see above).
 * Returns {softlocks, suspects}, entries shaped like the other anomalies: {frame, seconds, type, detail}.
 */
export function detectSoftlocks(traces, opts = {}) {
  const { canRecover, ...rest } = opts;
  const cfg = { ...SOFTLOCK, ...rest };
  const frameAt = (i) => (Number.isFinite(traces[i]?.frame) ? traces[i].frame : i);

  // Windows of no progress, merged into episodes: a run stuck for a minute is one finding, not thirty.
  const episodes = [];
  let prev = -Infinity;
  for (let i = cfg.windowFrames; i < traces.length; i += cfg.stepFrames) {
    if (!noProgress(windowStats(traces, i - cfg.windowFrames, i, cfg), cfg)) continue;
    if (prev === i - cfg.stepFrames) episodes[episodes.length - 1].end = i;
    else episodes.push({ start: i - cfg.windowFrames, firstEnd: i, end: i });
    prev = i;
  }

  const softlocks = [];
  const suspects = [];
  for (const ep of episodes) {
    const st = windowStats(traces, ep.start, ep.end, cfg);
    const frame = frameAt(ep.firstEnd);
    const ctx = {
      traces: traces.slice(ep.start, ep.end + 1),
      first: traces[ep.start],
      last: traces[ep.end],
      startFrame: frameAt(ep.start),
      endFrame: frameAt(ep.end),
      frames: ep.end - ep.start,
      playFrames: st.play,
      uncontrollableFrames: st.uncontrollable,
      pathPx: st.pathPx,
      heldKeys: [...st.heldKeys],
    };
    const at = st.lastPos ? `x=${st.lastPos.x}, y=${st.lastPos.y}` : 'position unknown';
    const [scene] = st.scenes;
    const [score] = st.scores;
    const facts = `no progress for ${ctx.frames}f while inputs were held (scene ${scene ?? 'n/a'}, score ${score ?? 'n/a'}, path ${st.pathPx.toFixed(1)}px over ${st.play} live frames, ${at}${st.uncontrollable > 0 ? `, player not controllable in ${st.uncontrollable} of them` : ''})`;
    let verdict = 'unknown';
    let why = typeof canRecover === 'function' ? 'the recovery hook could not tell' : 'no recovery hook, so nothing can confirm it';
    if (typeof canRecover === 'function') {
      try {
        const res = canRecover(ctx);
        verdict = recoveryVerdict(res);
        if (verdict === 'none') why = res && typeof res === 'object' && res.reason ? cell(res.reason) : '';
      } catch (e) {
        why = `the recovery hook threw: ${cell((e && e.message) || e)}`;
      }
    }
    if (verdict === 'recoverable') continue; // the game says the player can get out: not a softlock
    const entry = { frame, seconds: Number((frame / 60).toFixed(2)) };
    if (verdict === 'none') {
      softlocks.push({ ...entry, type: 'softlock', detail: `${facts}: confirmed, the recovery hook says there is no way out${why ? ` (${why})` : ''}` });
    } else {
      suspects.push({ ...entry, type: 'softlock-suspect', detail: `${facts}: only a suspicion; ${why}` });
    }
  }
  return { softlocks, suspects };
}

/** Loads a project's detector hooks (see the softlock notes). `required`: a module without canRecover is an error. */
export async function loadProjectHooks(file, required = true) {
  const abs = path.resolve(file);
  const mod = await import(pathToFileURL(abs).href);
  const canRecover = typeof mod.canRecover === 'function' ? mod.canRecover : typeof mod.default?.canRecover === 'function' ? mod.default.canRecover : null;
  if (required && !canRecover) throw new Error(`hook module ${abs} exports no canRecover(ctx)`);
  return { canRecover, file: abs };
}

const DEFAULT_HOOK_FILE = path.resolve(HERE, '..', 'hooks.mjs');

// <base><ext> or <base>-assisted<ext> in a recording folder (replay writes the second for an assisted run).
function pickRecFile(folder, base, ext) {
  const plain = path.join(folder, `${base}${ext}`);
  const marked = path.join(folder, `${base}${ASSIST_SUFFIX}${ext}`);
  const hasPlain = fs.existsSync(plain);
  const hasMarked = fs.existsSync(marked);
  if (hasPlain && hasMarked) {
    throw new Error(`${folder} holds both ${base}${ext} and ${base}${ASSIST_SUFFIX}${ext}: replay assisted and unassisted runs into separate folders`);
  }
  return { file: hasMarked ? marked : plain, assisted: hasMarked };
}

/**
 * Runs the detectors on a replay folder.
 * hook: path of a hooks module, a {canRecover} object or the function itself; null = use tools/play/hooks.mjs if it
 *   exists; false = none.
 * strictSuspects: suspects count as anomalies (blocking) instead of being listed apart.
 */
export async function runDetect({ recDir, run = 1, hook = null, strictSuspects = false }) {
  const folder = path.resolve(recDir);
  const rs = slotSuffix(run); // '' for run 1, '-2' for run 2 ...
  const traceRec = pickRecFile(folder, `trace${rs}`, '.jsonl');
  const videoRec = pickRecFile(folder, `video${rs}`, '.mp4');
  const traceFile = traceRec.file;
  const videoFile = videoRec.file;
  const assisted = traceRec.assisted || videoRec.assisted;
  const sfx = assisted ? ASSIST_SUFFIX : '';
  const framesFolder = path.join(folder, `frames${rs}`);

  if (!fs.existsSync(traceFile)) {
    const runs = listRuns(folder);
    throw new Error(
      `trace${rs}.jsonl (or trace${rs}${ASSIST_SUFFIX}.jsonl) not found in ${folder}` +
        (runs.length > 0 ? `; it holds run${runs.length > 1 ? 's' : ''} ${runs.join(', ')} (pass --run <n>)` : ''),
    );
  }

  // The project's recovery predicate for softlocks, if it has one.
  let canRecover = null;
  let hookFile = null;
  if (typeof hook === 'function') {
    canRecover = hook;
    hookFile = '(function)';
  } else if (hook && typeof hook === 'object') {
    canRecover = typeof hook.canRecover === 'function' ? hook.canRecover : null;
    hookFile = '(object)';
  } else if (typeof hook === 'string') {
    if (!fs.existsSync(hook)) throw new Error(`hook module not found: ${hook}`);
    ({ canRecover, file: hookFile } = await loadProjectHooks(hook, true));
  } else if (hook !== false && fs.existsSync(DEFAULT_HOOK_FILE)) {
    ({ canRecover, file: hookFile } = await loadProjectHooks(DEFAULT_HOOK_FILE, false));
  }

  // Ensure frames exist (extract from video if needed)
  if (!fs.existsSync(framesFolder) || fs.readdirSync(framesFolder).filter((f) => f.endsWith('.png')).length === 0) {
    if (!fs.existsSync(videoFile)) {
      throw new Error(`neither frames${rs}/ nor video${rs}.mp4 (or video${rs}${ASSIST_SUFFIX}.mp4) found in ${folder}`);
    }
    fs.mkdirSync(framesFolder, { recursive: true });
    const ext = spawnSync('ffmpeg', ['-i', videoFile, '-vsync', '0', path.join(framesFolder, '%06d.png')], {
      stdio: 'pipe',
    });
    if (ext.status !== 0) throw new Error(`failed to extract frames from video: ${(ext.stderr || '').slice(-300)}`);
  }

  const rawLines = fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean);
  const traces = rawLines.map((l) => JSON.parse(l));
  const totalFrames = traces.length;

  const anomalies = [];
  const addAnomaly = (frame, type, detail) => {
    const seconds = Number((frame / 60).toFixed(2));
    anomalies.push({ frame, seconds, type, detail });
  };

  // 1. stuck: right (or left) held >= 60 frames while player x changes < 2 px and not in vehicle/arena lock
  let stuckDir = null;
  let stuckStartF = 0;
  let stuckStartX = 0;
  for (let i = 0; i < traces.length; i++) {
    const tr = traces[i];
    const isRight = tr.keys && tr.keys.includes('right');
    const isLeft = tr.keys && tr.keys.includes('left');
    const dir = isRight ? 'right' : isLeft ? 'left' : null;
    const locked = Boolean(tr.arenaLock || (tr.player && tr.player.aboard));

    if (dir && !locked && tr.player && tr.player.alive && tr.player.controllable && tr.scene === 'Game') {
      if (stuckDir === dir) {
        const dx = Math.abs(tr.player.x - stuckStartX);
        const streak = tr.frame - stuckStartF;
        if (streak >= 60 && dx < 2) {
          if (streak === 60 || streak % 120 === 0) {
            addAnomaly(tr.frame, 'stuck', `held ${dir} for ${streak}f with dx=${dx.toFixed(1)}px (x=${tr.player.x})`);
          }
        }
      } else {
        stuckDir = dir;
        stuckStartF = tr.frame;
        stuckStartX = tr.player.x;
      }
    } else {
      stuckDir = null;
    }
  }

  // 2. invisible: player alive but not visible (or alpha 0) >= 3 frames outside respawn blink
  let invisStreak = 0;
  for (let i = 0; i < traces.length; i++) {
    const tr = traces[i];
    if (tr.scene === 'Game' && tr.player && tr.player.alive && !tr.player.aboard && !tr.player.invuln) {
      if (!tr.player.visible) {
        invisStreak++;
        if (invisStreak === 3) {
          addAnomaly(tr.frame, 'invisible', `player alive but invisible for ${invisStreak}f outside respawn/vehicle`);
        }
      } else {
        invisStreak = 0;
      }
    } else {
      invisStreak = 0;
    }
  }

  // 3. offscreen-player / offscreen-boss: inside world but outside camera >= 10 frames
  let offPlayerStreak = 0;
  let offBossStreak = 0;
  for (let i = 0; i < traces.length; i++) {
    const tr = traces[i];
    if (tr.scene === 'Game' && tr.player && tr.player.alive && !tr.player.aboard) {
      const camX = tr.cam?.x ?? 0;
      const camY = tr.cam?.y ?? 0;
      const px = tr.player.x;
      const py = tr.player.y;
      // In world (> 0) but outside camera [camX-16, camX+320]
      const outCam = px > 0 && py > 0 && (px < camX - 16 || px > camX + 304 + 16 || py < camY - 16 || py > camY + 224 + 16);
      if (outCam) {
        offPlayerStreak++;
        if (offPlayerStreak === 10) {
          addAnomaly(tr.frame, 'offscreen-player', `player at (${px}, ${py}) outside camera (${camX}, ${camY}) for ${offPlayerStreak}f`);
        }
      } else {
        offPlayerStreak = 0;
      }
    } else {
      offPlayerStreak = 0;
    }

    if (tr.boss && tr.boss.hp > 0) {
      if (!tr.boss.onCamera && tr.boss.x > 0) {
        offBossStreak++;
        if (offBossStreak === 10) {
          addAnomaly(tr.frame, 'offscreen-boss', `boss ${tr.boss.name} at x=${tr.boss.x} outside camera for ${offBossStreak}f`);
        }
      } else {
        offBossStreak = 0;
      }
    } else {
      offBossStreak = 0;
    }
  }

  // 4. teleport: |Δx| or |Δy| > 16 px in one frame without a checkpoint/respawn/vehicle event
  for (let i = 1; i < traces.length; i++) {
    const prev = traces[i - 1];
    const curr = traces[i];
    if (prev.scene === 'Game' && curr.scene === 'Game' && prev.player?.alive && curr.player?.alive) {
      if (!prev.player.aboard && !curr.player.aboard) {
        const dx = Math.abs(curr.player.x - prev.player.x);
        const dy = Math.abs(curr.player.y - prev.player.y);
        if (dx > 16 || dy > 16) {
          const events = [...(curr.agentEvents || []), ...(curr.events || []), ...(prev.agentEvents || []), ...(prev.events || [])];
          const exempt = events.some(
            (e) => e.type === 'checkpoint' || e.name === 'respawn' || e.type === 'vehicle' || e.type === 'scene',
          );
          if (!exempt) {
            addAnomaly(curr.frame, 'teleport', `player moved dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)} without event`);
          }
        }
      }
    }
  }

  // 5. unseen-death: player death with no enemy bullet/hazard within 40 px visible in previous 20 frames
  for (let i = 1; i < traces.length; i++) {
    const prev = traces[i - 1];
    const curr = traces[i];
    const deathEv = (curr.events || []).find((e) => e.type === 'death' && String(e.name).startsWith('player'));
    const died = (prev.player?.alive && !curr.player?.alive) || Boolean(deathEv);
    if (died && prev.scene === 'Game') {
      const startLook = Math.max(0, i - 20);
      let seenHazard = false;
      for (let k = startLook; k <= i; k++) {
        const t = traces[k];
        if (t.enemyBullets > 0 || (t.boss && t.boss.hp > 0) || (t.player && t.player.y > 224)) {
          seenHazard = true;
          break;
        }
      }
      if (!seenHazard) {
        addAnomaly(curr.frame, 'unseen-death', `player death with no enemy bullets, boss or pit visible in previous 20f`);
      }
    }
  }

  // 6. hud-overlap: player top y < 24 (under the HUD) >= 10 frames
  let hudStreak = 0;
  for (let i = 0; i < traces.length; i++) {
    const tr = traces[i];
    if (tr.scene === 'Game' && tr.player && tr.player.alive) {
      const topY = tr.player.y - 28;
      if (topY < 24) {
        hudStreak++;
        if (hudStreak === 10) {
          addAnomaly(tr.frame, 'hud-overlap', `player top y (${topY.toFixed(1)}) under HUD (< 24) for ${hudStreak}f`);
        }
      } else {
        hudStreak = 0;
      }
    } else {
      hudStreak = 0;
    }
  }

  // 7. flash / black: mean luminance jump > 40% frame-to-frame or a near-black frame outside scene transitions
  if (fs.existsSync(videoFile)) {
    const lumList = parseLuminanceFromVideo(videoFile);
    for (let f = 1; f < lumList.length; f++) {
      const prevL = lumList[f - 1];
      const curL = lumList[f];
      const diffL = Math.abs(curL - prevL);
      if (diffL > 0.4 * 255) {
        addAnomaly(f + 1, 'flash', `luminance jump ${prevL.toFixed(1)} -> ${curL.toFixed(1)} (Δ=${diffL.toFixed(1)} > 40%)`);
      }
      if (curL < 5) {
        const tr = traces[f] || traces[traces.length - 1];
        if (tr && tr.scene === 'Game') {
          // Check if near scene boundary
          const nearStart = f < 60;
          const nearEnd = f > lumList.length - 60;
          if (!nearStart && !nearEnd) {
            addAnomaly(f + 1, 'black', `near-black frame (luminance ${curL.toFixed(1)} < 5) outside scene transition`);
          }
        }
      }
    }
  }

  // 8. softlock: no progress while inputs are held. A suspicion unless the game's recovery hook confirms it (detectSoftlocks).
  const found = detectSoftlocks(traces, { canRecover });
  anomalies.push(...found.softlocks);
  let suspects = found.suspects;
  if (strictSuspects) {
    anomalies.push(...suspects);
    suspects = [];
  }

  // Write anomalies.json (findings) and suspects.json (suspicions, listed apart)
  const anomaliesFile = path.join(folder, `anomalies${rs}${sfx}.json`);
  fs.writeFileSync(anomaliesFile, JSON.stringify(anomalies, null, 2));
  const suspectsFile = path.join(folder, `suspects${rs}${sfx}.json`);
  fs.writeFileSync(suspectsFile, JSON.stringify(suspects, null, 2));

  // Clips and Overview rendering
  const clipsFolder = path.join(folder, `clips${rs}`);
  const overviewFolder = path.join(folder, `overview${rs}`);
  fs.mkdirSync(clipsFolder, { recursive: true });
  fs.mkdirSync(overviewFolder, { recursive: true });

  let browser;
  try {
    const { chromium } = await import('playwright');
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    const page = await browser.newPage();

    // Helper inside browser to generate contact sheets
    const renderContactSheet = async (frameNumbers) => {
      const b64List = [];
      for (const fn of frameNumbers) {
        const padded = String(Math.max(1, Math.min(totalFrames, fn))).padStart(6, '0');
        const fp = path.join(framesFolder, `${padded}.png`);
        if (fs.existsSync(fp)) {
          b64List.push({ b64: fs.readFileSync(fp).toString('base64'), label: `f ${fn}` });
        }
      }
      if (b64List.length === 0) return null;

      return page.evaluate(
        async ({ items, W, H, LH }) => {
          async function load(b64) {
            const img = new Image();
            await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
            return img;
          }
          const imgs = [];
          for (const it of items) imgs.push({ img: await load(it.b64), label: it.label });
          const cols = 4;
          const rows = Math.ceil(imgs.length / cols);
          const out = document.createElement('canvas');
          out.width = cols * W;
          out.height = rows * (H + LH);
          const ctx = out.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, out.width, out.height);
          imgs.forEach((item, i) => {
            const cx = (i % cols) * W;
            const cy = Math.floor(i / cols) * (H + LH);
            ctx.drawImage(item.img, cx, cy, W, H);
            ctx.fillStyle = '#111';
            ctx.fillRect(cx, cy + H, W, LH);
            ctx.fillStyle = '#f0d060';
            ctx.font = '14px monospace';
            ctx.fillText(item.label, cx + 8, cy + H + 14);
          });
          return out.toDataURL('image/png').split(',')[1];
        },
        { items: b64List, W, H, LH: LABEL_H },
      );
    };

    const renderExactX3 = async (frameNum) => {
      const padded = String(Math.max(1, Math.min(totalFrames, frameNum))).padStart(6, '0');
      const fp = path.join(framesFolder, `${padded}.png`);
      if (!fs.existsSync(fp)) return null;
      const b64 = fs.readFileSync(fp).toString('base64');
      return page.evaluate(
        async ({ b64, W, H }) => {
          const img = new Image();
          await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
          const out = document.createElement('canvas');
          out.width = W * 1.5; // 3x native (304x3 = 912, W is 608 so W*1.5 = 912)
          out.height = H * 1.5; // 224*3 = 672
          const ctx = out.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, out.width, out.height);
          return out.toDataURL('image/png').split(',')[1];
        },
        { b64, W, H },
      );
    };

    // Render clips for top anomalies (up to 20) and the first few suspects (up to 5): a suspicion needs a look
    const clipAnomalies = [...anomalies.slice(0, 20), ...suspects.slice(0, 5)];
    for (const an of clipAnomalies) {
      const f = an.frame;
      // -30..+30 around it, every 5th frame = 13 offsets: -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30 -> 12-frame grid
      const offsets = [-30, -25, -20, -15, -10, -5, 1, 5, 10, 15, 20, 25];
      const framesToSnap = offsets.map((off) => Math.max(1, Math.min(totalFrames, f + off)));
      const sheetB64 = await renderContactSheet(framesToSnap);
      if (sheetB64) {
        fs.writeFileSync(path.join(clipsFolder, `${f}_${an.type}.png`), Buffer.from(sheetB64, 'base64'));
      }
      const x3B64 = await renderExactX3(f);
      if (x3B64) {
        fs.writeFileSync(path.join(clipsFolder, `${f}_${an.type}_x3.png`), Buffer.from(x3B64, 'base64'));
      }
    }

    // Render overview contact sheets: one 12-frame contact sheet per 10 seconds (600 frames) of play
    const totalOverviewBatches = Math.max(1, Math.ceil(totalFrames / 600));
    for (let b = 0; b < totalOverviewBatches; b++) {
      const bStart = b * 600;
      const bFrames = [];
      for (let k = 0; k < 12; k++) {
        bFrames.push(Math.max(1, Math.min(totalFrames, bStart + Math.round((k * 600) / 12))));
      }
      const sheetB64 = await renderContactSheet(bFrames);
      if (sheetB64) {
        fs.writeFileSync(path.join(overviewFolder, `${b}.png`), Buffer.from(sheetB64, 'base64'));
      }
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  // Generate summary.md
  const typeCounts = {};
  for (const a of anomalies) {
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
  }

  let md = `# Anomaly Detection Summary\n\n`;
  if (assisted) {
    md += `> **ASSISTED RUN** (invulnerability on). Coverage only: not normal-play acceptance and not judged evidence.\n\n`;
  }
  md += `- **Folder**: \`${folder}\`\n`;
  md += `- **Total Frames**: ${totalFrames} (${(totalFrames / 60).toFixed(1)}s at 60 fps)\n`;
  md += `- **Total Anomalies**: ${anomalies.length}\n`;
  md += `- **Suspects (non-blocking)**: ${suspects.length}${strictSuspects ? ' (strict: suspects were counted as anomalies)' : ''}\n\n`;

  md += `## Anomaly Counts by Type\n\n`;
  md += `| Type | Count |\n|---|---|\n`;
  for (const [t, c] of Object.entries(typeCounts)) {
    md += `| \`${t}\` | ${c} |\n`;
  }
  if (Object.keys(typeCounts).length === 0) {
    md += `| *(none)* | 0 |\n`;
  }

  md += `\n## Top Anomalies\n\n`;
  if (anomalies.length === 0) {
    md += `No anomalies detected. Run is clean!\n`;
  } else {
    md += `| Frame | Seconds | Type | Detail | Clip Sheet | Exact x3 |\n|---|---|---|---|---|---|\n`;
    const top = anomalies.slice(0, 20);
    for (const a of top) {
      const clipRel = `clips${rs}/${a.frame}_${a.type}.png`;
      const x3Rel = `clips${rs}/${a.frame}_${a.type}_x3.png`;
      md += `| ${a.frame} | ${a.seconds}s | \`${a.type}\` | ${a.detail} | [sheet](${clipRel}) | [x3](${x3Rel}) |\n`;
    }
  }

  md += `\n## Suspects (non-blocking)\n\n`;
  if (suspects.length === 0) {
    md += `No suspects.\n`;
  } else {
    md += `Suspicions to look at, not findings: they do not count as anomalies, and a softlock stays a suspect until the game's recovery hook confirms it.\n\n`;
    md += `| Frame | Seconds | Type | Detail | Clip Sheet | Exact x3 |\n|---|---|---|---|---|---|\n`;
    for (const a of suspects.slice(0, 20)) {
      const clipRel = `clips${rs}/${a.frame}_${a.type}.png`;
      const x3Rel = `clips${rs}/${a.frame}_${a.type}_x3.png`;
      md += `| ${a.frame} | ${a.seconds}s | \`${a.type}\` | ${a.detail} | [sheet](${clipRel}) | [x3](${x3Rel}) |\n`;
    }
  }

  md += `\n## Overview Contact Sheets\n\n`;
  const overviewFiles = fs.existsSync(overviewFolder) ? fs.readdirSync(overviewFolder).filter((f) => f.endsWith('.png')).sort() : [];
  for (const ov of overviewFiles) {
    md += `- [${ov}](overview${rs}/${ov})\n`;
  }

  const summaryFile = path.join(folder, `summary${rs}${sfx}.md`);
  fs.writeFileSync(summaryFile, md);

  return {
    ok: true,
    assisted,
    run,
    totalFrames,
    anomaliesCount: anomalies.length,
    suspectsCount: suspects.length,
    countsByType: typeCounts,
    summaryFile,
    anomaliesFile,
    suspectsFile,
    softlockHook: hookFile,
  };
}
