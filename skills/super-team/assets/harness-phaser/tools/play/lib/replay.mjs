// Lockstep replay runner: reproduces a session input log frame-by-frame,
// captures every frame (native 304x224 x2 nearest = 608x448),
// writes trace.jsonl via __AGENT__.trace(), and assembles video.mp4 at 60 fps with ffmpeg.
//
// It never replaces a file: trace.jsonl and the frame PNGs are created exclusively and ffmpeg runs with -n, so a folder that
// already holds a replay makes this throw instead of damaging it. `play.mjs replay` always hands it a fresh attempt folder and
// then publishes the result into the destination (lib/evidence.mjs).
//
// Besides the key scripts, the log holds the assist switches (`invuln --on|--off`) and the frame each one happened at. They are
// re-applied here at those frames, so a session that was assisted for part of its run replays assisted for the same part.
//
// This module never opens the log. The caller reads it once (`readInputLog`, which parses and checks it whole), labels the run from
// that read and hands the same parsed object in, so what is replayed, whether it is assisted and what its files are called are one
// snapshot. A session that is still appending to the log cannot make them disagree.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serveStatic } from './server.mjs';

const W = 608;
const H = 448;
const BATCH_SIZE = 30;

export async function runReplay({ input, dist, outDir, scale = 2 }) {
  // `input` is what readInputLog returned, not a path: a path would be a second look at a log that may have grown since the first.
  if (!input || !input.start || !Array.isArray(input.steps) || !Array.isArray(input.assists)) {
    throw new Error('runReplay wants the parsed input log (input: readInputLog(file)), not a log path: it never opens the log itself');
  }
  const targetDist = dist ? path.resolve(dist) : input.start.dist;
  if (!targetDist) throw new Error(`no dist folder: the log's start entry names none and --dist was not given`);
  const params = String(input.start.params || '').replace(/^[?&]+/, '');
  const outFolder = path.resolve(outDir);
  const framesFolder = path.join(outFolder, 'frames');
  fs.mkdirSync(framesFolder, { recursive: true });

  const traceFile = path.join(outFolder, 'trace.jsonl');
  const videoFile = path.join(outFolder, 'video.mp4');

  const fileSrv = await serveStatic(targetDist, 0);
  let browser;
  let traceStream = null;
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    } catch {
      browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    }

    const context = await browser.newContext({
      viewport: { width: 304 * scale, height: 224 * scale },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => {
      pageErrors.push(String((e && e.message) || e));
    });

    const gameUrl = `http://127.0.0.1:${fileSrv.port}/index.html?agent=1${params ? `&${params}` : ''}`;
    await page.goto(gameUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__AGENT__, null, { timeout: 30000, polling: 100 });

    // Ensure __AGENT__.trace is available (polyfill for older dists without recompiled agentMode)
    await page.evaluate(() => {
      if (!window.__AGENT__.trace) {
        const KEY_MAP = {
          arrowleft: 'left',
          arrowright: 'right',
          arrowup: 'up',
          arrowdown: 'down',
          enter: 'enter',
          escape: 'esc',
          '5': '5',
          z: 'z',
          x: 'x',
          c: 'c',
          p: 'p',
          left: 'left',
          right: 'right',
          up: 'up',
          down: 'down',
          esc: 'esc',
        };
        window.__AGENT__.trace = function (keys) {
          const game = window.__GAME__;
          const info = window.__AGENT__.info();
          const debug = window.__AGENT__.debug ? window.__AGENT__.debug() : { player: { x: 0, y: 0, alive: false }, lives: 0, score: 0 };
          const drained = [];
          if (Array.isArray(window.__AGENT_EVENTS__)) {
            drained.push(...window.__AGENT_EVENTS__);
            window.__AGENT_EVENTS__ = [];
          }
          let gameScene = null;
          try {
            gameScene = game ? game.scene.getScene('Game') : null;
            if (!gameScene || !gameScene.sys || !gameScene.sys.settings.active) gameScene = null;
          } catch {}
          let cam = { x: 0, y: 0 };
          if (gameScene && gameScene.cameras && gameScene.cameras.main) {
            cam = {
              x: Math.round(gameScene.cameras.main.scrollX * 10) / 10,
              y: Math.round(gameScene.cameras.main.scrollY * 10) / 10,
            };
          }
          let player;
          const gs = gameScene;
          if (gs && gs.player) {
            const p = gs.player;
            const aboard = Boolean(gs.boardedTank || (gs.tanks && gs.tanks.some && gs.tanks.some((t) => t.aboard && t.alive)));
            player = {
              x: Math.round(p.x * 10) / 10,
              y: Math.round(p.y * 10) / 10,
              vx: Math.round((p.body?.velocity?.x ?? 0) * 10) / 10,
              vy: Math.round((p.body?.velocity?.y ?? 0) * 10) / 10,
              visible: p.visible !== false && (p.alpha === undefined || p.alpha > 0),
              alive: debug.player.alive && gs.dying === 0,
              controllable: gs.dying === 0 && !gs.pausedGame && gs.clearFreeze === 0,
              invuln: gs.invuln > 0 || Boolean(debug.invuln),
              aboard,
            };
          } else {
            player = {
              x: debug.player.x,
              y: debug.player.y,
              vx: 0,
              vy: 0,
              visible: false,
              alive: debug.player.alive,
              controllable: false,
              invuln: Boolean(debug.invuln),
              aboard: false,
            };
          }
          let boss = null;
          const combat = gs ? gs.combat : null;
          const b = combat ? combat.boss : null;
          if (b && b.alive && b.hp > 0) {
            const bx = b.hull ? b.hull.x : (b.baseX ?? 0);
            const by = b.hull ? b.hull.y : 0;
            const bVis = b.hull ? b.hull.visible && b.hull.alpha > 0 : true;
            const onCamera = bx + 120 >= cam.x && bx - 120 <= cam.x + 304;
            const name = b.kind === 'longhaul' || (b.hull?.texture?.key && b.hull.texture.key.includes('lh')) ? 'longhaul' : 'brassback';
            boss = { name, x: Math.round(bx * 10) / 10, y: Math.round(by * 10) / 10, visible: bVis, onCamera, hp: b.hp ?? 0 };
          }
          let enemies = 0;
          if (combat && Array.isArray(combat.soldiers)) {
            for (const s of combat.soldiers) if (s && s.alive) enemies++;
          }
          if (combat && combat.truck && combat.truck.alive) enemies++;
          let enemyBullets = 0;
          if (combat && combat.fire) {
            if (Array.isArray(combat.fire.bullets)) for (const eb of combat.fire.bullets) if (eb && eb.alive) enemyBullets++;
            if (Array.isArray(combat.fire.grenades)) for (const eg of combat.fire.grenades) if (eg && eg.alive) enemyBullets++;
            if (Array.isArray(combat.fire.rockets)) for (const er of combat.fire.rockets) if (er && er.alive) enemyBullets++;
          }
          if (b && Array.isArray(b.shells)) {
            for (const sh of b.shells) if (sh && sh.alive) enemyBullets++;
          }
          const heldKeys = Array.isArray(keys) ? [...new Set(keys.map((k) => KEY_MAP[String(k).toLowerCase()] ?? String(k).toLowerCase()))] : [];
          const arenaLock = Boolean(
            gs?.truckLockActive ||
              (combat && typeof combat.bossHoldsArena === 'function' && combat.bossHoldsArena()) ||
              (combat && typeof combat.holdsArenaLock === 'function' && combat.holdsArenaLock()),
          );
          return {
            frame: info.frame,
            scene: info.scene,
            mission: 1,
            cam,
            player,
            boss,
            enemies,
            enemyBullets,
            lives: debug.lives ?? 2,
            score: debug.score ?? 0,
            keys: heldKeys,
            agentEvents: drained,
            events: drained,
            arenaLock,
            // The game's pause, as its own explicit flag: detect skips a paused stretch by this (player.controllable is false in a
            // pause too, but also in a stun, and a stun is for the softlock check to judge, not to skip).
            paused: Boolean(gs && gs.pausedGame),
          };
        };
      }
    });

    // Boot settle: pump single ticks until Boot preloads finish
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const agentInfo = () => page.evaluate(() => window.__AGENT__.info());
    let settled = await agentInfo();
    for (let i = 0; i < 60 && (settled.scene === 'Boot' || settled.loading); i++) {
      await sleep(250);
      settled = await page.evaluate(() => {
        window.__AGENT__.step(1);
        window.__AGENT_EVENTS__ = [];
        return window.__AGENT__.info();
      });
    }
    await page.evaluate(() => window.__AGENT__.resetAfterSettle());

    // Prepare offscreen canvas in page for 2x nearest-neighbor frame snapshots
    await page.evaluate(({ W, H }) => {
      const c = document.createElement('canvas');
      c.id = '__REPLAY_SNAP_CANVAS__';
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      window.__REPLAY_SNAP_CTX__ = ctx;
      window.__REPLAY_SNAP_CANVAS__ = c;
    }, { W, H });

    // The counter a live session started from. The assist entries of the log are indexed by it, like the steps' before/after.
    let cur = (await agentInfo()).frame;

    let globalFrame = 1;
    // Exclusive: an existing trace makes this throw, it is never appended to or replaced.
    traceStream = fs.createWriteStream(null, { fd: fs.openSync(traceFile, 'wx') });
    const held = new Set();

    // The assist switches of the log, applied when the game's frame counter reaches the frame each one was logged at.
    const pending = [...input.assists].sort((a, b) => a.frame - b.frame);
    const assistApplied = [];
    const applyDue = async () => {
      while (pending.length > 0 && pending[0].frame <= cur) {
        const ev = pending.shift();
        const now = await page.evaluate((on) => {
          if (!window.__AGENT__ || typeof window.__AGENT__.setInvuln !== 'function') {
            throw new Error('window.__AGENT__.setInvuln(on) is not available');
          }
          window.__AGENT__.setInvuln(on === true);
          return window.__AGENT__.debug().invuln;
        }, ev.on);
        if (now !== ev.on) {
          throw new Error(`assist ${ev.assist} did not switch ${ev.on ? 'on' : 'off'} at frame ${ev.frame} (the game reports ${now})`);
        }
        assistApplied.push({ assist: ev.assist, on: ev.on, frame: ev.frame, appliedAt: cur, exact: cur === ev.frame });
      }
    };

    for (const step of input.steps) {
      for (const tok of step.tokens) {
        // Apply key changes
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

        let remaining = tok.frames;
        while (remaining > 0) {
          await applyDue();
          // A batch stops where the next switch is due, so the switch lands on the frame it was logged at.
          const toNext = pending.length > 0 ? Math.max(1, pending[0].frame - cur) : Infinity;
          const batch = Math.min(remaining, BATCH_SIZE, toNext);
          const out = await page.evaluate(
            ({ count, heldList }) => {
              const res = [];
              const gameCanvas = document.querySelector('canvas');
              const ctx = window.__REPLAY_SNAP_CTX__;
              const canvas = window.__REPLAY_SNAP_CANVAS__;
              for (let i = 0; i < count; i++) {
                window.__AGENT__.step(1);
                const tr = window.__AGENT__.trace(heldList);
                ctx.drawImage(gameCanvas, 0, 0, canvas.width, canvas.height);
                const b64 = canvas.toDataURL('image/png').split(',')[1];
                res.push({ tr, b64 });
              }
              return { res, frame: window.__AGENT__.info().frame };
            },
            { count: batch, heldList: [...held] },
          );

          for (const item of out.res) {
            traceStream.write(JSON.stringify(item.tr) + '\n');
            const frameFileName = `${String(globalFrame).padStart(6, '0')}.png`;
            fs.writeFileSync(path.join(framesFolder, frameFileName), Buffer.from(item.b64, 'base64'), { flag: 'wx' });
            globalFrame++;
          }
          cur = out.frame;
          remaining -= batch;
        }
      }
    }
    await applyDue(); // a switch logged at the very last frame

    await new Promise((resolve, reject) => {
      traceStream.once('error', reject);
      traceStream.end(resolve);
    });

    // Assemble video.mp4 with ffmpeg at 60 fps
    const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
    if (!hasFfmpeg) throw new Error('ffmpeg not found: cannot assemble video.mp4');

    const inputPattern = path.join(framesFolder, '%06d.png');
    const ffmpegArgs = [
      '-n', // never overwrite: an existing video.mp4 is an error, not a casualty
      '-framerate', '60',
      '-i', inputPattern,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '17',
      '-pix_fmt', 'yuv420p',
      videoFile,
    ];

    const r = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'pipe', encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`ffmpeg failed (${r.status}): ${(r.stderr || '').slice(-500)}`);
    }

    return {
      ok: true,
      video: videoFile,
      trace: traceFile,
      frames: framesFolder,
      framesCount: globalFrame - 1,
      // The assist switches this replay made, with the frame each was logged at and the frame it was applied at.
      assistApplied,
      // Switches logged after the last frame this replay reached (none, when the replay matches the session).
      assistNotApplied: pending.map((e) => ({ assist: e.assist, on: e.on, frame: e.frame })),
      errors: { console: consoleErrors, page: pageErrors },
    };
  } finally {
    // What a replay that died got through is flushed to disk before the process can exit: a partial recording is still a recording.
    if (traceStream && !traceStream.writableEnded) {
      await new Promise((resolve) => {
        traceStream.once('error', resolve);
        traceStream.end(resolve);
      });
    }
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    fileSrv.server.close();
  }
}
