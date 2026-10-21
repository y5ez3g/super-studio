// Bot input generator and runner (RECORD-PIPELINE Part 4).
// Pure code driver: executes competent scripted runs (full) or seeded random plausible inputs (fuzz).
// Produces a normal session input log (.play/<session>.log.jsonl) via the play daemon.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSeq } from './keys.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- Assistance (invulnerability) --------------------------------------------------------------------------
// Assistance is NEVER on by default, for any mission or level. It is switched on by asking for it, with
// `--assist invuln` (or by putting invuln=1 in --params by hand: that is assistance too), and then every output of the
// run is marked: a summary field `assisted: true`, and an `-assisted` suffix in the session, recording and trace file
// names. Judged evidence and normal-play acceptance use unassisted runs; assisted runs are coverage only. The helpers
// live here because play.mjs, detect.mjs and the bot all need them and tools/play/lib has no other shared module.
export const ASSIST_SUFFIX = '-assisted';
const ASSISTS = ['invuln'];

/** `--assist invuln[,..]` -> ['invuln']. No value given -> []; a bare `--assist` or an unknown name throws. */
export function parseAssist(value) {
  if (value === undefined || value === null || value === false) return [];
  if (value === true) throw new Error(`--assist wants a value (${ASSISTS.join(', ')})`);
  const list = (Array.isArray(value) ? value : String(value).split(','))
    .map((a) => String(a).trim().toLowerCase())
    .filter(Boolean);
  for (const a of list) {
    if (!ASSISTS.includes(a)) throw new Error(`unknown assist "${a}" (want ${ASSISTS.join(', ')})`);
  }
  return [...new Set(list)];
}

// Any invuln value except an explicit off counts as on: the cautious reading for something that marks evidence.
const invulnOn = (v) => v !== null && v !== undefined && !/^(0|false|off|no)$/i.test(String(v).trim());

/**
 * Decide whether a run is assisted. `assist` is the --assist value, `params` the URL-param string the game will get.
 * Returns {assisted, assist: [...], params}: params gains invuln=1 when `--assist invuln` asks for it, and is
 * otherwise returned as given. An invuln param set by hand makes the run assisted too, so no run with the
 * switch on can come out unmarked.
 */
export function resolveAssist({ assist, params = '' } = {}) {
  const list = parseAssist(assist);
  const raw = String(params ?? '').replace(/^[?&]+/, '');
  const map = new URLSearchParams(raw);
  const handOn = invulnOn(map.get('invuln'));
  if (handOn && !list.includes('invuln')) list.push('invuln');
  let out = raw;
  if (list.includes('invuln') && !handOn) {
    map.set('invuln', '1');
    out = map.toString();
  }
  return { assisted: list.length > 0, assist: list, params: out };
}

/** 'run1' -> 'run1-assisted' (idempotent): session names, and with them `<session>.log.jsonl`. */
export function markName(name, assisted) {
  const n = String(name);
  return assisted && !n.endsWith(ASSIST_SUFFIX) ? `${n}${ASSIST_SUFFIX}` : n;
}

/** 'clip.mp4' -> 'clip-assisted.mp4' (idempotent): recordings, traces, screenshots. */
export function markFile(file, assisted) {
  if (!assisted) return file;
  const ext = path.extname(file);
  const stem = ext ? file.slice(0, -ext.length) : file;
  return stem.endsWith(ASSIST_SUFFIX) ? file : `${stem}${ASSIST_SUFFIX}${ext}`;
}

// ---- The session input log ---------------------------------------------------------------------------------
// <session>.log.jsonl is append-only, one JSON object per line, written by the play daemon:
//   {event:'start',  type:'start',  session, dist, params, seed, scale, time}
//   {event:'step',   type:'step',   session, seq, before, after, time}          before/after: the game's frame counter
//   {event:'assist', type:'assist', session, assist:'invuln', on:true|false, frame, time}
//       one for every live change of an assist (`invuln --on|--off`, or the API); `frame` is the counter when it happened.
// It is the one durable record of a run. Replay plays it back (the steps in order, each assist switch at its frame), and
// whether a run counts as assisted is read from it, from the start params and from every assist entry, never from state
// that is lost when the session stops. The daemon writes an assist entry before it flips the switch, so no assisted frame
// exists without its record.
const isKind = (e, kind) => Boolean(e) && (e.event === kind || e.type === kind);

