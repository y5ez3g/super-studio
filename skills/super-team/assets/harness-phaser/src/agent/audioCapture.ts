/**
 * Harness mix capture for `record --params "audiorec=1" ... --out clip.mp4`.
 *
 * Armed from src/audio/Audio.ts with a getter for the master gain. While the
 * game mix is silent (stub) or the master isn't up yet, a zero-gain source in a
 * fallback context keeps the MediaRecorder stream valid, so the mp4 always
 * carries a real audio track. Once the getter returns a master node, the mix is
 * recorded through a destination made in the master's own AudioContext (a node
 * can only connect to nodes of its own context), polled so the game can create
 * it lazily. A master that appears after start() isn't recorded until the next
 * start(): start recording once the game's audio is up.
 *
 * Exposes `window.__AUDIO_CAPTURE__ = { start(), stop(), error() }`, the
 * contract the play harness drives: start() begins recording, stop() resolves
 * to a base64 audio blob (or null when recording never started), and error()
 * returns the last wiring failure (or null), so a silent track is never
 * mistaken for a silent mix.
 */

declare global {
  interface Window {
    __AUDIO_CAPTURE__?: {
      start: () => boolean;
      stop: () => Promise<string | null>;
      error: () => string | null;
    };
  }
}

export function armAgentAudioCapture(getMaster: () => GainNode | null): void {
  let params: URLSearchParams | null = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  if (!params || params.get('audiorec') !== '1') return;
  if (window.__AUDIO_CAPTURE__) return;

  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;

  // Silent fallback: keeps the recorded track valid before the real mix
  // exists. Replaced by the master's own destination once it is tapped.
  const fallback = new AC();
  let ctx: BaseAudioContext = fallback;
  let dest: MediaStreamAudioDestinationNode = fallback.createMediaStreamDestination();
  const silent = fallback.createConstantSource();
  silent.offset.value = 0;
  silent.connect(dest);
  silent.start();

  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let tapped: GainNode | null = null;
  let lastError: string | null = null;
  const upgrade = (): void => {
    let master: GainNode | null = null;
    try {
      master = getMaster();
    } catch (e) {
      lastError = 'master getter failed: ' + String(e);
      master = null;
    }
    if (master && master !== tapped) {
      try {
        const mctx = master.context as AudioContext;
        const d = mctx.createMediaStreamDestination();
        master.connect(d);
        dest = d;
        ctx = mctx;
        tapped = master;
        lastError = null;
        silent.disconnect();
        void fallback.close().catch(() => undefined);
      } catch (e) {
        /* keep the fallback track on wiring failure, and say why */
        lastError = 'could not tap the master gain: ' + String(e);
      }
    }
  };
  const timer = window.setInterval(upgrade, 1000);

  window.__AUDIO_CAPTURE__ = {
    start(): boolean {
      try {
        upgrade();
        void (ctx as AudioContext).resume().catch(() => undefined);
        if (rec && rec.state !== 'inactive') return true;
        chunks = [];
        rec = new MediaRecorder(dest.stream);
        rec.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        rec.start();
        return true;
      } catch {
        return false;
      }
    },
    error(): string | null {
      return lastError;
    },
    stop(): Promise<string | null> {
      window.clearInterval(timer);
      return new Promise((resolve) => {
        try {
          const active = rec;
          if (!active || active.state === 'inactive') {
            resolve(null);
            return;
          }
          active.onstop = () => {
            void (async () => {
              try {
                const blob = new Blob(chunks, { type: active.mimeType || 'audio/webm' });
                const buf = new Uint8Array(await blob.arrayBuffer());
                let s = '';
                const STEP = 0x8000;
                for (let i = 0; i < buf.length; i += STEP) {
                  s += String.fromCharCode(...buf.subarray(i, i + STEP));
                }
                resolve(btoa(s));
              } catch {
                resolve(null);
              }
            })();
          };
          active.stop();
        } catch {
          resolve(null);
        }
      });
    },
  };
}
