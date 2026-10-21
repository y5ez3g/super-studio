import type Phaser from 'phaser';

// Scene lifecycle numbers from Phaser's src/scene/const.js (not exposed
// through the public types, so pinned here): PENDING 0, INIT 1, START 2,
// LOADING 3, CREATING 4, RUNNING 5, PAUSED 6, SLEEPING 7, SHUTDOWN 8.
export const STATUS_START = 2;
export const STATUS_RUNNING = 5;

export function sceneStatus(s: Phaser.Scene): number {
  try {
    const st = (s.sys as unknown as { settings?: { status?: unknown } }).settings?.status;
    return typeof st === 'number' ? st : 0;
  } catch {
    return 0;
  }
}

/**
 * The live scene key, recomputed every call (never the registry cache).
 * A scene that has started but not finished create (START..CREATING, e.g. a
 * preload in flight) wins so the handoff reads fresh mid-transition;
 * otherwise the first RUNNING scene in manager order — Game ahead of its
 * Hud overlay.
 */
export function liveSceneKey(game: Phaser.Game, fallback: string): string {
  let scenes: Phaser.Scene[] = [];
  try {
    scenes = game.scene.getScenes(false);
  } catch {
    return fallback;
  }
  let incoming: string | null = null;
  let running: string | null = null;
  for (const s of scenes) {
    let key = '';
    try {
      key = s.sys.settings.key;
    } catch {
      continue;
    }
    if (!key) continue;
    const st = sceneStatus(s);
    if (st >= STATUS_START && st < STATUS_RUNNING) {
      incoming = key;
    } else if (st === STATUS_RUNNING && running === null) {
      running = key;
    }
  }
  return incoming ?? running ?? fallback;
}

/** True while some scene has started but its create has not run yet. */
export function transitionPending(game: Phaser.Game): boolean {
  let scenes: Phaser.Scene[] = [];
  try {
    scenes = game.scene.getScenes(false);
  } catch {
    return false;
  }
  return scenes.some((s) => {
    const st = sceneStatus(s);
    return st >= STATUS_START && st < STATUS_RUNNING;
  });
}

/**
 * True while asset loading still needs wall-clock time: any scene loader
 * with work in flight, or a scene transition not yet created. Synchronous
 * lockstep ticks cannot advance XHR fetch or image decode, so the harness
 * must yield real time (sleep between pumped steps) while this is true.
 * Today only Boot preloads, so this is normally true only before Title.
 */
export function loadPending(game: Phaser.Game): boolean {
  try {
    for (const s of game.scene.getScenes(false)) {
      try {
        const loader = (
          s as unknown as { load?: { isLoading?: () => boolean } }
        ).load;
        if (loader && typeof loader.isLoading === 'function' && loader.isLoading()) return true;
      } catch {
        /* next scene */
      }
    }
  } catch {
    return false;
  }
  return transitionPending(game);
}