/** The log line the daemon appends when an assist is switched while a session runs. */
export function assistLogEntry({ session, assist = 'invuln', on, frame, time = new Date().toISOString() }) {
  return { event: 'assist', type: 'assist', session, assist, on: on === true, frame, time };
}

/**
 * {assisted, assist} from parsed log entries. Assisted if the start params turned an assist on, or if any assist entry did
 * (an `on` that is not an explicit false counts as on: the cautious reading for something that marks evidence). Switching
 * it off again changes nothing: a run that was ever assisted stays assisted.
 */
export function assistFromEntries(entries) {
  const list = [];
  const add = (a) => {
    if (!list.includes(a)) list.push(a);
  };
  for (const e of entries) {
    if (isKind(e, 'start')) for (const a of resolveAssist({ params: e.params }).assist) add(a);
    else if (isKind(e, 'assist') && e.on !== false) add(typeof e.assist === 'string' && e.assist ? e.assist : 'invuln');
  }
  return { assisted: list.length > 0, assist: list };
}

/**
 * Was the run behind a session input log assisted? Reads the durable record (see above), so it gives the same answer while
 * the session runs and after it has stopped. Lenient on purpose: a line that cannot be read is skipped, because this
 * labels live output and must not fail it. `readInputLog` is the strict reader that replay uses.
 */
export function readLogAssist(logFile) {
  const entries = [];
  for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
    if (!line.includes('"start"') && !line.includes('"assist"')) continue; // only these two kinds can mark a run
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return assistFromEntries(entries);
}

/**
 * The strict reader, for replay: parses and checks the whole log before anything is done with it, so a bad log is refused
 * while nothing has been touched. Throws, naming the file and the line, on a line that is not a JSON object, a step
 * with a script that does not parse, an assist entry that is not {assist, on, frame}, a log without a start entry or
 * without a step. Returns {file, start, steps, assists, assisted, assist}: steps are {line, seq, tokens, before, after}, assists
 * are {line, assist, on, frame}.
 *
 * The file is read ONCE, here, and the result is a snapshot: a session may still be appending to the log, so whoever replays
 * it hands this object on (what runs, whether the run is assisted and what its files are called all come from it) and never
 * opens the file a second time. Whatever is appended after this read belongs to a later replay.
 */
export function readInputLog(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`replay log file not found: "${file}"`);
  return parseInputLog(fs.readFileSync(file, 'utf8'), file);
}

/** The parse and every check of `readInputLog`, on text that was already read. It never touches the file: `file` only names it in errors. */
export function parseInputLog(text, file = 'input log') {
  const entries = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch (err) {
      throw new Error(`${file}: line ${i + 1} is not valid JSON (${err.message})`);
    }
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`${file}: line ${i + 1} is not a JSON object`);
    entries.push({ line: i + 1, e });
  }
  const start = entries.find((x) => isKind(x.e, 'start'));
  if (!start) throw new Error(`no start entry found in log: ${file}`);
  const steps = [];
  const assists = [];
  for (const { line, e } of entries) {
    if (isKind(e, 'step')) {
      let tokens;
      try {
        tokens = parseSeq(e.seq);
      } catch (err) {
        throw new Error(`${file}: line ${line}: bad step (${err.message})`);
      }
      steps.push({ line, seq: e.seq, tokens, before: e.before, after: e.after });
    } else if (isKind(e, 'assist')) {
      if (!ASSISTS.includes(e.assist) || typeof e.on !== 'boolean' || !Number.isInteger(e.frame) || e.frame < 0) {
        throw new Error(
          `${file}: line ${line}: bad assist entry (want {"assist": ${ASSISTS.map((a) => `"${a}"`).join(' | ')}, "on": true|false, "frame": <integer>})`,
        );
      }
      assists.push({ line, assist: e.assist, on: e.on, frame: e.frame });
    }
  }
  if (steps.length === 0) throw new Error(`${file}: no step entries, nothing to replay`);
  return { file, start: start.e, steps, assists, ...assistFromEntries(entries.map((x) => x.e)) };
}

