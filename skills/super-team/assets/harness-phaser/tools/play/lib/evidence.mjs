// Append-only evidence for tools/play: where a replay's files go in a folder, and how they get there without anything
// ever being overwritten or deleted. Evidence is the run's record; a retry adds to it and never replaces it.
//
// One folder can hold several runs, one per SLOT. Slot 1 uses the plain names (trace.jsonl, video.mp4, frames/). Slot N > 1
// puts -N before the extension (trace-2.jsonl, video-2.mp4, frames-2/). The -assisted mark of an assisted run always comes
// last (trace-2-assisted.jsonl), so "the name ends in -assisted" keeps meaning "assisted". A slot is taken as soon as
// anything of it is there, in either flavour, so one slot never holds both an assisted and an unassisted run.
import fs from 'node:fs';
import path from 'node:path';
import { markFile } from './bot.mjs';

/** '' for slot 1, '-2' for slot 2 ... */
export const slotSuffix = (slot) => (slot > 1 ? `-${slot}` : '');

/** The names of one run's files in a folder. */
export function runNames(slot, assisted = false) {
  const s = slotSuffix(slot);
  return { trace: markFile(`trace${s}.jsonl`, assisted), video: markFile(`video${s}.mp4`, assisted), frames: `frames${s}` };
}

const exists = (p) => {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}; // lstat, not existsSync: a dangling link is something too

/** Is anything of this slot already in the folder, in either flavour? */
export function slotTaken(folder, slot) {
  for (const assisted of [false, true]) {
    const n = runNames(slot, assisted);
    if ([n.trace, n.video, n.frames].some((f) => exists(path.join(folder, f)))) return true;
  }
  return false;
}

/** The lowest slot with nothing in it. */
export function freeSlot(folder) {
  let slot = 1;
  while (slotTaken(folder, slot)) slot += 1;
  return slot;
}

/** The slots of a folder that hold a trace (either flavour), ascending. */
export function listRuns(folder) {
  const slots = new Set();
  let names = [];
  try {
    names = fs.readdirSync(folder);
  } catch {
    /* no folder: no runs */
  }
  for (const name of names) {
    const m = name.match(/^trace(?:-(\d+))?(?:-assisted)?\.jsonl$/);
    if (m) slots.add(m[1] ? parseInt(m[1], 10) : 1);
  }
  return [...slots].sort((a, b) => a - b);
}

// A name that is already there: the move goes to the next slot instead.
const TAKEN = ['EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR'];
// Filesystems without hard links: fall back to an exclusive copy.
const NO_LINKS = ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS', 'EMLINK'];

// Puts src at `to` unless something is there already: a hard link fails if the name exists, and so does an exclusive copy.
function placeFile(src, to) {
  try {
    fs.linkSync(src, to);
  } catch (e) {
    if (!NO_LINKS.includes(e.code)) throw e;
    fs.copyFileSync(src, to, fs.constants.COPYFILE_EXCL);
  }
}

/**
 * Moves one finished replay (trace.jsonl, video.mp4 and frames/ in `attempt`) into `dest` under the first free slot, with
 * the -assisted mark if the run was assisted. Nothing already in `dest` is replaced or removed. If a name turns out to be
 * taken while the move is under way (another replay got there first), what this move placed is undone and the next slot
 * is tried. Returns {slot, trace, video, frames} (the paths used; frames is null when the attempt left none). `attempt` is
 * left empty, not removed.
 */
export function publishRun(attempt, dest, assisted) {
  const from = { trace: path.join(attempt, 'trace.jsonl'), video: path.join(attempt, 'video.mp4'), frames: path.join(attempt, 'frames') };
  for (const k of ['trace', 'video']) {
    if (!exists(from[k])) throw new Error(`the replay left no ${path.basename(from[k])} in ${attempt}`);
  }
  const haveFrames = exists(from.frames);
  let slot = freeSlot(dest);
  for (let tries = 0; tries < 1000; tries += 1, slot += 1) {
    while (slotTaken(dest, slot)) slot += 1;
    const names = runNames(slot, assisted);
    const to = { trace: path.join(dest, names.trace), video: path.join(dest, names.video), frames: path.join(dest, names.frames) };
    const placed = [];
    try {
      if (haveFrames) {
        fs.renameSync(from.frames, to.frames); // a directory only moves onto a name that is free (or an empty folder)
        placed.push(['dir', to.frames]);
      }
      for (const k of ['trace', 'video']) {
        placeFile(from[k], to[k]);
        placed.push(['file', to[k]]);
      }
    } catch (e) {
      for (const [kind, p] of placed.reverse()) {
        if (kind === 'file') fs.unlinkSync(p);
        else fs.renameSync(p, from.frames);
      }
      if (TAKEN.includes(e.code)) continue;
      throw e;
    }
    for (const k of ['trace', 'video']) fs.unlinkSync(from[k]); // the links are in place; drop the attempt's own names
    return { slot, trace: to.trace, video: to.video, frames: haveFrames ? to.frames : null };
  }
  throw new Error(`no free slot for a replay in ${dest} (1000 tried)`);
}
