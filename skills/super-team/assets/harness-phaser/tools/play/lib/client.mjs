// Daemon session helpers for the play CLI.
import fs from 'node:fs';
import path from 'node:path';

export function checkSessionName(name) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name || '')) {
    throw new Error(`bad session name "${name}" (want 1-64 chars of A-Za-z0-9_-)`);
  }
  return name;
}

export function sessionFilePath(session) {
  checkSessionName(session);
  return path.resolve('.play', `${session}.json`);
}

export function sessionLogPath(session, logDir = '.play') {
  checkSessionName(session);
  return path.resolve(logDir, `${session}.log.jsonl`);
}

export function readSessionFile(session) {
  const file = sessionFilePath(session);
  if (!fs.existsSync(file)) throw new Error(`no such session "${session}" (is it started?)`);
  return { file, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function daemonBase(sess) {
  if (!sess || !sess.port) throw new Error('session file is missing the daemon port');
  return `http://127.0.0.1:${sess.port}`;
}

export async function api(session, endpoint, { method = 'GET', body = null, timeoutMs = 0 } = {}) {
  const sess = readSessionFile(session);
  const ctrl = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  let res;
  try {
    res = await fetch(`${daemonBase(sess)}${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl,
    });
  } catch (e) {
    throw new Error(`daemon for session "${session}" is unreachable (${e.message})`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`daemon returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `daemon request failed (${res.status})`);
  }
  return json;
}

export async function health(session) {
  return api(session, '/health', { timeoutMs: 5000 });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait until the daemon writes its session file with the expected pid and answers /health. */
export async function waitForDaemon(file, pid, timeoutMs = 60000) {
  const start = Date.now();
  let lastErr = 'session file never appeared';
  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.existsSync(file)) {
        const sess = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (sess.pid === pid && sess.port) {
          const res = await fetch(`http://127.0.0.1:${sess.port}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) return sess;
          lastErr = 'daemon port not answering yet';
        } else {
          lastErr = 'session file not ready yet';
        }
      }
    } catch (e) {
      lastErr = e.message;
    }
    await sleep(250);
  }
  throw new Error(`daemon did not come up in time (${lastErr})`);
}