function makeRng(seed) {
  let s = (Math.floor(seed) || 1) >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded pseudo-random but plausible inputs generator for F frames
export function generateFuzzScript(frames, seed = 1) {
  const rng = makeRng(seed);
  const actions = [
    { key: 'right+z', minF: 20, maxF: 50, weight: 35 },
    { key: 'right', minF: 15, maxF: 40, weight: 20 },
    { key: 'right+x', minF: 8, maxF: 15, weight: 10 },
    { key: 'right+x+z', minF: 10, maxF: 20, weight: 10 },
    { key: 'down+z', minF: 10, maxF: 25, weight: 6 },
    { key: 'z', minF: 6, maxF: 20, weight: 5 },
    { key: 'c', minF: 2, maxF: 4, weight: 4 },
    { key: 'x', minF: 5, maxF: 10, weight: 3 },
    { key: 'down+x', minF: 4, maxF: 8, weight: 2 },
    { key: 'left', minF: 10, maxF: 25, weight: 3 },
    { key: 'left+z', minF: 15, maxF: 30, weight: 3 },
    { key: '.', minF: 5, maxF: 15, weight: 4 },
    { key: '5', minF: 2, maxF: 5, weight: 1 },
    { key: 'enter', minF: 2, maxF: 5, weight: 1 },
  ];

  const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);
  const pickAction = () => {
    let r = rng() * totalWeight;
    for (const a of actions) {
      if (r < a.weight) return a;
      r -= a.weight;
    }
    return actions[0];
  };

  const tokens = [];
  let currentFrames = 0;

  // Initial insert coin and start if starting at Title
  tokens.push('5*5', '.*10', 'enter*5', '.*80');
  currentFrames = 100;

  while (currentFrames < frames) {
    const act = pickAction();
    let f = act.minF + Math.floor(rng() * (act.maxF - act.minF + 1));
    if (currentFrames + f > frames) {
      f = frames - currentFrames;
    }
    if (f > 0) {
      tokens.push(`${act.key}*${f}`);
      currentFrames += f;
    }
  }

  return tokens.join(' ');
}

// Scripted competent Mission 1 clear
export function getMission1Script() {
  const legs = [
    // Intro coin & start
    '5*5 .*10 enter*5 .*150',
    // 1. Quay run, free POW 1 (HMG), grenade & destroy truck, checkpoint 'after truck' (x=1600)
    'right+z*700 c*2 .*10 c*2 .*10 right+z*300 right+z*380',
    // 2. Fish-market stalls: jump over stall 1 (x=1620) and stall 2 (x=1780)
    'right+z*14 right+x*10 .*15 right*30 right+z*100 right+z*20 right+x*10 .*15 right+z*30 right+z*70',
    // 3. Shipyard gantry: jump tiers (x=1900, 1972, 2044) and descend to ground
    'right+z*55 right+x*10 right*30 right+z*25 right+x*10 right*30 right+z*100',
    // 4. Shipyard run: advance to tank bay at x=3300 (checkpoint 'tank bay')
    'right+z*1000',
    // 5. Board Rivet Runner tank at dry dock rim (x=3300)
    'x*5 .*25',
    // 6. Drive tank through gatehouse (x=3584), checkpoint 'before boss' (x=3720), reach Ferry (x=3950)
    'right*727',
    // 7. Capped cannon demo: 2 shells draw the vehicle pool, Down+X dismounts Juno
    'c*5 .*35 c*5 .*35 down+x*5 .*40',
    // 8. Foot finish: 4 grenades splash the vents
    'c*5 .*60 c*5 .*60 c*5 .*60 c*5 .*60',
    // 9. Pistol grind at the vent lane until the demolition resolves
    'z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25',
    // Trailing wait for scene to settle
    '.*60 .*60 .*60 .*60',
  ];
  return legs.join(' ');
}

