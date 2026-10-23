// Crickets at night (tiếng dế) under the background lofi: a few crickets synthesized with WebAudio (no audio files),
// each one a steady ~4–5 kHz tone gated into short pulse trains (a "chirp" of 2–4 pulses, repeated for a while, then a
// rest), slightly panned and very quiet. Tied to the music switch and its volume (quieter than the music), they
// fade in at dusk and out at dawn with the world's night, and step aside while the disco has the floor.
//
// Cost: three oscillators that run only while the crickets are heard (the AudioContext is suspended otherwise) and a
// timer every half second that writes the next couple of seconds of gain automation on the AudioContext clock.
import { musicGain } from './lofi';

/** How far ahead (s) the chirps are written on the AudioContext clock (covers a throttled timer). */
export const LOOKAHEAD_S = 2;
const TICK_MS = 500;
/** Time constant (s) of the fades (dusk/dawn, music on/off, disco). */
const FADE_S = 1.2;
/** Below this gain the crickets are silent. */
const SILENT = 0.0005;
const COUNT = 3;
/** Crickets relative to the music (the music element's own gain at the same slider position). */
const RELATIVE = 0.12;

/** One cricket: its pitch, place in the stereo field, song (pulses per chirp, chirp period) and where it is in it. */
export interface Cricket {
  freq: number;
  pan: number;
  pulses: number;
  /** Duration (s) of one pulse and of the gap after it. */
  pulseLen: number;
  pulseGap: number;
  /** Time (s) from one chirp to the next while singing. */
  period: number;
  /** AudioContext time of the next chirp. */
  next: number;
  /** Chirps left before the next rest. */
  left: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);

/**
 * How loud the crickets are (0–1) for the world's night level (0 day … 1 deep night): silent until dusk is well under
 * way (~18:45), full from ~19:30 to ~5:00 and gone by ~5:45 (smoothstep on the lighting's night factor).
 */
export function cricketLevel(night: number): number {
  const u = clamp01((night - 0.6) / 0.35);
  return u * u * (3 - 2 * u);
}

/** Gain of the crickets for the music slider (0–1) and the night level: follows the music, always well under it. */
export function cricketGain(volume: number, level: number): number {
  return musicGain(volume) * RELATIVE * clamp01(level);
}

/** A cricket with its own voice and song (`rng` 0–1). */
export function makeCricket(rng: () => number): Cricket {
  return {
    freq: 4100 + rng() * 1000,
    pan: (rng() * 2 - 1) * 0.6,
    pulses: 2 + Math.floor(rng() * 3),
    pulseLen: 0.012 + rng() * 0.008,
    pulseGap: 0.016 + rng() * 0.01,
    period: 0.42 + rng() * 0.4,
    next: 0,
    left: 3 + Math.floor(rng() * 10),
  };
}

/** Duration (s) of one chirp of `c`. */
export function chirpLength(c: Cricket): number {
  return c.pulses * (c.pulseLen + c.pulseGap);
}

/**
 * Start times of the chirps of `c` in [from, until): a phrase of chirps a little irregularly spaced, then a rest of a
 * couple of seconds, and again. A cricket that fell behind (paused, ducked) starts a fresh phrase soon after `from`.
 * Advances `c` (call it with consecutive windows).
 */
export function planChirps(c: Cricket, from: number, until: number, rng: () => number): number[] {
  const out: number[] = [];
  if (c.next < from) c.next = from + rng() * c.period * 2;
  while (c.next < until) {
    out.push(c.next);
    c.left--;
    if (c.left > 0) {
      c.next += c.period * (0.92 + rng() * 0.16);
    } else {
      c.left = 5 + Math.floor(rng() * 14);
      c.next += c.period + 1.5 + rng() * 6;
    }
  }
  return out;
}

interface Voice {
  c: Cricket;
  env: GainNode;
}

export class CricketAmbience {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private enabled = false;
  private volume = 0.4;
  /** Quiet until this instant (performance.now() ms): the disco has the floor. */
  private duckUntil = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** When the crickets went silent (performance.now() ms), to suspend the AudioContext after the fade; 0 = playing. */
  private quietSince = 0;
  private rng: () => number = Math.random;

