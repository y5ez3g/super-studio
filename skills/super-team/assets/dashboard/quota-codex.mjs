#!/usr/bin/env node
// Codex plan meters from its own session logs (no model call): the newest reading's rate-limit windows, each named by its
// length (300 min: 5-hour, 10080 min: week), never by its position. Plans differ: one logs a 5-hour primary and a weekly
// secondary, another (e.g. prolite) only a weekly primary. CODEX_HOME replaces ~/.codex, as it does for Codex itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function getLocalISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(offset) / 60));
  const offM = pad(Math.abs(offset) % 60);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${sign}${offH}:${offM}`;
}

function findRolloutFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findRolloutFiles(fullPath));
      } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore unreadable dirs
  }
  return results;
}

function extractRateLimits(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.rate_limits && typeof obj.rate_limits === 'object') return obj.rate_limits;
  for (const key of Object.keys(obj)) {
    const res = extractRateLimits(obj[key]);
    if (res) return res;
  }
  return null;
}

const sessionsDir = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');
const files = findRolloutFiles(sessionsDir);

if (files.length === 0) {
  console.error('No rollout files found in', sessionsDir);
  process.exit(1);
}

// Newest file first; some sessions log rate_limits with null windows, so keep looking until a reading has numbers.
const byMtime = files
  .map((f) => { try { return [f, fs.statSync(f).mtimeMs]; } catch { return null; } })
  .filter(Boolean)
  .sort((a, b) => b[1] - a[1]);

let newestFile = null;
let lastRateLimits = null;
for (const [file] of byMtime.slice(0, 50)) {
  let found = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('rate_limits')) continue;
    try {
      const rl = extractRateLimits(JSON.parse(line));
      if (rl && rl.primary && rl.primary.used_percent !== undefined && rl.primary.used_percent !== null) found = rl;
    } catch {}
  }
  if (found) { lastRateLimits = found; newestFile = file; break; }
}

if (!lastRateLimits) {
  console.error('No usable rate_limits found in the 50 newest rollout files under', sessionsDir);
  process.exit(1);
}

// The last log line can predate a reset; a window whose reset time has passed is now (close to) empty.
const nowSec = Date.now() / 1000;
const windows = [];
for (const key of ['primary', 'secondary']) {
  const w = lastRateLimits[key];
  if (!w || w.used_percent === undefined || w.used_percent === null) continue;
  const mins = typeof w.window_minutes === 'number' ? w.window_minutes : null;
  const label = mins === 300 ? '5-hour' : mins === 10080 ? 'week' : mins ? `${mins} min` : key;
  const resetSince = !!(w.resets_at && w.resets_at < nowSec);
  windows.push({ label, windowMinutes: mins, used: resetSince ? 0 : Math.round(w.used_percent), lastSeen: Math.round(w.used_percent),
    resetsAt: w.resets_at ? getLocalISO(new Date(w.resets_at * 1000)) : null, resetSince });
}
const named = (label) => windows.find((w) => w.label === label) || null;
const five = named('5-hour'), week = named('week');
const output = {
  windows,
  fiveHourUsed: five ? five.used : null,
  fiveHourResetsAt: five ? five.resetsAt : null,
  weekUsed: week ? week.used : null,
  weekResetsAt: week ? week.resetsAt : null,
  plan: lastRateLimits.plan_type ?? null,
  ...(windows.some((w) => w.resetSince) ? { stale: true, note: 'a reset passed since the last Codex call: used% reads 0 for that window (lastSeen keeps the old reading)' } : {}),
  source: newestFile
};

console.log(JSON.stringify(output));
