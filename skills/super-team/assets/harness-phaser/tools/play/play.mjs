#!/usr/bin/env node
// tools/play: AI play harness CLI.
// Usage: node tools/play/play.mjs <cmd> ... (also `npm run play -- <cmd> ...`)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './lib/server.mjs';
import { parseSeq, totalFrames } from './lib/keys.mjs';
import { sessionFilePath, readSessionFile, api, health, waitForDaemon, sleep } from './lib/client.mjs';
import { resolveAssist, markName, markFile, readLogAssist, readInputLog } from './lib/bot.mjs';
import { publishRun } from './lib/evidence.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAEMON = path.join(HERE, 'daemon.mjs');

function usage(fail = true) {
  const msg = `play harness — AI agents play the built game with real key presses
usage: node tools/play/play.mjs <cmd> [opts]
  serve   --dist <dir> [--port <n>]
  start   --session <name> [--dist <dir>] [--params "mission=1&seed=1"] [--scale 2] [--assist invuln]
  step    --session <s> --seq "<script>" [--shot <png>] [--contact <n> --contact-out <png>]
  shot    --session <s> --out <png>
  stop    --session <s>
  invuln  --session <s> [--on|--off]
  record  --dist <dir> --params "..." --seq "<script>" --out <mp4|webm> [--scale 2] [--assist invuln]
  replay  --log <file> --dist <dir> --out <folder>
  detect  --rec <folder> [--run <n>] [--hook <module.mjs>] [--strict-suspects]
  bot     --dist <dir> --mode full|fuzz --seed N --params "..." --frames F --log-dir <dir> [--assist invuln]
  smoke   --dist <dir> --out <folder> [--phase a|b] [--expect-kills <n>] [--assist invuln]
assists: nothing is assisted unless you ask. --assist invuln (or invuln=1 in --params) makes the run assisted: its summary
  says "assisted": true and its session, recording and trace files get an -assisted suffix. Switching invuln on in a running
  session (invuln --on) is assistance too: it is written to the session's input log at the frame it happens, and the log is
  what labels the run, now and after the session has stopped. Assisted runs are coverage only; normal-play acceptance and
  judged evidence use unassisted runs. smoke's completion phase (b) needs --assist invuln.
evidence is append-only: replay validates the log first, replays into a fresh attempt folder inside --out and publishes the
  result without replacing anything. A folder that already holds a replay keeps it; the new files get -2, -3 ... names (the
  result says which: "run", "trace", "video"; detect --run <n> reads them).
script tokens: <keys>*<frames> separated by spaces, keys joined with +,
  names: left right up down z x c enter 5 esc (or . for none),
  e.g. "right*30 right+z*4 .*2 right+z*4 x*1 right*20 c*1 .*30"`;
  (fail ? console.error : console.log)(msg);
  process.exit(fail ? 1 : 0);
}

function parseOpts(argv) {
  const opts = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected arg "${a}" (want --flag value)`);
    const eq = a.indexOf('=');
    if (eq !== -1) {
      opts[a.slice(2, eq)] = a.slice(eq + 1);
      i++;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      opts[a.slice(2)] = argv[i + 1];
      i += 2;
    } else {
      opts[a.slice(2)] = true;
      i++;
    }
  }
  return opts;
}

const log = (...a) => console.error(...a);

function writePng(outPath, base64) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
}

async function cmdServe(o) {
  const dist = o.dist || './dist';
  const port = parseInt(o.port || '8901', 10);
  const { server, port: got, root } = await serveStatic(dist, port);
  log(`serving ${root} at http://127.0.0.1:${got}/ (Ctrl-C to stop)`);
  process.on('SIGINT', () => server.close(() => process.exit(0)));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  await new Promise(() => {});
}