  /** `night` reads the world's night level (0–1). */
  constructor(private readonly night: () => number) {}

  /** Applies the music preferences (the crickets follow the music switch and volume). */
  configure(enabled: boolean, volume: number): void {
    // called on every UI render: only a change does anything
    if (enabled === this.enabled && volume === this.volume) return;
    this.enabled = enabled;
    this.volume = volume;
    if (enabled) this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Call it from a user gesture: resumes the audio if the crickets should be heard. */
  unlock(): void {
    this.tick();
  }

  /** The disco plays for `seconds`: the crickets hush and come back afterwards. 0 = back now. */
  duck(seconds: number): void {
    this.duckUntil = seconds > 0 ? performance.now() + seconds * 1000 : 0;
    this.tick();
  }

  /** Gain the crickets should have now. */
  private target(): number {
    if (!this.enabled || performance.now() < this.duckUntil) return 0;
    let n = 0;
    try {
      n = this.night();
    } catch {
      n = 0;
    }
    return cricketGain(this.volume, cricketLevel(n));
  }

  private tick(): void {
    const g = this.target();
    const nowMs = performance.now();
    if (g <= SILENT) {
      if (!this.ac || this.ac.state !== 'running') {
        if (!this.enabled) this.stopTimer();
        return;
      }
      const ac = this.ac;
      if (!this.quietSince) {
        this.quietSince = nowMs;
        this.master?.gain.setTargetAtTime(0.0001, ac.currentTime, FADE_S);
      } else if (nowMs - this.quietSince > FADE_S * 5000) {
        // faded out: the oscillators sleep with the context
        void ac.suspend().catch(() => undefined);
        if (!this.enabled) this.stopTimer();
      }
      return;
    }
    const ac = this.ensure();
    if (!ac || !this.master) return;
    if (ac.state === 'suspended') {
      // resumes when the page has had a gesture (autoplay policy); the next tick schedules
      void ac.resume().catch(() => undefined);
      return;
    }
    if (ac.state !== 'running') return;
    this.quietSince = 0;
    const t = ac.currentTime;
    this.master.gain.setTargetAtTime(g, t, FADE_S);
    for (const v of this.voices) {
      // `next` already past the written horizon: keep writing from there (no gaps, no doubles)
      for (const at of planChirps(v.c, t + 0.05, t + LOOKAHEAD_S, this.rng)) this.writeChirp(v, at);
    }
  }

  /** Writes one chirp of `v` at `at` on the gain automation of its envelope. */
  private writeChirp(v: Voice, at: number): void {
    const { c } = v;
    const gain = v.env.gain;
    for (let i = 0; i < c.pulses; i++) {
      const t0 = at + i * (c.pulseLen + c.pulseGap);
      // the first pulse a little softer, like a real chirp swelling
      const peak = i === 0 ? 0.6 : 0.85 + this.rng() * 0.15;
      gain.setValueAtTime(0, t0);
      gain.linearRampToValueAtTime(peak, t0 + c.pulseLen * 0.3);
      gain.linearRampToValueAtTime(0, t0 + c.pulseLen);
    }
  }

  /** Creates the AudioContext and the crickets (once). */
  private ensure(): AudioContext | null {
    if (this.ac) return this.ac;
    // no gesture on the page yet: the browser would refuse to start it (unlock() comes with the first one)
    const act = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (act && !act.hasBeenActive) return null;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ac = new Ctor();
      const master = ac.createGain();
      master.gain.value = 0.0001;
      master.connect(ac.destination);
      for (let i = 0; i < COUNT; i++) {
        const c = makeCricket(this.rng);
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = c.freq;
        const env = ac.createGain();
        env.gain.value = 0;
        let out: AudioNode = master;
        if (typeof ac.createStereoPanner === 'function') {
          const p = ac.createStereoPanner();
          p.pan.value = c.pan;
          p.connect(master);
          out = p;
        }
        osc.connect(env).connect(out);
        osc.start();
        this.voices.push({ c, env });
      }
      this.ac = ac;
      this.master = master;
      return ac;
    } catch {
      this.ac = null;
      this.master = null;
      this.voices = [];
      return null;
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
