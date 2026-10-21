import Phaser from 'phaser';
import { getFrame, setAgentMode, setFrame } from '../core/events';
import { getMission, invuln as invulnFlag, readDebug, setInvulnFlag } from '../core/registry';
import { params } from '../core/params';
import { VIEW_WIDTH } from '../game/tuning';
import { isPlayerAboardTank } from '../vehicles/vehicles';

import { liveSceneKey, loadPending, transitionPending } from './sceneState';

const KEY_NAME_MAP: Record<string, string> = {
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

function canonicalKey(k: string): string {
  const low = String(k).toLowerCase();
  return KEY_NAME_MAP[low] ?? low;
}

/** Fixed lockstep delta: exactly one 60 fps frame per step. */
const FRAME_MS = 1000 / 60;

/**
 * Bound on create-drain frames per step() call: enough for any queued start
 * plus an instant preload, and a fixed cap when a load genuinely waits on
 * async decode (synchronous ticks cannot advance that).
 */
const MAX_DRAIN_FRAMES = 120;

/**
 * Agent mode (`?agent=1`): stop Phaser's own RAF loop and expose a
 * synchronous lockstep handle for the play harness (`tools/play/`).
 *
 * Keyboard input is the real Phaser keyboard input, nothing faked:
 * Playwright dispatches trusted keydown/keyup between steps, the keyboard
 * plugin sets `isDown`/`_justDown` synchronously on dispatch, and the next
 * `step()` consumes them in normal scene `update()` calls.
 */
export function installAgentMode(game: Phaser.Game): void {
  setAgentMode(true);

  const loop = game.loop;
  // Constant delta every frame: no smoothing history leaking in from the
  // (now stopped) wall-clock loop, so identical scripts are reproducible.
  loop.smoothStep = false;
  loop.stop();
  game.events.once(Phaser.Core.Events.READY, () => {
    // READY fires just before Game.start() calls loop.start(); a microtask
    // lands after start() but before any RAF callback can fire.
    void Promise.resolve().then(() => loop.stop());
  });

  // Re-zero the loop clock: per-frame deltas are float subtractions of the
  // running time, so a wall-clock origin would make identical scripts drift
  // by ULPs run to run. From zero the time sequence (and every delta) is
  // bit-identical for identical scripts.
  loop.lastTime = 0;
  loop.time = 0;
  loop.startTime = 0;
  // ?invuln=1 boots straight into god-mode for completion runs.
  if (params.invuln) setInvulnFlag(true);
  let time = 0;
  const tick = (): void => {
    // Belt and braces: if anything (e.g. the visibility handler) restarts
    // the loop, shut it back down before pumping manually.
    if (loop.running) loop.stop();
    time += FRAME_MS;
    loop.step(time);
  };

  window.__AGENT__ = {
    step(frames: number): void {
      if (!Number.isInteger(frames) || frames < 1) {
        throw new Error(`__AGENT__.step needs a positive integer, got ${frames}`);
      }
      for (let i = 0; i < frames; i += 1) tick();
      // A scene whose start is queued or whose preload is in flight would
      // otherwise read stale for the whole next call: keep pumping, bounded,
      // until its create has run.
      let guard = 0;
      while (guard < MAX_DRAIN_FRAMES && transitionPending(game)) {
        tick();
        guard += 1;
      }
    },
    info(): AgentInfo {
      return { frame: getFrame(), scene: liveSceneKey(game, readDebug().scene), loading: loadPending(game) };
    },
    debug(): AgentDebug {
      // Registry shape plus the current frame (required by AgentDebug) and
      // the harness god-mode flag (lets the gate verify invuln is armed).
      return { ...readDebug(), frame: getFrame(), invuln: invulnFlag, loading: loadPending(game) };
    },
    // `paused` is the game's pause as its own flag (tools/play/lib/detect.mjs skips a paused stretch by it). player.controllable is
    // false in a pause too, but also in a stun, and a stun must reach the softlock check, so the pause cannot hide in controllable.
    trace(keys?: string[]): AgentTrace & { paused: boolean } {
      const curFrame = getFrame();
      const currentScene = liveSceneKey(game, readDebug().scene);
      const mission = getMission();
      const debug = readDebug();

      const drainedEvents: Array<{ frame: number; type: string; name: string; data?: unknown }> = [];
      try {
        const ev = window.__AGENT_EVENTS__;
        if (Array.isArray(ev) && ev.length > 0) {
          drainedEvents.push(...ev);
          window.__AGENT_EVENTS__ = [];
        }
      } catch {
        /* ignore */
      }

      let gameScene: Phaser.Scene | null = null;
      try {
        gameScene = game.scene.getScene('Game');
        if (!gameScene || !gameScene.sys || !gameScene.sys.settings.active) {
          gameScene = null;
        }
      } catch {
        gameScene = null;
      }

      let cam = { x: 0, y: 0 };
      if (gameScene && gameScene.cameras && gameScene.cameras.main) {
        cam = {
          x: Math.round(gameScene.cameras.main.scrollX * 10) / 10,
          y: Math.round(gameScene.cameras.main.scrollY * 10) / 10,
        };
      }

      let player: AgentTracePlayer;
      const gs = gameScene as any;
      if (gs && gs.player) {
        const p = gs.player;
        const aboard = isPlayerAboardTank(gameScene!);
        const alive = debug.player.alive && gs.dying === 0;
        const controllable = alive && !gs.pausedGame && gs.clearFreeze === 0;
        const invuln = gs.invuln > 0 || invulnFlag;
        const visible = p.visible !== false && (p.alpha === undefined || p.alpha > 0);
        player = {
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          vx: Math.round((p.body?.velocity?.x ?? 0) * 10) / 10,
          vy: Math.round((p.body?.velocity?.y ?? 0) * 10) / 10,
          visible,
          alive,
          controllable,
          invuln,
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
          invuln: invulnFlag,
          aboard: false,
        };
      }

      let boss: AgentTraceBoss | null = null;
      const combat = gs?.combat;
      const b = combat?.boss;
      if (b && b.alive && b.hp > 0) {
        const bx = b.hull ? b.hull.x : (b.baseX ?? 0);
        const by = b.hull ? b.hull.y : 0;
        const bVis = b.hull ? b.hull.visible && b.hull.alpha > 0 : true;
        const onCamera = bx + 120 >= cam.x && bx - 120 <= cam.x + VIEW_WIDTH;
        const name =
          b.kind === 'longhaul' || (b.hull?.texture?.key && b.hull.texture.key.includes('lh'))
            ? 'longhaul'
            : 'brassback';
        boss = {
          name,
          x: Math.round(bx * 10) / 10,
          y: Math.round(by * 10) / 10,
          visible: bVis,
          onCamera,
          hp: b.hp ?? 0,
        };
      }

      let enemies = 0;
      if (combat && Array.isArray(combat.soldiers)) {
        for (const s of combat.soldiers) {
          if (s && s.alive) enemies++;
        }
      }
      if (combat?.truck && combat.truck.alive) enemies++;

      let enemyBullets = 0;
      if (combat?.fire) {
        if (Array.isArray(combat.fire.bullets)) {
          for (const eb of combat.fire.bullets) if (eb && eb.alive) enemyBullets++;
        }
        if (Array.isArray(combat.fire.grenades)) {
          for (const eg of combat.fire.grenades) if (eg && eg.alive) enemyBullets++;
        }
        if (Array.isArray(combat.fire.rockets)) {
          for (const er of combat.fire.rockets) if (er && er.alive) enemyBullets++;
        }
      }
      if (b && Array.isArray(b.shells)) {
        for (const sh of b.shells) if (sh && sh.alive) enemyBullets++;
      }

      const heldKeys = Array.isArray(keys) ? [...new Set(keys.map(canonicalKey))] : [];

      const arenaLock = Boolean(
        gs?.truckLockActive ||
          (combat && typeof combat.bossHoldsArena === 'function' && combat.bossHoldsArena()) ||
          (combat && typeof combat.holdsArenaLock === 'function' && combat.holdsArenaLock()) ||
          (combat && typeof combat.isGateShut === 'function' && combat.isGateShut()),
      );

      return {
        frame: curFrame,
        scene: currentScene,
        mission,
        cam,
        player,
        boss,
        enemies,
        enemyBullets,
        lives: debug.lives,
        score: debug.score,
        keys: heldKeys,
        agentEvents: drainedEvents,
        events: drainedEvents,
        arenaLock,
        paused: Boolean(gs?.pausedGame),
      };
    },
    setInvuln(on: boolean): void {
      setInvulnFlag(on === true);
    },
    resetAfterSettle(): void {
      // Called once by the harness when Boot's async load has finished and
      // the first post-Boot scene runs: settle pumps burn only Boot ticks
      // (no gameplay — Boot has no update), so rewinding the frame counter
      // and dropping pre-settle events leaves the next scene at frame ~0
      // with untouched state on every run.
      setFrame(0);
      try {
        (window as unknown as Record<string, unknown>).__AGENT_EVENTS__ = [];
      } catch {
        /* non-browser (build-time) */
      }
    },
  };
}
