// Key names and lockstep script parsing for tools/play.
// Script syntax: tokens separated by spaces, each `<keys>*<frames>`.
// Keys are joined with `+`; `.` means no keys (all released).
// Example: "right*30 right+z*4 .*2"

const PLAYWRIGHT_KEYS = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  z: 'z',
  x: 'x',
  c: 'c',
  enter: 'Enter',
  5: '5',
  esc: 'Escape',
  // Alternates from CONTRACTS (WASD + J/K/L) and pause.
  a: 'ArrowLeft',
  d: 'ArrowRight',
  w: 'ArrowUp',
  s: 'ArrowDown',
  j: 'z',
  k: 'x',
  l: 'c',
  p: 'p',
};

export function normalizeKey(name) {
  const k = String(name).toLowerCase();
  if (!(k in PLAYWRIGHT_KEYS)) {
    throw new Error(`unknown key "${name}" (want one of: left right up down z x c enter 5 esc .)`);
  }
  return PLAYWRIGHT_KEYS[k];
}

/** Parse a script string into [{keys: string[] (playwright names), frames: number}]. */
export function parseSeq(seq) {
  if (typeof seq !== 'string' || !seq.trim()) throw new Error('empty --seq script');
  return seq
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = tok.match(/^(.+)\*(\d+)$/);
      if (!m) throw new Error(`bad token "${tok}" (want <keys>*<frames>, e.g. right+z*4)`);
      const frames = Number(m[2]);
      if (!Number.isInteger(frames) || frames < 1) {
        throw new Error(`bad frame count in token "${tok}" (want a positive integer)`);
      }
      const keys =
        m[1] === '.'
          ? []
          : m[1].split('+').map((k) => {
              if (!k) throw new Error(`bad token "${tok}" (empty key in + list)`);
              return normalizeKey(k);
            });
      // De-dupe while keeping order.
      return { keys: [...new Set(keys)], frames };
    });
}

export function totalFrames(tokens) {
  return tokens.reduce((n, t) => n + t.frames, 0);
}
