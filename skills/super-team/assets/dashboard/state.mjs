#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

function parseValue(val) {
  if (val === undefined || val === null) return val;
  try {
    const v = JSON.parse(val);
    // k='"text"' and k="text" should mean the same thing: unwrap a string that was quoted twice
    if (typeof v === 'string' && /^".*"$/.test(v)) { try { return JSON.parse(v); } catch { return v; } }
    return v;
  } catch {
    return val;
  }
}

function getByPath(obj, dotPath) {
  const parts = dotPath.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (curr[part] === undefined || curr[part] === null || typeof curr[part] !== 'object') {
      curr[part] = {};
    }
    curr = curr[part];
  }
  curr[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------------------------------------------
// Progress board. state.derived is computed here, from files on disk, every time state.js is written, so the board costs the
// TL no calls. It lives in state.js only; state.json stays the source of truth. A missing or unreadable file empties its own
// part of the board and never fails `st`.
//   team/builds/<tag>/              a build: a folder (one plain name, the build's git tag) holding index.html or NOTES.md or
//                                   both. The latest build is the folder created last: by the folder's own birth time, or its
//                                   mtime where the filesystem keeps none. Editing files inside an old build doesn't move it.
//                                   Also read: hero.png (else hero.jpg) and NOTES.md's first non-empty line.
//   team/rounds/R<n>/request.md     round n has started; the file's time is the request time
//   team/rounds/R<n>/feedback.md    the reviewer's feedback. Front matter, all four fields required: build (a tag), reviewer (not
//                                   empty), items and bugs (whole numbers, 0 or more). A file that breaks it is listed in
//                                   derived.malformed with its round and the reason, and is left out of every count.
//   team/rounds/R<n>/response.md    the TL's checklist: lines starting "- [x]" are done, "- [ ]" to do, "- [-]" declined (the
//                                   reason follows " — ")
//   team/gate/last.json, log.jsonl  gate runs, written by scripts/gate.sh (the gate is optional). Each run carries "commit" (full
//                                   sha of the gated commit) and "config" (sha256 of team/gate.json); a run without them is unbound
//   team/gate.json                  gate checks; a check may carry "covers": ["A1", ...] naming spec ids
//   the spec (state.spec, a repo-relative path; docs/game-spec/SPEC.md when unset)  acceptance lines "- [tag] A<n>: text" under
//     "## Acceptance", and "[judge]" / "[owner]" lines under "## Aesthetic bar". state.acceptance, when set, names a separate file
//     with the same two sections; the user's spec is never edited.
// Acceptance statuses belong to ONE build, the latest: gate results whose commit is its tag's commit and whose config is the
// sha256 of the gate.json on disk now, and an owner sign-off that names its tag. With no gate result at all, the gate's lines
// are "unchecked" (not checked by a gate). [judge] lines are "reviewed": v0.11 gives no scores, so they are the reviewer's call
// in the feedback rounds, never open or failing.
// ---------------------------------------------------------------------------------------------------------------
const DEFAULT_PORT = 8765;
const GIT_TIMEOUT_MS = 5000;
const PHASES = ['planning', 'building', 'improving', 'wrapping', 'done', 'paused'];
const clip = (s, n = 500) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { const t = readText(p); if (t == null) return null; try { return JSON.parse(t); } catch { return null; } };
const listDir = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const fileMs = (p) => { try { const s = fs.statSync(p); return s.isFile() ? s.mtimeMs : null; } catch { return null; } };
const guard = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const iso = (ms) => getLocalISO(new Date(ms));
// A build tag is one folder name under team/builds/ and one git tag: never a path, and (checked where git is called) never an option or a range.
const isPlainTag = (t) => typeof t === 'string' && /^\w[\w.+@-]*$/.test(t);

// The phase the board shows: state.phase when it is one of the six. "planning" holds only until the plan is approved, so a
// planning (or missing) phase reads as building once plan.approved is true.
function phaseOf(state) {
  const p = typeof state.phase === 'string' ? state.phase.trim().toLowerCase() : '';
  if (PHASES.includes(p) && p !== 'planning') return p;
  return isObj(state.plan) && state.plan.approved === true ? 'building' : 'planning';
}

// state.roundsMax as a cap: a whole number from 1 to 99 (a numeric string too), else null (no cap).
function roundsCap(v) {
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? parseInt(v, 10) : v;
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

function unquote(v) {
  v = v.trim();
  const q = v.match(/^(["'])(.*)\1\s*(?:#.*)?$/);
  return q ? q[2] : v.replace(/\s+#.*$/, '').trim();
}

// Flat YAML between the first two '---' lines: "key: value", inline lists "[a, b]" and block lists ("- item").
// Returns null when the file does not open with a closed block. Lines it can't read are ignored.
function parseFrontMatter(src) {
  if (typeof src !== 'string') return null;
  const lines = src.replace(/^﻿/, '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || lines[i].trim() !== '---') return null;
  const fm = {};
  let key = null;
  for (i += 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') return fm;
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) { key = kv[1].toLowerCase(); fm[key] = unquote(kv[2]); continue; }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key && (Array.isArray(fm[key]) || fm[key] === '')) {
      if (!Array.isArray(fm[key])) fm[key] = [];
      fm[key].push(unquote(item[1]));
    }
  }
  return null;
}

// The body's first paragraph (after the front matter), as plain text: the reviewer's own words for the board.
function bodySummary(src) {
  if (typeof src !== 'string') return null;
  const lines = src.replace(/^﻿/, '').split(/\r?\n/);
  let i = 0, fences = 0;
  for (; i < lines.length; i++) if (lines[i].trim() === '---' && ++fences === 2) break;
  const para = [];
  let fence = false;
  for (i += 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('```')) { fence = !fence; if (para.length) break; continue; }
    if (fence) continue;
    if (!t) { if (para.length) break; continue; }
    if (/^(#|\||<)/.test(t)) { if (para.length) break; continue; }   // headings, code, tables and html are not prose
    para.push(t.replace(/^[-*>]\s+/, '').replace(/[*_`]/g, ''));
  }
  return para.length ? clip(para.join(' '), 240) : null;
}

// feedback.md's front matter, every field required: build (a tag: one folder name under team/builds/), reviewer (not empty),
// items and bugs (whole numbers, 0 or more). Returns { feedback } or { problems: [text, ...] }; the problems read as one reason.
function checkFeedback(fm) {
  const missing = [];
  const bad = [];
  const raw = (k) => (fm[k] == null ? '' : Array.isArray(fm[k]) ? fm[k].join(', ') : String(fm[k]).trim());
  const one = (k) => {
    const s = raw(k);
    if (!s) missing.push(k);
    else if (Array.isArray(fm[k])) bad.push(`${k} must be one value, not a list`);
    else return s;
    return null;
  };
  const build = one('build');
  if (build !== null && !isPlainTag(build)) bad.push(`build must be a tag, one folder name under team/builds/ (got "${clip(build, 40)}")`);
  const reviewer = one('reviewer');
  const counts = {};
  for (const k of ['items', 'bugs']) {
    const s = one(k);
    if (s === null) continue;
    if (/^\d{1,6}$/.test(s)) counts[k] = parseInt(s, 10);
    else bad.push(`${k} must be a whole number, 0 or more (got "${clip(s, 40)}")`);
  }
  const problems = [];
  if (missing.length) problems.push(`missing ${missing.join(', ')}`);
  problems.push(...bad);
  if (problems.length) return { problems };
  return { feedback: { build, reviewer, items: counts.items, bugs: counts.bugs } };
}

// response.md, the TL's checklist. Only lines that start with "- [x]" (or "- [X]"), "- [ ]" or "- [-]" count; a declined item's
// reason follows " — ". Lines in HTML comments and fenced code blocks are not items.
function parseChecklist(src) {
  const out = { done: 0, todo: 0, declined: 0, open: [], declinedItems: [] };
  if (typeof src !== 'string') return out;
  let fence = null;   // the open fence: its character and length; only a matching fence of at least that length closes it
  for (const line of src.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) { fence = { ch: f[1][0], len: f[1].length }; continue; }
      if (f[1][0] === fence.ch && f[1].length >= fence.len && /^\s{0,3}(`{3,}|~{3,})\s*$/.test(line)) { fence = null; continue; }
    }
    if (fence) continue;
    const m = /^- \[([ xX-])\](?:\s+(.*))?$/.exec(line);
    if (!m) continue;
    const text = (m[2] || '').trim();
    if (m[1] === ' ') { out.todo += 1; out.open.push(clip(text, 200)); }
    else if (m[1] === '-') {
      out.declined += 1;
      const at = text.indexOf(' — ');
      out.declinedItems.push(at >= 0 ? { text: clip(text.slice(0, at).trim(), 200), reason: clip(text.slice(at + 3).trim(), 200) } : { text: clip(text, 200), reason: null });
    } else out.done += 1;
  }
  return out;
}

// Every round folder rounds/R<n>/ holding a request, a feedback or a response, in round order (by number, never by name).
// malformed: [{round, reason}] for the feedback files that break the front matter; they are left out of every count.
function readRounds(teamDir) {
  const dir = path.join(teamDir, 'rounds');
  const rounds = [];
  const malformed = [];
  for (const name of listDir(dir)) {
    const m = /^R(\d+)$/.exec(name);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const f = (file) => path.join(dir, name, file);
    const reqMs = fileMs(f('request.md')), fbMs = fileMs(f('feedback.md')), rsMs = fileMs(f('response.md'));
    if (reqMs == null && fbMs == null && rsMs == null) continue;
    const r = { n, request: reqMs == null ? null : iso(reqMs), feedback: null, response: null };
    if (fbMs != null) {
      const text = readText(f('feedback.md'));
      const fm = parseFrontMatter(text);
      const res = fm ? checkFeedback(fm) : { problems: ['no closed front matter block (--- ... ---) at the top of the file'] };
      if (res.problems) {
        const reason = clip(res.problems.join('; '), 240);
        r.feedback = { time: iso(fbMs), ok: false, reason };
        malformed.push({ round: n, reason });
      } else r.feedback = { time: iso(fbMs), ok: true, ...res.feedback, summary: bodySummary(text) };
    }
    if (rsMs != null) r.response = { time: iso(rsMs), ...parseChecklist(readText(f('response.md'))) };
    rounds.push(r);
  }
  rounds.sort((a, b) => a.n - b.n);
  malformed.sort((a, b) => a.round - b.round);
  return { rounds, malformed };
}

// The highest round with a request.md: the round in progress (0 before the first).
const roundK = (rounds) => rounds.reduce((k, r) => (r.request && r.n > k ? r.n : k), 0);

// When a build folder was created: its own birth time, or its mtime where the filesystem keeps no birth time (0 or missing).
// Editing a file inside the folder changes neither.
function folderMs(dir) {
  const s = guard(() => fs.statSync(dir), null);
  if (!s || !s.isDirectory()) return null;
  const born = Number(s.birthtimeMs);
  return Number.isFinite(born) && born > 0 ? born : s.mtimeMs;
}

// What a build folder offers: a hero image, NOTES.md's first non-empty line, whether index.html sits at its root, and when the
// folder was created (null when it holds neither index.html nor NOTES.md: then it is not a build).
function buildInfo(teamDir, tag) {
  const info = { hero: null, notes: null, notesFile: null, index: false, ms: null };
  if (!isPlainTag(tag)) return info;   // a tag is one folder name; never follow a path out of builds/
  const dir = path.join(teamDir, 'builds', tag);
  const names = listDir(dir);
  const pick = (pred) => names.filter(pred).filter((n) => isFile(path.join(dir, n))).sort();
  const lower = (n) => n.toLowerCase();
  const hero = pick((n) => lower(n) === 'hero.png')[0] || pick((n) => lower(n) === 'hero.jpg')[0];
  if (hero) info.hero = `builds/${tag}/${hero}`;
  const index = pick((n) => n === 'index.html')[0];
  if (index) info.index = true;
  const notes = pick((n) => lower(n) === 'notes.md')[0];
  if (notes) {
    info.notesFile = `builds/${tag}/${notes}`;
    const first = (readText(path.join(dir, notes)) || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first) info.notes = clip(first);
  }
  if (index || notes) info.ms = folderMs(dir);
  return info;
}

// Every build under team/builds/, the one created last first (a tie goes to the higher tag). A name that isn't a plain tag is not followed.
function readBuilds(teamDir) {
  const out = [];
  for (const tag of listDir(path.join(teamDir, 'builds'))) {
    if (!isPlainTag(tag)) continue;
    const info = buildInfo(teamDir, tag);
    if (info.ms != null) out.push({ tag, ...info });
  }
  return out.sort((a, b) => b.ms - a.ms || b.tag.localeCompare(a.tag, 'en', { numeric: true }));
}

// A static build (Vite, three.js) doesn't run from file://, so the board shows a command that serves the frozen folder.
// The port is state.play.port when that is a whole number from 1 to 65535 (a numeric string too), else 8765.
function playPort(state) {
  const p = state && isObj(state.play) ? state.play.port : undefined;
  const n = typeof p === 'string' && /^\s*\d+\s*$/.test(p) ? parseInt(p, 10) : p;
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_PORT;
}
const serveOf = (tag, port) => ({ port, cmd: `python3 -m http.server ${port} -d team/builds/${tag}`, url: `http://127.0.0.1:${port}/` });

// The commit a build tag points at (an annotated tag is peeled), or null when it can't be told: no such tag, no git, a hung git.
// "--" keeps a tag named like a folder of the repo from being read as a path; a name git would read as an option or a range is not asked.
function tagCommit(repoDir, tag) {
  if (!isPlainTag(tag) || tag.includes('..')) return null;
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|PREFIX|NAMESPACE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/.test(k)) delete env[k];
  }
  try {
    const out = execFileSync('git', ['-C', repoDir, 'rev-list', '-n', '1', tag, '--'],
      { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'], env }).trim();
    return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(out) ? out : null;
  } catch { return null; }
}

const DEFAULT_SPEC = 'docs/game-spec/SPEC.md';
// A repo-relative path from state.json, or null when it is absolute or climbs out of the repo.
function inRepo(repoDir, rel) {
  if (typeof rel !== 'string' || !rel.trim() || path.isAbsolute(rel)) return null;
  const abs = path.resolve(repoDir, rel), root = path.resolve(repoDir);
  return abs === root || !abs.startsWith(root + path.sep) ? null : abs;
}
function readSpec(repoDir, state) {
  const specRel = typeof state.spec === 'string' && state.spec.trim() ? state.spec.trim() : DEFAULT_SPEC;
  const accRel = typeof state.acceptance === 'string' && state.acceptance.trim() ? state.acceptance.trim() : null;
  const spec = { found: false, acceptance: [], unnumbered: 0, path: specRel, acceptancePath: accRel, note: null };
  const specAbs = inRepo(repoDir, specRel);
  if (!specAbs) { spec.note = `spec path ${clip(specRel, 120)} is outside the repo`; return spec; }
  let src = readText(specAbs);
  if (src == null) return spec;
  spec.found = true;
  if (accRel) {                                // the acceptance lines come from the separate file
    const accAbs = inRepo(repoDir, accRel);
    src = accAbs ? readText(accAbs) : null;
    if (src == null) { spec.note = accAbs ? `acceptance file ${clip(accRel, 120)} not found` : `acceptance path ${clip(accRel, 120)} is outside the repo`; return spec; }
  }
  // Same grammar as super-pm's check_spec.py: HTML comments don't count, checks live only in "## Acceptance" as
  // "- [tag] A<n>: text". Tags: super-pm v0.8's kinds (goal, platform, perf, owner) and the earlier test tags
  // (bot, trace, detector, build, audio, judge). Older specs also put [judge] and [owner] lines, with no id, in "## Aesthetic bar".
  const sections = {};
  let cur = null;
  for (const line of src.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = h[1].toLowerCase(); sections[cur] = []; } else if (cur) sections[cur].push(line.trimEnd());
  }
  const seen = new Set();
  for (const raw of sections['acceptance'] || []) {
    const m = /^- \[(goal|platform|perf|owner|bot|trace|detector|build|audio|judge)\] (A\d+): (.+)$/.exec(raw);
    if (m) {
      if (!seen.has(m[2])) { seen.add(m[2]); spec.acceptance.push({ id: m[2], tag: m[1], text: clip(m[3].trim(), 300) }); }
    } else if (/^\s*[-*]\s+\[/.test(raw)) {
      spec.unnumbered += 1;   // a tagged line in the wrong form can't be tracked; the board says so
    }
  }
  for (const raw of sections['aesthetic bar'] || []) {
    const m = /^- \[(judge|owner)\] (.+)$/.exec(raw);
    if (!m) continue;
    // These lines have no ids; the board tracks them as "Judge" and "Owner".
    spec.acceptance.push({ id: m[1] === 'judge' ? 'Judge' : 'Owner', tag: m[1], text: clip(m[2].trim(), 300) });
  }
  return spec;
}

// ---- gate results -----------------------------------------------------------------------------------------------
const FINISHED = new Set(['merged', 'green', 'held']);   // verdicts of a run that got through its checks without a failure

// Results by check name: true (passed), false (failed) or null (skipped, or unknown). Check names are not unique, so a
// second result under a name merges into the first: a failure stays a failure, whatever else passed or was skipped.
function putResult(results, name, ok) {
  if (!results.has(name)) { results.set(name, ok); return; }
  const prev = results.get(name);
  results.set(name, prev === false || ok === false ? false : prev === null || ok === null ? null : true);
}

// One gate run (last.json, or a line of log.jsonl) as the board needs it. commit and config are what scripts/gate.sh binds a
// run to; a run without them is unbound. reached: the run got to its checks. It lists a result (a skipped one is a result), or it
// finished with a verdict that needs them, so a run whose checks are all skipped is a completed run. A merge conflict or a
// config error is not.
function readRun(o) {
  if (!isObj(o)) return null;
  const hex = (v, re) => { const m = typeof v === 'string' ? re.exec(v.trim()) : null; return m ? m[1].toLowerCase() : null; };
  const results = new Map(), notes = new Map();
  if (Array.isArray(o.checks)) {
    for (const c of o.checks) {
      if (c && typeof c === 'object' && typeof c.name === 'string') {
        putResult(results, c.name, c.ok === true ? true : c.ok === false ? false : null);
        if (c.ok === false && typeof c.last === 'string' && c.last.trim() && !notes.has(c.name)) notes.set(c.name, clip(c.last.trim(), 160));
      }
    }
  } else {
    for (const n of Array.isArray(o.passed) ? o.passed : []) if (typeof n === 'string') putResult(results, n, true);
    for (const n of Array.isArray(o.failed) ? o.failed : []) if (typeof n === 'string') putResult(results, n, false);
    for (const n of Array.isArray(o.skipped) ? o.skipped : []) if (typeof n === 'string') putResult(results, n, null);   // log lines list skipped checks too
  }
  const verdict = typeof o.verdict === 'string' ? o.verdict : null;
  return {
    time: typeof o.time === 'string' ? o.time : null,
    ref: typeof o.ref === 'string' ? o.ref : null,
    verdict,
    commit: hex(o.commit, /^([0-9a-f]{40}(?:[0-9a-f]{24})?)$/i),
    config: hex(o.config, /^(?:sha256:)?([0-9a-f]{64})$/i),
    results,
    notes,
    reached: results.size > 0 || FINISHED.has(verdict),
  };
}

// A gate run in a sentence's worth of fields: how many checks passed or were skipped, which failed, and the first failure's last
// output line. A skipped check is never counted as passed.
function runBrief(r) {
  const vals = [...r.results.entries()];
  const failed = vals.filter(([, v]) => v === false).map(([n]) => n);
  return { passed: vals.filter(([, v]) => v === true).length, skipped: vals.filter(([, v]) => v === null).length, total: vals.length, failed,
    note: failed.length ? r.notes.get(failed[0]) || null : null };
}

// Which spec ids each gate check covers, and the gate evidence for the latest build (the tag `tag` at `commit`):
//   checked: some gate run got to its checks. Without one, the acceptance lines are not checked by a gate.
//   evidence: the newest run on exactly that commit AND the gate.json on disk now that got to its checks. Runs that never did
//     (conflict, error) are passed over for an older one that did; an unbound run, or one on another commit or config, never counts.
//   candidate: the newest finished run on another commit, if it is newer than the evidence (or there is none), kept apart.
//   note: why there is no evidence, in a sentence.
function readGate(teamDir, tag, commit) {
  const covers = new Map();   // id -> [check names]
  const cfgBytes = guard(() => fs.readFileSync(path.join(teamDir, 'gate.json')), null);
  const cfg = cfgBytes ? guard(() => JSON.parse(cfgBytes.toString('utf8')), null) : null;
  const config = cfgBytes ? crypto.createHash('sha256').update(cfgBytes).digest('hex') : null;
  for (const c of (cfg && Array.isArray(cfg.checks) ? cfg.checks : [])) {
    if (!c || typeof c !== 'object') continue;
    const name = typeof c.name === 'string' ? c.name : c.cmd;   // run_checks.py names a check by its cmd when it has no name
    for (const raw of (Array.isArray(c.covers) ? c.covers : typeof c.covers === 'string' ? [c.covers] : [])) {
      const id = String(raw).trim().toUpperCase();
      if (!id || typeof name !== 'string') continue;
      if (!covers.has(id)) covers.set(id, []);
      covers.get(id).push(name);
    }
  }

  const runs = [];   // newest first: last.json, then log.jsonl from its end (the log's newest line repeats last.json; harmless)
  const last = readRun(readJson(path.join(teamDir, 'gate', 'last.json')));
  if (last) runs.push(last);
  const lines = (readText(path.join(teamDir, 'gate', 'log.jsonl')) || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const r = readRun(guard(() => JSON.parse(lines[i]), null));
    if (r) runs.push(r);
  }

  const checked = runs.some((r) => r.reached);
  const short = (sha) => sha.slice(0, 7);
  const brief = (r) => ({ commit: r.commit, short: r.commit ? short(r.commit) : null, time: r.time, ref: r.ref, verdict: r.verdict });
  const evidence = commit && config ? runs.find((r) => r.reached && r.commit === commit && r.config === config) || null : null;
  const other = runs.find((r) => r.reached && r.commit && r.commit !== commit) || null;
  const candidate = other && (!evidence || runs.indexOf(other) < runs.indexOf(evidence)) ? other : null;

  let note = null;
  if (tag && checked && !evidence) {
    if (!commit) note = `Build ${tag} has no git tag in this repo, so no gate result can be tied to it. Tag the commit it was built from.`;
    else if (!config) note = 'team/gate.json is missing or unreadable, so no gate result can be matched to the current checks.';
    else if (runs.some((r) => r.reached && r.commit === commit)) note = `gate.json changed since the last gate run on ${short(commit)}. Run the gate again to test the current checks.`;
    else if (runs.some((r) => r.reached && r.commit && r.config)) note = `No gate run on this build's commit (${short(commit)}) yet.`;
    else note = 'Gate results carry no commit or config, so they cannot be tied to a build. Re-run scripts/gate.sh from this skill version.';
  }
  return {
    covers,
    checked,
    results: evidence ? evidence.results : new Map(),
    info: {
      checked,
      commit: commit || null,
      evidence: evidence ? brief(evidence) : null,
      candidate: candidate ? (() => { const rb = runBrief(candidate); return { ...brief(candidate), passed: rb.passed, failed: rb.failed.length, skipped: rb.skipped, total: rb.total, failedChecks: rb.failed, failNote: rb.note }; })() : null,
      note,
    },
  };
}

// The decisions log in time order; a decision with an unreadable time keeps its place after the previous one.
function sortDecisions(decisions) {
  const out = [];
  let prev = -Infinity;
  for (const d of (Array.isArray(decisions) ? decisions : [])) {
    if (!isObj(d)) continue;
    const ms = Date.parse(d.at);
    prev = Number.isFinite(ms) ? ms : prev;
    out.push({ ms: prev, entry: { at: d.at == null ? null : d.at, text: clip(d.text == null ? '' : d.text, 300) } });
  }
  return out.sort((a, b) => a.ms - b.ms).map((x) => x.entry);   // a stable sort: equal times keep their order
}

// What is happening now, from the phase and round k's files. The board recomputes the waits with the clock.
function activityOf(phase, plan, rounds, k) {
  if (phase === 'building') return { kind: 'building', since: Number.isFinite(Date.parse(plan.approvedAt)) ? plan.approvedAt : null };
  if (phase !== 'improving') return { kind: phase };   // planning, wrapping, done, paused
  const r = k ? rounds.find((x) => x.n === k && x.request) : null;
  if (!r) return { kind: 'no-round' };
  if (!r.feedback) return { kind: 'waiting-feedback', round: k, since: r.request };
  if (!r.response) return { kind: 'waiting-response', round: k, since: r.feedback.time };
  return { kind: 'items-open', round: k, open: r.response.todo, since: r.response.time };
}

const EMPTY_SPEC = { found: false, acceptance: [], unnumbered: 0, path: DEFAULT_SPEC, acceptancePath: null, note: null };

function deriveBoard(state, teamDir, nowMs) {
  teamDir = path.resolve(teamDir);
  const repoDir = path.dirname(teamDir);
  const plan = isObj(state.plan) ? state.plan : {};
  const phase = phaseOf(state);
  const { rounds, malformed } = guard(() => readRounds(teamDir), { rounds: [], malformed: [] });
  const builds = guard(() => readBuilds(teamDir), []);
  const top = builds[0] || null;
  const commit = top ? guard(() => tagCommit(repoDir, top.tag), null) : null;
  const build = top ? {
    tag: top.tag, time: iso(top.ms), hero: top.hero, notes: top.notes, notesFile: top.notesFile, index: top.index, commit,
    serve: top.index ? serveOf(top.tag, playPort(state)) : null,   // without index.html, NOTES.md says how to run it
  } : null;

  const k = roundK(rounds);
  const max = roundsCap(state.roundsMax);
  const round = { k, max, left: max == null ? null : Math.max(0, max - k), capReached: max != null && k >= max, overCap: max != null && k > max };

  const spec = guard(() => readSpec(repoDir, state), EMPTY_SPEC);
  const gate = guard(() => readGate(teamDir, build ? build.tag : null, commit),
    { covers: new Map(), checked: false, results: new Map(), info: { checked: false, commit, evidence: null, candidate: null, note: null } });
  const signoff = isObj(state.owner) ? state.owner.signoff : undefined;
  const signedTag = typeof signoff === 'string' && signoff.trim() ? signoff.trim() : null;
  const statusOf = (a) => {
    if (a.tag === 'owner') {
      // The sign-off is the tag of the build the owner played: it passes only while that is the latest build.
      if (signedTag && build && signedTag === build.tag) return { status: 'pass' };
      if (signoff === true) return { status: 'untested', note: 'sign-off not bound to a build' };
      if (signedTag) return { status: 'untested', note: clip(build ? `signed off ${signedTag}, not ${build.tag}` : `signed off ${signedTag}, but no build is on disk`, 160) };
      return { status: 'untested' };
    }
    if (a.tag === 'judge') return { status: 'reviewed' };   // no scores in v0.11: the reviewer's call in the feedback rounds
    if (!gate.checked) return { status: 'unchecked' };      // no gate result at all
    const checks = gate.covers.get(a.id) || [];
    const got = checks.map((n) => gate.results.get(n));
    const status = got.includes(false) ? 'fail' : checks.length && got.every((r) => r === true) ? 'pass' : 'untested';
    return { status, checks, ...(got.includes(null) ? { skipped: true } : {}) };
  };
  const lastResponse = rounds.filter((r) => r.response).pop() || null;
  const left = guard(() => {
    const endsMs = Date.parse(state.endsAt);
    return {
      timeLeftMs: Number.isFinite(endsMs) ? Math.max(0, endsMs - nowMs) : null,
      specFound: spec.found, specPath: spec.path, acceptancePath: spec.acceptancePath, specNote: spec.note,
      unnumbered: spec.unnumbered,
      acceptance: spec.acceptance.map((a) => ({ ...a, ...statusOf(a) })),
      gate: gate.info,
      open: lastResponse ? { round: lastResponse.n, items: lastResponse.response.open } : null,   // the latest response's to-do lines
    };
  }, { timeLeftMs: null, specFound: false, specPath: null, acceptancePath: null, specNote: null, unnumbered: 0, acceptance: [], gate: null, open: null });

  return {
    phase,
    build,
    builds: builds.length,
    rounds,
    round,
    activity: guard(() => activityOf(phase, plan, rounds, k), { kind: phase }),
    left,
    malformed,
    decisions: guard(() => sortDecisions(state.decisions), []),
  };
}

const baseDir = process.env.STATE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = path.join(baseDir, 'state.json');
const jsPath = path.join(baseDir, 'state.js');

let state = {};
if (fs.existsSync(jsonPath)) {
  // An unreadable state.json is the run's record: never replace it (an empty state written over it would lose the plan,
  // the limits and the history). Refuse every command, the refresh loop's included, until it is fixed or restored.
  let why = null;
  try {
    state = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!isObj(state)) why = 'it is not a JSON object';
  } catch (err) {
    why = err.message;
  }
  if (why) {
    console.error(`state.json is unreadable (${why}): fix or restore ${jsonPath}; nothing was written.`);
    process.exit(2);
  }
}

const now = getLocalISO();
const args = process.argv.slice(2);
const cmd = args[0];
let noBump = false;

if (!cmd) {
  console.log('Usage: state.mjs <command> [args...]');
  process.exit(1);
}

switch (cmd) {
  case 'touch': {
    // `touch` bumps updatedAt (the TL's "still alive" signal). `touch --no-bump` only regenerates state.js:
    // the refresh loop uses it, so a background job can't hide a stalled TL (the board reads updatedAt)
    // or overwrite a state.json write that lands while it runs.
    noBump = args.includes('--no-bump');
    break;
  }

  case 'set': {
    const [, pathArg, ...valParts] = args;
    if (!pathArg) {
      console.error('Usage: state.mjs set <dot.path> <value>');
      process.exit(1);
    }
    let value = parseValue(valParts.join(' '));
    if (pathArg === 'phase') {
      const p = typeof value === 'string' ? value.trim().toLowerCase() : value;
      if (!PHASES.includes(p)) {
        console.error(`set phase: ${JSON.stringify(value === undefined ? null : value)} is not a phase. Use planning, building, improving, wrapping, done or paused.`);
        process.exit(1);
      }
      value = p;
      // The build phase ends the first time the run moves on to improving, wrapping or done; that time never moves.
      if (['improving', 'wrapping', 'done'].includes(p) && !state.buildDoneAt) state.buildDoneAt = now;
    } else if (pathArg === 'roundsMax' && value !== null) {
      const n = roundsCap(value);
      if (n == null) {
        console.error(`set roundsMax: ${JSON.stringify(value === undefined ? null : value)} is not a round cap. Use a whole number from 1 to 99, or null for no cap.`);
        process.exit(1);
      }
      value = n;
    }
    setByPath(state, pathArg, value);
    break;
  }

  case 'push': {
    const [, pathArg, ...valParts] = args;
    if (!pathArg) {
      console.error('Usage: state.mjs push <dot.path> <value>');
      process.exit(1);
    }
    let target = getByPath(state, pathArg);
    if (!Array.isArray(target)) {
      target = [];
      setByPath(state, pathArg, target);
    }
    const rawVal = valParts.join(' ');
    target.push(parseValue(rawVal));
    break;
  }

  case 'agent': {
    // agent <name> k=v ...
    const [, name, ...kvPairs] = args;
    if (!name) {
      console.error('Usage: state.mjs agent <name> k=v ...');
      process.exit(1);
    }
    if (!Array.isArray(state.agents)) {
      state.agents = [];
    }
    let agent = state.agents.find((a) => a && a.name === name);
    if (!agent) {
      agent = { name };
      state.agents.push(agent);
    }

    for (const kv of kvPairs) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx === -1) continue;
      const k = kv.slice(0, eqIdx);
      const v = parseValue(kv.slice(eqIdx + 1));
      if (k === 'status') {
        if (agent.status !== v) {
          agent.since = now;
        }
      }
      agent[k] = v;
    }
    break;
  }

  case 'bar': {
    // bar <agent> "<label>" [status=working] [round=N]
    const [, agentName, label, ...rest] = args;
    if (!agentName || label === undefined) {
      console.error('Usage: state.mjs bar <agent> "<label>" [status=working] [round=N]');
      process.exit(1);
    }
    if (!Array.isArray(state.timeline)) {
      state.timeline = [];
    }

    // Close that agent's open bar
    const openBar = state.timeline.find((b) => b && b.agent === agentName && (b.end === null || b.end === undefined));
    if (openBar) {
      openBar.end = now;
      if (openBar.status !== 'failed' && openBar.status !== 'limited') {
        openBar.status = 'done';
      }
    }

    let barStatus = 'working';
    // the round in progress (the highest team/rounds/R<n>/ with a request.md), or none before the first
    let roundNum = guard(() => roundK(readRounds(baseDir).rounds), 0) || null;

    for (const item of rest) {
      if (item.startsWith('status=')) {
        barStatus = item.slice(7);
      } else if (item.startsWith('round=')) {
        roundNum = parseValue(item.slice(6));
      } else if (!isNaN(Number(item))) {
        roundNum = Number(item);
      } else {
        barStatus = item;
      }
    }

    state.timeline.push({
      agent: agentName,
      start: now,
      end: null,
      label,
      round: roundNum,
      status: barStatus
    });
    break;
  }

  case 'endbar': {
    // endbar <agent> [status]
    const [, agentName, statusArg] = args;
    if (!agentName) {
      console.error('Usage: state.mjs endbar <agent> [status]');
      process.exit(1);
    }
    if (Array.isArray(state.timeline)) {
      const openBar = state.timeline.find((b) => b && b.agent === agentName && (b.end === null || b.end === undefined));
      if (openBar) {
        openBar.end = now;
        openBar.status = statusArg || 'done';
      }
    }
    break;
  }

  case 'round':
  case 'roundset': {
    console.error(`${cmd} was removed in v0.11: rounds come from team/rounds/R<n>/ files`);
    process.exit(1);
  }

  case 'decision': {
    // decision "<text>"
    const [, ...textParts] = args;
    const text = textParts.join(' ');
    if (!text) {
      console.error('Usage: state.mjs decision "<text>"');
      process.exit(1);
    }
    if (!Array.isArray(state.decisions)) {
      state.decisions = [];
    }
    state.decisions.push({ at: now, text });
    break;
  }

  case 'quota': {
    // quota <cli> k=v ...
    const [, cliName, ...kvPairs] = args;
    if (!cliName) {
      console.error('Usage: state.mjs quota <cli> k=v ...');
      process.exit(1);
    }
    if (!Array.isArray(state.quota)) {
      state.quota = [];
    }
    let item = state.quota.find((q) => q && q.cli === cliName);
    if (!item) {
      item = { cli: cliName };
      state.quota.push(item);
    }
    item.checkedAt = now;
    for (const kv of kvPairs) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx === -1) continue;
      const k = kv.slice(0, eqIdx);
      const v = parseValue(kv.slice(eqIdx + 1));
      item[k] = v;
    }
    break;
  }

  case 'needs': {
    // needs add "<text>" / needs clear
    const [, subcmd, ...textParts] = args;
    if (!Array.isArray(state.needsYou)) {
      state.needsYou = [];
    }
    if (subcmd === 'add') {
      const text = textParts.join(' ');
      if (text) state.needsYou.push(text);
    } else if (subcmd === 'clear') {
      state.needsYou = [];
    } else {
      console.error('Usage: state.mjs needs add "<text>" | needs clear');
      process.exit(1);
    }
    break;
  }

  case 'tl': {
    // tl k=v ...
    const [, ...kvPairs] = args;
    if (!state.tl || typeof state.tl !== 'object') {
      state.tl = {};
    }
    for (const kv of kvPairs) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx === -1) continue;
      const k = kv.slice(0, eqIdx);
      const v = parseValue(kv.slice(eqIdx + 1));
      state.tl[k] = v;
    }
    break;
  }

  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}

// Atomic write json and js
if (!noBump) {
  state.updatedAt = now;
  const jsonTmp = `${jsonPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(jsonTmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(jsonTmp, jsonPath);
}

// state.js = state.json + the board's derived values (recomputed from disk on every write; never stored in state.json)
const derived = guard(() => deriveBoard(state, baseDir, Date.now()), {
  phase: guard(() => phaseOf(state), 'planning'), build: null, builds: 0, rounds: [], round: { k: 0, max: null, left: null, capReached: false, overCap: false },
  activity: { kind: 'planning' }, left: null, malformed: [], decisions: [],
});
const jsTmp = `${jsPath}.tmp.${process.pid}.${Date.now()}`;
fs.writeFileSync(jsTmp, `window.TEAM_STATE = ${JSON.stringify({ ...state, derived }, null, 2)};\n`, 'utf8');
fs.renameSync(jsTmp, jsPath);

console.log(`Updated state at ${now} (${cmd})`);