// Scripted routes are data, committed at tools/play/routes/<name>.txt (relative to cwd, the repo root),
// because the gate runs in a temp worktree that holds only committed files (team/ is not there).
export function readRoute(name) {
  const routePath = path.resolve(process.cwd(), 'tools/play/routes', `${name}.txt`);
  if (fs.existsSync(routePath)) {
    return fs.readFileSync(routePath, 'utf8').trim();
  }
  throw new Error(`cannot find route "${name}" at ${routePath}`);
}

// Scripted competent Mission 2 clear
export function getMission2Script() {
  return readRoute('m2-full');
}

/**
 * Everything a bot run decides before any browser starts (pure apart from the clock in the default session name):
 * the params the game gets, the session name, the key script and whether the run is assisted.
 */
export function planBotRun({ mode = 'full', seed = 1, params = '', frames = 18000, session = null, assist = undefined } = {}) {
  const paramMap = new URLSearchParams(String(params || '').replace(/^[?&]+/, ''));
  if (!paramMap.has('seed')) paramMap.set('seed', String(seed));

  const mission = parseInt(paramMap.get('mission') || '1', 10);
  const a = resolveAssist({ assist, params: paramMap.toString() });
  const sessName = markName(session || `bot_${mode}_m${mission}_s${seed}_${Date.now()}`, a.assisted);

  // No mission or level gets a default assist: invulnerability only ever comes from `a`.
  let script;
  if (mode === 'full') {
    script = mission === 2 ? getMission2Script() : getMission1Script();
  } else if (mode === 'fuzz') {
    const fCount = parseInt(frames || '18000', 10) || 18000;
    script = generateFuzzScript(fCount, seed);
  } else {
    throw new Error(`unknown bot mode "${mode}" (want full or fuzz)`);
  }
  return { mode, mission, seed, sessName, script, params: a.params, assisted: a.assisted, assist: a.assist };
}

export async function runBot({ dist, mode = 'full', seed = 1, params = '', frames = 18000, logDir = '.play', session, assist }) {
  const plan = planBotRun({ mode, seed, params, frames, session, assist });
  const sessName = plan.sessName;
  const mission = plan.mission;
  const script = plan.script;
  const targetDist = dist ? path.resolve(dist) : './dist';
  const targetLogDir = path.resolve(logDir);
  fs.mkdirSync(targetLogDir, { recursive: true });

  const { startDaemon, api } = await import('./client.mjs');
  // Dynamic import play.mjs helpers
  const playPath = path.resolve(HERE, '..', 'play.mjs');
  const { startDaemon: startDaemonFn } = await import(playPath);

  const sess = await startDaemonFn({
    session: sessName,
    dist: targetDist,
    params: plan.params,
    scale: 2,
    logDir: targetLogDir,
  });

  const logFile = path.resolve(targetLogDir, `${sessName}.log.jsonl`);

  try {
    // Break script into manageable chunks (e.g. ~100 tokens or ~2000 frames) so daemon doesn't choke on a single giant step
    const tokens = script.split(/\s+/).filter(Boolean);
    const CHUNK_SIZE = 50;
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunkTokens = tokens.slice(i, i + CHUNK_SIZE);
      const chunkSeq = chunkTokens.join(' ');
      await api(sessName, '/step', {
        method: 'POST',
        body: { seq: chunkSeq },
      });
    }

    const info = await api(sessName, '/info');
    const debug = await api(sessName, '/debug').catch(() => ({ debug: {} }));

    return {
      ok: true,
      session: sessName,
      mode,
      mission,
      seed,
      assisted: plan.assisted,
      assist: plan.assist,
      logFile,
      finalFrame: info.frame,
      finalScene: info.scene,
      score: debug.debug?.score ?? 0,
      lives: debug.debug?.lives ?? 0,
    };
  } finally {
    try {
      await api(sessName, '/stop', { method: 'POST', timeoutMs: 15000 });
    } catch {}
    try {
      const { sessionFilePath } = await import('./client.mjs');
      fs.rmSync(sessionFilePath(sessName), { force: true });
    } catch {}
  }
}