export async function startDaemon({ session, dist, params, scale, logDir }) {
  const file = sessionFilePath(session);
  try {
    const sess = readSessionFile(session);
    try {
      await health(session);
      throw new Error(`session "${session}" is already running (stop it first)`);
    } catch (e) {
      if (e.message.includes('already running')) throw e;
      fs.rmSync(file, { force: true }); // stale file
    }
  } catch (e) {
    if (e.message.includes('already running')) throw e;
    // no session file: fine
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const playDir = logDir ? path.resolve(logDir) : path.resolve('.play');
  fs.mkdirSync(playDir, { recursive: true });
  const logFd = fs.openSync(path.join(playDir, `${session}.log`), 'a');
  const args = [
    DAEMON,
    '--session',
    session,
    '--session-file',
    file,
    '--dist',
    dist,
    '--params',
    params,
    '--scale',
    String(scale),
  ];
  if (logDir) args.push('--log-dir', path.resolve(logDir));
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();
  fs.closeSync(logFd);
  return waitForDaemon(file, child.pid, 90000);
}

// Is a live session assisted? Yes if it was started so (the -assisted name, or invuln on in the params the daemon logged in
// its session file's url), or if the session's input log says so: the daemon writes every live change of an assist into the
// log, and the log is what stays when the session ends, so the answer does not depend on any state of the session itself.
function sessionAssisted(session) {
  const sess = readSessionFile(session);
  let fromParams = false;
  try {
    fromParams = resolveAssist({ params: new URL(sess.url).search }).assisted;
  } catch {}
  let fromLog = false;
  try {
    if (sess.logFile && fs.existsSync(sess.logFile)) fromLog = readLogAssist(sess.logFile).assisted;
  } catch {}
  return fromLog || fromParams || markName(session, true) === session;
}

async function cmdStart(o) {
  if (!o.session) throw new Error('start needs --session <name>');
  // An assisted session is named <name>-assisted, so its input log (<name>-assisted.log.jsonl) is marked too.
  const a = resolveAssist({ assist: o.assist, params: o.params === true ? '' : o.params });
  const sess = await startDaemon({
    session: markName(o.session, a.assisted),
    dist: o.dist || './dist',
    params: a.params,
    scale: parseInt(o.scale || '2', 10) || 2,
    logDir: o['log-dir'] || o.logDir || null,
  });
  console.log(JSON.stringify({ session: sess.session, ok: true, assisted: a.assisted, ...(a.assisted ? { assist: a.assist } : {}) }));
}

async function cmdStep(o) {
  if (!o.session) throw new Error('step needs --session <s>');
  if (!o.seq) throw new Error('step needs --seq "<script>"');
  // Validate early for a fast, clear error.
  const tokens = parseSeq(o.seq);
  const wantShot = typeof o.shot === 'string';
  const contactN = o.contact !== undefined && o.contact !== true ? parseInt(o.contact, 10) : 0;
  if (o.contact !== undefined && (!Number.isInteger(contactN) || contactN < 1 || contactN > 16)) {
    throw new Error('--contact wants a number 1..16');
  }
  if (contactN > 0 && typeof o['contact-out'] !== 'string') {
    throw new Error('--contact needs --contact-out <png>');
  }
  log(`step: ${tokens.length} tokens, ${totalFrames(tokens)} frames`);
  const assisted = sessionAssisted(o.session);
  const r = await api(o.session, '/step', {
    method: 'POST',
    body: { seq: o.seq, shot: wantShot, contactN },
  });
  const out = { frame: r.frame, scene: r.scene, events: r.events, errorCount: r.errorCount, assisted };
  if (wantShot) {
    out.shot = markFile(o.shot, assisted);
    writePng(out.shot, r.shot);
  }
  if (contactN > 0) {
    out.contact = markFile(o['contact-out'], assisted);
    writePng(out.contact, r.contact);
    out.contactFrames = r.contactFrames;
  }
  console.log(JSON.stringify(out));
}

async function cmdShot(o) {
  if (!o.session) throw new Error('shot needs --session <s>');
  if (typeof o.out !== 'string') throw new Error('shot needs --out <png>');
  const assisted = sessionAssisted(o.session);
  const r = await api(o.session, '/shot', { method: 'POST' });
  const out = markFile(o.out, assisted);
  writePng(out, r.png);
  console.log(JSON.stringify({ session: o.session, out, frame: r.frame, scene: r.scene, assisted }));
}

async function cmdInvuln(o) {
  if (!o.session) throw new Error('invuln needs --session <s>');
  const on = o.off !== undefined && o.off !== false ? false : true;
  if (o.on !== undefined && o.on !== false && o.off !== undefined && o.off !== false) {
    throw new Error('pass only one of --on / --off');
  }
  // The live switch is an assist like any other: whatever is played while it is on is coverage only. The daemon writes it to the
  // session's input log (with the frame) before it flips, so the session counts as assisted from here on (step and shot report
  // it and write -assisted files), and so does any replay of the log.
  const r = await api(o.session, '/invuln', { method: 'POST', body: { on } });
  console.log(JSON.stringify({ session: o.session, invuln: r.invuln, assisted: r.invuln === true || sessionAssisted(o.session), frame: r.frame, scene: r.scene }));
}

async function cmdStop(o) {
  if (!o.session) throw new Error('stop needs --session <s>');
  let stopped = false;
  try {
    await api(o.session, '/stop', { method: 'POST', timeoutMs: 15000 });
    stopped = true;
  } catch (e) {
    log(`daemon unreachable, clearing stale session file (${e.message})`);
  }
  try {
    fs.rmSync(sessionFilePath(o.session), { force: true });
  } catch {}
  console.log(JSON.stringify({ session: o.session, stopped }));
}

async function launchPlaywright() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

// Realtime (not lockstep) run with video recording. No ?agent=1: the game
// runs its own RAF loop here.
async function cmdRecord(o) {
  if (!o.seq) throw new Error('record needs --seq "<script>"');
  if (typeof o.out !== 'string') throw new Error('record needs --out <mp4|webm>');
  if (!/\.(mp4|webm)$/i.test(o.out)) throw new Error('--out must end in .mp4 or .webm');
  // An assisted recording is written to <name>-assisted.<ext>, so judged evidence can leave it out by name.
  const a = resolveAssist({ assist: o.assist, params: o.params === true ? '' : o.params });
  const out = path.resolve(markFile(o.out, a.assisted));
  const tokens = parseSeq(o.seq);
  const dist = o.dist || './dist';
  const params = a.params.replace(/^[?&]+/, '');
  const scale = Math.max(1, Math.min(4, parseInt(o.scale || '2', 10) || 2));

  const fileSrv = await serveStatic(dist, 0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'play-record-'));
  const browser = await launchPlaywright();
  let videoSrc = null;
  let audioB64 = null;
  let audioOn = false;
  try {
    const context = await browser.newContext({
      viewport: { width: 304 * scale, height: 224 * scale },
      recordVideo: { dir: tmp, size: { width: 608, height: 448 } },
    });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${fileSrv.port}/index.html${params ? `?${params}` : ''}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('canvas', { timeout: 30000 });
    await sleep(500);
    if (/[?&]?audiorec=1/.test(`?${params}`)) {
      try {
        audioOn = await page.evaluate(async () => {
          if (!window.__AUDIO_CAPTURE__) return false;
          return window.__AUDIO_CAPTURE__.start();
        });
      } catch {
        audioOn = false;
      }
      log(`record: audio capture ${audioOn ? 'on' : 'unavailable, video only'}`);
    }
    const t0 = Date.now();
    const held = new Set();
    for (const tok of tokens) {
      for (const k of [...held]) {
        if (!tok.keys.includes(k)) {
          await page.keyboard.up(k);
          held.delete(k);
        }
      }
      for (const k of tok.keys) {
        if (!held.has(k)) {
          await page.keyboard.down(k);
          held.add(k);
        }
      }
      await sleep((tok.frames * 1000) / 60);
    }
    for (const k of [...held]) {
      try {
        await page.keyboard.up(k);
      } catch {}
    }
    await sleep(400);
    if (audioOn) {
      try {
        audioB64 = await page.evaluate(() => window.__AUDIO_CAPTURE__.stop());
      } catch (e) {
        log(`record: audio stop failed (${e.message})`);
      }
    }
    const videoMs = Date.now() - t0;
    videoSrc = await page.video().path();
    await context.close();
    log(`record: captured ${videoMs}ms of video`);

    let audioFile = null;
    if (audioB64) {
      audioFile = path.join(tmp, 'audio.webm');
      fs.writeFileSync(audioFile, Buffer.from(audioB64, 'base64'));
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (/\.webm$/i.test(out) && !audioFile) {
      fs.copyFileSync(videoSrc, out);
    } else {
      const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
      if (!hasFfmpeg) throw new Error('ffmpeg not found: cannot mux to the requested container');
      const args = ['-y', '-i', videoSrc];
      if (audioFile) args.push('-i', audioFile);
      if (/\.mp4$/i.test(out)) {
        args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
        args.push(audioFile ? ['-c:a', 'aac'] : ['-an']);
        if (audioFile) args.push('-shortest');
      } else {
        args.push('-c', 'copy');
        if (audioFile) args.push('-shortest');
      }
      args.push(out);
      const r = spawnSync('ffmpeg', args.flat(), { stdio: 'pipe', encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').slice(-500)}`);
    }
    console.log(JSON.stringify({ ok: true, out, audio: !!audioB64, assisted: a.assisted, ...(a.assisted ? { assist: a.assist } : {}) }));
  } finally {
    try {
      await browser.close();
    } catch {}
    fileSrv.server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Automated gate, two phases. (a) normal play, never assisted: no console/page
// errors, reach Game, land a kill or score, and account every death with a
// respawn (ending on GameOver is acceptable and reported). (b) completion run
// under invuln=1: a scripted fighting walk that must reach MissionComplete
// within a frame budget. Phase (b) is ASSISTED: it runs only when asked for
// with --assist invuln, and everything it writes is marked (summary
// "assisted": true, -assisted file names). It is coverage, never proof that
// the level can be completed in normal play. Exit 0/1, JSON summary on stdout.
async function cmdSmoke(o) {
  const dist = o.dist || './dist';
  const outDir = path.resolve(typeof o.out === 'string' ? o.out : './smoke-out');
  const expectKills = o['expect-kills'] !== undefined ? parseInt(o['expect-kills'], 10) : 1;
  if (!Number.isInteger(expectKills) || expectKills < 0) {
    throw new Error('--expect-kills wants a number >= 0');
  }
  const assist = resolveAssist({ assist: o.assist });
  const phase = typeof o.phase === 'string' ? o.phase.toLowerCase() : '';
  const runPhaseA = !phase || phase === 'a' || phase === 'all' || phase === 'both';
  const wantPhaseB = !phase || phase === 'b' || phase === 'all' || phase === 'both';
  if (!runPhaseA && !wantPhaseB) {
    throw new Error(`unknown --phase "${o.phase}" (want a, b, or omitted: a, plus b with --assist invuln)`);
  }
  // Invulnerability is never switched on silently: phase (b) needs the flag. Asked for by name without it, that is an
  // error; reached only by default, the phase is left out and the summary says so.
  const notes = [];
  let runPhaseB = wantPhaseB;
  if (wantPhaseB && !assist.assist.includes('invuln')) {
    if (phase) {
      throw new Error('smoke phase b plays the completion run under invulnerability: pass --assist invuln (assisted runs are coverage only), or use --phase a');
    }
    runPhaseB = false;
    notes.push('completion phase (b) not run: it plays under invulnerability, so it needs --assist invuln (assisted, coverage only)');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const shots = [];
  const summary = {
    ok: false,
    assisted: false,
    errors: [],
    errorCount: 0,
    normal: null,
    completion: null,
    shots,
    contact: null,
    notes,
  };

  // Per-session helpers. `assisted` marks what the session writes: -assisted file names.
  const S = (session, assisted = false) => ({
    session,
    snap: async (name) => {
      const file = path.join(outDir, markFile(name, assisted));
      const r = await api(session, '/shot', { method: 'POST' });
      writePng(file, r.png);
      shots.push(file);
      return r;
    },
    step: (seq, extra = {}) => api(session, '/step', { method: 'POST', body: { seq, ...extra } }),
    debug: async () => (await api(session, '/debug')).debug,
    setInvuln: async (on) => api(session, '/invuln', { method: 'POST', body: { on } }),
    errors: async () => api(session, '/errors'),
    stop: async () => {
      try {
        await api(session, '/stop', { method: 'POST', timeoutMs: 15000 });
      } catch {}
      try {
        fs.rmSync(sessionFilePath(session), { force: true });
      } catch {}
    },
  });

  // Scene-driven intro shared by both phases; events accumulate into `log`.
  // Returns {scene, frame} at Game entry, or {fail}.
  const driveIntro = async (s, tag, log) => {
    // Boot first: scene creates run inside stepped frames.
    let r = await s.step('.*10');
    log.push(...(r.events || []));
    if (r.scene === 'Title') {
      await s.snap(`${tag}-1-title.png`);
      r = await s.step('5*5');
      log.push(...(r.events || []));
      if ((await s.debug()).credits < 1) return { fail: 'coin insert did not register' };
      await s.snap(`${tag}-2-coin.png`);
      r = await s.step('.*10 enter*5');
      log.push(...(r.events || []));
      if (r.scene !== 'MissionStart') return { fail: `no MissionStart after coin+start (in ${r.scene})` };
      await s.snap(`${tag}-3-missionstart.png`);
    }
    if (r.scene === 'MissionStart') {
      for (let i = 0; i < 4 && r.scene === 'MissionStart'; i++) {
        r = await s.step('.*150');
        log.push(...(r.events || []));
      }
      if (r.scene !== 'Game') return { fail: `no Game after the card (in ${r.scene})` };
    }
    if (r.scene !== 'Game') return { fail: `stuck in ${r.scene}` };
    return { scene: r.scene, frame: r.frame };
  };

  const errCount = async (s) => {
    const e = await s.errors().catch(() => ({ console: [], page: [] }));
    return { list: e, n: (e.console || []).length + (e.page || []).length };
  };

  // Kills, player deaths, respawns and game-overs in one pass over events.
  // Enemy deaths are `death soldier-*`; player deaths are `death player-*`.
  const tally = (log) => {
    let kills = 0;
    let deaths = 0;
    let respawns = 0;
    let gameOvers = 0;
    for (const e of log) {
      if (e.type === 'death' && typeof e.name === 'string') {
        if (e.name.startsWith('player-')) deaths += 1;
        else if (e.name.startsWith('soldier-')) kills += 1;
      } else if (e.type === 'checkpoint' && e.name === 'respawn') {
        respawns += 1;
      } else if (e.type === 'gameOver') {
        gameOvers += 1;
      }
    }
    return { kills, deaths, respawns, gameOvers };
  };
  // Phase (a): normal play with tap-fire combat walk. Deaths are fine as
  // long as each one resolves to a respawn; ending on GameOver is
  // acceptable and reported.
  const runNormal = async () => {
    const s = S(`__smoke_a_${process.pid}`);
    const log = [];
    const N = {
      assisted: false, scene: null, frames: 0, score: 0, kills: 0, deaths: 0, respawns: 0,
      gameOver: false, killsOk: false, deathsOk: false,
    };
    try {
      await startDaemon({ session: s.session, dist, params: 'mission=1&seed=1', scale: 2 });
      const info = await api(s.session, '/info');
      if (info.errorCount > 0) return { fail: `console/page errors on load (${info.errorCount})`, N };
      const intro = await driveIntro(s, 'a', log);
      if (intro.fail) return { fail: intro.fail, N };
      await s.snap('a-4-game.png');
      const startFrame = intro.frame;
      const startX = (await s.debug()).player.x;
      const tap = 'z*2 .*8 z*2 .*8 z*2 .*8';
      const legs = [
        `right*120 ${tap} right*40`,
        `right*120 ${tap} right*40`,
        `right*120 ${tap} c*5 right*35`,
        `right*120 ${tap} right*40`,
        `right*120 ${tap} right*40`,
      ];
      let r = { scene: 'Game', frame: startFrame };
      for (let i = 0; i < legs.length; i++) {
        r = await s.step(legs[i]);
        log.push(...(r.events || []));
        if (i === 2) await s.snap('a-5-midrun.png');
        if (r.scene === 'GameOver') break;
      }
      // Let a trailing death animation resolve so the accounting is exact.
      for (let i = 0; i < 3; i++) {
        const t = tally(log);
        if (t.deaths <= t.respawns + t.gameOvers || r.scene === 'GameOver') break;
        r = await s.step('.*60');
        log.push(...(r.events || []));
      }
      const d = await s.debug();
      const t = tally(log);
      const errs = await errCount(s);
      summary.errors = errs.list;
      summary.errorCount = errs.n;
      await s.snap(r.scene === 'GameOver' ? 'a-6-gameover.png' : 'a-6-final.png');
      Object.assign(N, {
        scene: r.scene, frames: r.frame - startFrame, score: d.score,
        playerStartX: startX, playerEndX: d.player.x,
        kills: t.kills, deaths: t.deaths, respawns: t.respawns, gameOver: t.gameOvers > 0,
        killsOk: t.kills >= expectKills || d.score > 0,
        deathsOk: t.deaths === t.respawns + t.gameOvers && (t.gameOvers === 0 || r.scene === 'GameOver'),
      });
      if (errs.n > 0) return { fail: `${errs.n} console/page error(s) in normal play`, N };
      if (!N.killsOk) return { fail: 'no kills and no score in normal play', N };
      if (!N.deathsOk) {
        return { fail: `unresolved death (${t.deaths} deaths, ${t.respawns} respawns, ${t.gameOvers} gameovers)`, N };
      }
      return { N };
    } finally {
      await s.stop();
    }
  };

  // Phase (b): ASSISTED completion run with invuln=1. Full Mission 1 from start
  // through the boss defeat to MissionComplete. Scripted fighting walk
  // with jumps over obstacles, grenades, H/R pickups, optionally the tank,
  // and boss execution.
  const COMPLETION_BUDGET = 9000;
  const runCompletion = async () => {
    const s = S(markName(`__smoke_b_${process.pid}`, true), true);
    const log = [];
    const C = {
      assisted: true,
      assist: ['invuln'],
      scene: null,
      framesTaken: 0,
      budget: COMPLETION_BUDGET,
      deaths: 0,
      kills: 0,
      score: 0,
      invulnArmed: false,
      completed: false,
      checkpoints: [],
      bossEvents: [],
      bossDefeated: false,
      bossSeen: false,
    };
    try {
      await startDaemon({ session: s.session, dist, params: 'mission=1&seed=1&invuln=1', scale: 2 });
      const intro = await driveIntro(s, 'b', log);
      if (intro.fail) return { fail: intro.fail, C };
      // Param path must have armed god-mode; then prove the live toggle.
      if ((await s.debug()).invuln !== true) {
        return { fail: 'invuln=1 param did not arm (debug.invuln is not true)', C };
      }
      C.invulnArmed = true;
      if ((await s.setInvuln(false)).invuln !== false) {
        return { fail: 'live setInvuln(false) did not apply', C };
      }
      if ((await s.setInvuln(true)).invuln !== true) {
        return { fail: 'live setInvuln(true) did not apply', C };
      }
      await s.snap('b-4-game.png');
      const bStart = intro.frame;
      const legs = [
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
        // 7. Capped cannon demo: 2 shells draw the vehicle pool (the pool,
        //    not the shells, binds tank damage), then Down+X dismounts Juno
        //    onto the deck by the hull.
        'c*5 .*35 c*5 .*35 down+x*5 .*40',
        // 8. Foot finish: 4 grenades splash the vents (7.5 each, uncapped).
        'c*5 .*60 c*5 .*60 c*5 .*60 c*5 .*60',
        // 9. Pistol grind at the vent lane until the demolition resolves.
        //    Over-provisioned on purpose: leftover rounds fly through the
        //    corpse harmlessly once hp hits 0.
        'z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25 z*2 .*25',
      ];
      let r = { scene: 'Game', frame: bStart };
      for (let i = 0; i < legs.length; i++) {
        // Contact on every leg, last one wins: the sheet always covers the
        // leg where the run ends (usually the completion moment).
        r = await s.step(legs[i], { contactN: 6 });
        log.push(...(r.events || []));
        const contactFile = path.join(outDir, markFile('contact.png', true));
        writePng(contactFile, r.contact);
        summary.contact = contactFile;
        summary.contactFrames = r.contactFrames;
        await s.snap(`b-${5 + i}-run${i + 1}.png`);
        if (r.scene === 'MissionComplete' || r.scene === 'GameOver') break;
      }
      // If boss died or still wrapping up scene transition, step forward
      for (let i = 0; i < 40 && r.scene === 'Game'; i++) {
        r = await s.step('.*60');
        log.push(...(r.events || []));
        if (r.scene === 'MissionComplete' || r.scene === 'GameOver') break;
      }
      const d = await s.debug();
      const t = tally(log);
      const errs = await errCount(s);
      if (errs.n > summary.errorCount) {
        summary.errors = errs.list;
        summary.errorCount = errs.n;
      }
      const cps = log.filter((e) => e.type === 'checkpoint' && e.name !== 'respawn').map((e) => e.name);
      const bossEvs = log.filter((e) => e.type === 'boss').map((e) => e.name);
      const bossDefeatEvent = log.find(
        (e) => e.type === 'boss' && (e.name === 'brassback-defeated' || e.name.includes('defeat')),
      );
      const missionCompleteEvent = log.find((e) => e.type === 'missionComplete');
      // #m673: the boss must be on camera and painting while it fights.
      // Combat reports transition-only `boss-oncamera` / `boss-offcamera`;
      // a spawn with no oncamera is the R7 invisible-arena signature.
      const bossStartEvent = log.find(
        (e) =>
          e.type === 'boss' && (e.name === 'brassback-start' || e.name === 'longhaul-start'),
      );
      const bossSeenEvent = log.find((e) => e.type === 'boss' && e.name === 'boss-oncamera');

      Object.assign(C, {
        scene: r.scene,
        framesTaken: r.frame - bStart,
        deaths: t.deaths,
        kills: t.kills,
        score: d.score,
        completed: r.scene === 'MissionComplete',
        checkpoints: cps,
        bossEvents: bossEvs,
        bossDefeated: Boolean(bossDefeatEvent),
        bossSeen: Boolean(bossSeenEvent),
      });
      if (errs.n > 0) return { fail: `${errs.n} console/page error(s) in completion run`, C };
      if (r.scene === 'GameOver') return { fail: 'completion run ended on GameOver', C };
      if (bossStartEvent && !bossSeenEvent) {
        return { fail: 'boss spawned but never on camera and painting (no boss-oncamera)', C };
      }
      if (!bossDefeatEvent) return { fail: 'no boss-defeat event occurred', C };
      if (!C.completed) return { fail: `no MissionComplete (in ${r.scene} at +${C.framesTaken}f)`, C };
      if (missionCompleteEvent && bossDefeatEvent && missionCompleteEvent.frame < bossDefeatEvent.frame) {
        return {
          fail: `MissionComplete (f=${missionCompleteEvent.frame}) occurred before boss defeat (f=${bossDefeatEvent.frame})`,
          C,
        };
      }
      if (C.framesTaken > COMPLETION_BUDGET) {
        return { fail: `completion over budget (${C.framesTaken} > ${COMPLETION_BUDGET})`, C };
      }
      return { C };
    } finally {
      await s.stop();
    }
  };

  try {
    let a = null;
    let b = null;
    if (runPhaseA) {
      a = await runNormal();
      summary.normal = a.N;
      if (a.fail) summary.failReason = `normal: ${a.fail}`;
    }
    if (runPhaseB && (!a || !a.fail)) {
      summary.assisted = true;
      summary.assist = ['invuln'];
      b = await runCompletion();
      summary.completion = b.C;
      if (b.fail) summary.failReason = `completion: ${b.fail}`;
    }
    if (runPhaseA && runPhaseB) {
      summary.ok = !a?.fail && !b?.fail;
    } else if (runPhaseA) {
      summary.ok = !a?.fail;
    } else if (runPhaseB) {
      summary.ok = !b?.fail;
    }
    console.log(JSON.stringify(summary));
    if (!summary.ok) process.exitCode = 1;
  } catch (e) {
    try {
      summary.failReason = `exception: ${e.message}`;
    } catch {}
    console.log(JSON.stringify(summary));
    process.exitCode = 1;
  }
}

// Evidence is append-only, so replay never clears, replaces or renames anything that is already in --out:
//   1. the log is read ONCE and checked first (every line, every step script, every assist entry): a bad log is refused while
//      nothing has been touched, not even --out. That read is a snapshot: what the replay runs, whether it is assisted and what its
//      files are called all come from it, and nothing opens the log again, so a session that is still appending to it cannot make
//      the frames and the labels disagree (what is appended after the read belongs to a later replay);
//   2. the replay runs in a fresh attempt folder inside --out (same filesystem, so publishing is a move), and nothing it does
//      can reach the files already there;
//   3. only a finished replay is published: trace, video and frames go to the first free slot of --out (trace.jsonl, video.mp4,
//      frames/; then trace-2.jsonl ...), with the -assisted mark if the log says the run was assisted. A name that is taken
//      moves the whole set to the next slot. The paths used are in the result.
// A replay that dies half way keeps its partial recording, marked the same way, in its attempt folder: a partial recording is
// still a recording. The failed retry leaves every earlier file byte-identical.
// Whether the run was assisted is read from that same snapshot (the start params and every assist entry), not from any session
// state and not from a second look at the log.
function markAttemptFiles(attempt, assisted) {
  if (!assisted) return;
  for (const f of ['trace.jsonl', 'video.mp4']) {
    const from = path.join(attempt, f);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(attempt, markFile(f, true)));
  }
}

async function cmdReplay(o) {
  if (!o.log) throw new Error('replay needs --log <file>');
  if (!o.out) throw new Error('replay needs --out <folder>');
  const input = readInputLog(o.log); // the only read of the log: the replay, its labels and its file names all come from this object
  const dist = o.dist ? path.resolve(o.dist) : input.start.dist;
  if (!dist || !fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) throw new Error(`dist folder not found: ${dist}`);
  const { runReplay } = await import('./lib/replay.mjs'); // loads the browser library: a live session can append to the log meanwhile
  const { assisted, assist } = input;
  const outDir = path.resolve(o.out);
  fs.mkdirSync(outDir, { recursive: true });
  const attempt = fs.mkdtempSync(path.join(outDir, 'attempt-'));
  let result;
  try {
    result = await runReplay({
      input, // the snapshot itself, not the path: runReplay never reopens the log
      dist,
      outDir: attempt,
      scale: parseInt(o.scale || '2', 10) || 2,
    });
  } catch (e) {
    markAttemptFiles(attempt, assisted);
    throw new Error(`${e.message} (what the attempt wrote is kept in ${attempt}; nothing else in ${outDir} was touched)`);
  }
  let published;
  try {
    published = publishRun(attempt, outDir, assisted);
  } catch (e) {
    markAttemptFiles(attempt, assisted);
    throw new Error(`${e.message} (the finished replay is kept in ${attempt})`);
  }
  try {
    fs.rmdirSync(attempt); // empty now; rmdir refuses anything that is not
  } catch {}
  if (published.slot > 1) {
    log(`replay: ${outDir} already held a replay, which is untouched; this one is run ${published.slot}: ${path.basename(published.trace)}, ${path.basename(published.video)}${published.frames ? `, ${path.basename(published.frames)}/` : ''} (detect --run ${published.slot})`);
  }
  for (const a of result.assistApplied) {
    if (!a.exact) log(`replay: assist ${a.assist} ${a.on ? 'on' : 'off'} was logged at frame ${a.frame} but applied at frame ${a.appliedAt}: the replay does not line up with the session`);
  }
  for (const a of result.assistNotApplied) {
    log(`replay: assist ${a.assist} ${a.on ? 'on' : 'off'} was logged at frame ${a.frame}, after the last frame this replay reached: not applied`);
  }
  console.log(
    JSON.stringify({
      ...result,
      video: published.video,
      trace: published.trace,
      frames: published.frames,
      run: published.slot,
      outDir,
      assisted,
      ...(assisted ? { assist } : {}),
    }),
  );
}

async function cmdDetect(o) {
  if (!o.rec) throw new Error('detect needs --rec <folder>');
  if (o.hook === true) throw new Error('--hook wants a module path');
  const run = o.run === undefined ? 1 : Number(o.run === true ? NaN : o.run);
  if (!Number.isInteger(run) || run < 1) throw new Error('--run wants a whole number >= 1 (the replay\'s "run" in its result)');
  const { runDetect } = await import('./lib/detect.mjs');
  const result = await runDetect({
    recDir: o.rec,
    run,
    hook: typeof o.hook === 'string' ? o.hook : null,
    strictSuspects: o['strict-suspects'] !== undefined && o['strict-suspects'] !== 'false',
  });
  console.log(JSON.stringify(result));
}

async function cmdBot(o) {
  const { runBot } = await import('./lib/bot.mjs');
  const result = await runBot({
    dist: o.dist || null,
    mode: o.mode || 'full',
    seed: parseInt(o.seed || '1', 10) || 1,
    params: o.params || '',
    frames: parseInt(o.frames || '18000', 10) || 18000,
    logDir: o['log-dir'] || o.logDir || '.play',
    session: o.session || null,
    assist: o.assist,
  });
  console.log(JSON.stringify(result));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') usage(false);
  // `<cmd> --help` prints usage and exits 0 before anything runs (no daemon, browser or files).
  if (rest.includes('--help') || rest.includes('-h')) usage(false);
  let o;
  try {
    o = parseOpts(rest);
    if (cmd === 'serve') await cmdServe(o);
    else if (cmd === 'start') await cmdStart(o);
    else if (cmd === 'step') await cmdStep(o);
    else if (cmd === 'shot') await cmdShot(o);
    else if (cmd === 'stop') await cmdStop(o);
    else if (cmd === 'invuln') await cmdInvuln(o);
    else if (cmd === 'record') await cmdRecord(o);
    else if (cmd === 'replay') await cmdReplay(o);
    else if (cmd === 'detect') await cmdDetect(o);
    else if (cmd === 'bot') await cmdBot(o);
    else if (cmd === 'smoke') await cmdSmoke(o);
    else throw new Error(`unknown command "${cmd}"`);
  } catch (e) {
    log(`error: ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('play.mjs')) {
  main();
}
