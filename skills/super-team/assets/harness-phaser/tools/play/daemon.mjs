// Detached play daemon: holds one browser page on the game and executes
// lockstep key scripts. Started by `play.mjs start`, spoken to over HTTP
// on 127.0.0.1 by step/shot/stop. Not used directly.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { serveStatic } from './lib/server.mjs';
import { parseSeq, totalFrames } from './lib/keys.mjs';
import { assistLogEntry } from './lib/bot.mjs';

const SHOT_W = 608;
const SHOT_H = 448;
const LABEL_H = 18;

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 8 * 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function launchBrowser() {
  const opts = { headless: true, args: ['--autoplay-policy=no-user-gesture-required'] };
  try {
    return await chromium.launch({ ...opts, channel: 'chrome' });
  } catch {
    return await chromium.launch(opts);
  }
}

async function main() {
  const session = arg('session');
  const sessionFile = arg('session-file');
  const dist = arg('dist', './dist');
  const params = String(arg('params', '') || '').replace(/^[?&]+/, '');
  const scale = Math.max(1, Math.min(4, parseInt(arg('scale', '2'), 10) || 2));
  const logDir = arg('log-dir', path.dirname(sessionFile));
  if (!session || !sessionFile) throw new Error('daemon needs --session and --session-file');
  const logFile = path.resolve(logDir, `${session}.log.jsonl`);

  const fileSrv = await serveStatic(dist, 0);
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 304 * scale, height: 224 * scale },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const pushCapped = (arr, e) => {
    if (arr.length < 200) arr.push(e);
  };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Resource load failures are tracked with their URL via 'response'
    // below; the console copy carries no URL, so skip it here to avoid
    // double-reporting. A missing favicon is browser chrome noise, not a
    // game bug, and is ignored in both places.
    if (/^Failed to load resource/i.test(m.text())) return;
    pushCapped(consoleErrors, { kind: 'console', text: m.text().slice(0, 2000) });
  });
  page.on('response', (r) => {
    try {
      if (r.status() >= 400 && !/favicon\.ico/.test(r.url())) {
        pushCapped(consoleErrors, { kind: 'http', text: `${r.status()} ${r.url().slice(0, 500)}` });
      }
    } catch {}
  });
  page.on('pageerror', (e) => pushCapped(pageErrors, { kind: 'page', text: String(e && e.message ? e.message : e).slice(0, 2000) }));

  const gameUrl = `http://127.0.0.1:${fileSrv.port}/index.html?agent=1${params ? `&${params}` : ''}`;
  await page.goto(gameUrl, { waitUntil: 'load', timeout: 60000 });
  // Interval polling, NOT rAF: rAF polls would themselves drive Phaser's
  // loop (each poll is an animation frame) before agent mode installs.
  await page.waitForFunction(() => !!window.__AGENT__, null, { timeout: 30000, polling: 100 });

  const held = new Set();
  const errorCount = () => consoleErrors.length + pageErrors.length;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // One lockstep pump that also clears pre-settle events and reports the
  // live loader state. Returns agentInfo() ({frame, scene, loading}).
  const pump = (n) =>
    page.evaluate((k) => {
      window.__AGENT__.step(k);
      window.__AGENT_EVENTS__ = [];
      return window.__AGENT__.info();
    }, n);

  const agentInfo = () =>
    page.evaluate(() => {
      if (!window.__AGENT__) throw new Error('window.__AGENT__ is gone');
      return window.__AGENT__.info();
    });

  const rawShotB64 = async () => {
    return page.evaluate(
      ({ W, H }) => {
        const gameCanvas = document.querySelector('canvas');
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(gameCanvas, 0, 0, W, H);
        return out.toDataURL('image/png').split(',')[1];
      },
      { W: SHOT_W, H: SHOT_H },
    );
  };
  const rawShot = async () => Buffer.from(await rawShotB64(), 'base64');

  // Normalize raw canvas screenshots to 608x448 (nearest neighbor) and, for
  // contact sheets, tile them into a labeled grid. Runs in the page so no
  // native image deps are needed.
  const exportImage = (cells, frames) =>
    page.evaluate(
      async ({ shots, labels, W, H, LH }) => {
        async function load(b64) {
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = () => rej(new Error('screenshot decode failed'));
            img.src = `data:image/png;base64,${b64}`;
          });
          return img;
        }
        const imgs = [];
        for (const s of shots) imgs.push(await load(s));
        const single = labels === null;
        const cols = single ? 1 : Math.ceil(Math.sqrt(imgs.length));
        const rows = single ? 1 : Math.ceil(imgs.length / cols);
        const out = document.createElement('canvas');
        out.width = cols * W;
        out.height = rows * (H + (single ? 0 : LH));
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, out.width, out.height);
        imgs.forEach((img, i) => {
          const cx = (i % cols) * W;
          const cy = Math.floor(i / cols) * (H + (single ? 0 : LH));
          ctx.drawImage(img, cx, cy, W, H);
          if (!single) {
            ctx.fillStyle = '#000';
            ctx.fillRect(cx, cy + H, W, LH);
            ctx.fillStyle = '#fff';
            ctx.font = '12px monospace';
            ctx.fillText(labels[i], cx + 4, cy + H + 13);
          }
        });
        return out.toDataURL('image/png').split(',')[1];
      },
      { shots: cells, labels: frames, W: SHOT_W, H: SHOT_H, LH: LABEL_H },
    );

  const doStep = async (seq, contactN) => {
    const tokens = parseSeq(seq);
    const total = totalFrames(tokens);
    if (total > 60 * 300) throw new Error(`script too long (${total} frames, max 18000)`);
    const start = await agentInfo();
    const targets = [];
    for (let i = 1; i <= contactN; i++) targets.push(start.frame + Math.round((total * i) / contactN));
    const events = [];
    const cells = [];
    const cellFrames = [];
    let cur = start;
    const advance = async (n) => {
      const r = await page.evaluate((k) => {
        window.__AGENT__.step(k);
        const info = window.__AGENT__.info();
        const ev = window.__AGENT_EVENTS__ || [];
        window.__AGENT_EVENTS__ = [];
        return { frame: info.frame, scene: info.scene, events: ev };
      }, n);
      events.push(...r.events);
      cur = r;
    };
    const snapCell = async () => {
      cells.push((await rawShot()).toString('base64'));
      cellFrames.push(cur.frame);
    };
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
      // Split the token at capture boundaries so each contact target lands
      // on its own frame. Safe: no key events happen mid-token, so edge
      // (JustDown) state is identical to one unbroken step.
      let remaining = tok.frames;
      while (remaining > 0) {
        let chunk = remaining;
        if (targets.length) {
          const need = targets[0] - cur.frame;
          if (need <= 0) {
            targets.shift();
            await snapCell();
            continue;
          }
          chunk = Math.min(chunk, need);
        }
        await advance(chunk);
        remaining -= chunk;
        while (targets.length && targets[0] <= cur.frame) {
          targets.shift();
          await snapCell();
        }
      }
    }
    // Later async loads (Boot is the only loader today, so this normally
    // runs zero iterations): yield fixed-count wall-clock top-ups so a load
    // in flight can finish instead of stalling lockstep. Fixed counts keep
    // frames deterministic; a still-busy loader after the budget is loud.
    for (let i = 0; i < 10; i += 1) {
      const li = await agentInfo();
      if (!li.loading) break;
      await sleep(200);
      const r = await page.evaluate(() => {
        window.__AGENT__.step(1);
        const info = window.__AGENT__.info();
        const ev = window.__AGENT_EVENTS__ || [];
        window.__AGENT_EVENTS__ = [];
        return { frame: info.frame, scene: info.scene, loading: info.loading, events: ev };
      });
      events.push(...r.events);
      cur = { frame: r.frame, scene: r.scene };
      if (!r.loading) break;
    }
    if ((await agentInfo()).loading) {
      throw new Error(`loader still busy after step (scene=${cur.scene}); async load needs more wall-clock time`);
    }
    return { cur, events, cells, cellFrames };
  };

  // One writer at a time for everything that moves frames or flips a switch. An assist switch then lands between two steps, never
  // inside one, so the frame it is logged at is exact and the order of the log is the order things happened in.
  let tail = Promise.resolve();
  const serial = (fn) => {
    const run = tail.then(fn);
    tail = run.catch(() => {});
    return run;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, { ok: true, session });
      }
      if (req.method === 'GET' && url.pathname === '/info') {
        const info = await agentInfo();
        return send(res, 200, { ok: true, ...info, errorCount: errorCount() });
      }
      if (req.method === 'GET' && url.pathname === '/debug') {
        const debug = await page.evaluate(() => {
          if (!window.__AGENT__ || !window.__AGENT__.debug) {
            throw new Error('window.__AGENT__.debug() is not available');
          }
          return window.__AGENT__.debug();
        });
        return send(res, 200, { ok: true, debug, errorCount: errorCount() });
      }
      if (req.method === 'GET' && url.pathname === '/errors') {
        return send(res, 200, { ok: true, console: consoleErrors, page: pageErrors });
      }
      if (req.method === 'POST' && url.pathname === '/step') {
        const body = await readBody(req);
        const contactN = Math.max(0, parseInt(body.contactN ?? body.contact ?? 0, 10) || 0);
        if (contactN > 16) throw new Error('contact max is 16 frames');
        const { cur, events, cells, cellFrames } = await serial(async () => {
          const beforeFrame = (await agentInfo()).frame;
          const done = await doStep(String(body.seq ?? ''), contactN);
          try {
            fs.appendFileSync(
              logFile,
              JSON.stringify({
                event: 'step',
                type: 'step',
                session,
                seq: String(body.seq ?? ''),
                before: beforeFrame,
                after: done.cur.frame,
                time: new Date().toISOString(),
              }) + '\n',
            );
          } catch (e) {
            console.error(`failed to append to log ${logFile}: ${e.message}`);
          }
          return done;
        });
        let shot = null;
        if (body.shot) shot = await rawShotB64();
        let contact = null;
        if (contactN > 0) {
          contact = await exportImage(
            cells,
            cellFrames.map((f) => `frame ${f}`),
          );
        }
        return send(res, 200, {
          ok: true,
          frame: cur.frame,
          scene: cur.scene,
          events,
          errorCount: errorCount(),
          shot,
          contact,
          contactFrames: contactN > 0 ? cellFrames : undefined,
        });
      }
      if (req.method === 'POST' && url.pathname === '/invuln') {
        const body = await readBody(req);
        const on = body.on === true;
        const debug = await serial(async () => {
          const ready = await page.evaluate(() => Boolean(window.__AGENT__ && typeof window.__AGENT__.setInvuln === 'function'));
          if (!ready) throw new Error('window.__AGENT__.setInvuln(on) is not available');
          // Assistance is part of the run's record: the entry (with the frame it happens at) is written BEFORE the switch flips, and
          // a failed write fails the request, so an assisted frame can never exist without it. Replay applies it at that frame, and
          // "was this run ever assisted" is read from the log, so it survives the session.
          const frame = (await agentInfo()).frame;
          fs.appendFileSync(logFile, JSON.stringify(assistLogEntry({ session, assist: 'invuln', on, frame })) + '\n');
          return page.evaluate((v) => {
            window.__AGENT__.setInvuln(v === true);
            return window.__AGENT__.debug();
          }, on);
        });
        const info = await agentInfo();
        return send(res, 200, { ok: true, ...info, invuln: debug.invuln ?? null, errorCount: errorCount() });
      }
      if (req.method === 'POST' && url.pathname === '/shot') {
        const png = await rawShotB64();
        const info = await agentInfo();
        return send(res, 200, { ok: true, png, ...info, errorCount: errorCount() });
      }
      if (req.method === 'POST' && url.pathname === '/stop') {
        send(res, 200, { ok: true, stopped: true });
        setTimeout(shutdown, 100);
        return;
      }
      send(res, 404, { ok: false, error: 'unknown endpoint' });
    } catch (e) {
      send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 2000) });
    }
  });

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    try {
      for (const k of [...held]) {
        try {
          await page.keyboard.up(k);
        } catch {}
      }
    } catch {}
    try {
      await context.close();
    } catch {}
    try {
      await browser.close();
    } catch {}
    server.close();
    fileSrv.server.close();
    try {
      fs.rmSync(sessionFile, { force: true });
    } catch {}
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Boot settle: Phaser asset fetch + image decode cannot advance inside
  // synchronous lockstep ticks — each file wave needs real wall-clock time
  // between pumped steps. Pump single ticks (Boot has no update, so settle
  // burns no gameplay) until the loader idles and the first post-Boot scene
  // runs, then rewind the frame counter: `start` returns with that scene at
  // frame ~0 and untouched state on every run.
  const SETTLE_ROUNDS = 60;
  const SETTLE_SLEEP_MS = 250;
  let settled = await agentInfo();
  for (let i = 0; i < SETTLE_ROUNDS && (settled.scene === 'Boot' || settled.loading); i += 1) {
    await sleep(SETTLE_SLEEP_MS);
    settled = await pump(1);
  }
  if (settled.scene === 'Boot' || settled.loading) {
    throw new Error(
      `boot did not settle after ${SETTLE_ROUNDS} rounds ` +
        `(scene=${settled.scene} loading=${settled.loading}); giving up`,
    );
  }
  await page.evaluate(() => {
    window.__AGENT__.resetAfterSettle();
  });
  settled = await agentInfo();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const urlParams = new URLSearchParams(params);
  const seedVal = urlParams.get('seed');
  const seed = seedVal !== null && !isNaN(parseInt(seedVal, 10)) ? parseInt(seedVal, 10) : null;
  try {
    fs.appendFileSync(
      logFile,
      JSON.stringify({
        event: 'start',
        type: 'start',
        session,
        dist: path.resolve(dist),
        params,
        seed,
        scale,
        time: new Date().toISOString(),
      }) + '\n',
    );
  } catch (e) {
    console.error(`failed to append start to log ${logFile}: ${e.message}`);
  }
  fs.writeFileSync(
    sessionFile,
    JSON.stringify({
      session,
      port: server.address().port,
      pid: process.pid,
      url: gameUrl,
      dist: path.resolve(dist),
      scale,
      logFile,
      createdAt: new Date().toISOString(),
    }),
  );
  console.log(`daemon up session=${session} pid=${process.pid}`);
}

main().catch((e) => {
  console.error(`daemon failed: ${(e && e.message) || e}`);
  process.exit(1);
});
