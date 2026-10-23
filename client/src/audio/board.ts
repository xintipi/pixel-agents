// Sound board: one AudioContext for everything (created only after a user gesture, as the
// autoplay policy requires), master volume with a limiter and the scheduler that decides what plays.
import { DiscoMusic } from './disco-music';
import { BED_KINDS, masterGain, SoundScheduler, type SoundKind, type SoundSettings } from './scheduler';
import { makeLongNoise, makeNoise, playVoice, startBed, type Bed } from './synth';

/** A bed with no level update for this long fades out (the weather changed, the tab hid, the category went off). */
const BED_IDLE_MS = 1_500;
/** Fade time constant (s) of the beds' level. */
const BED_FADE = 0.6;

export class SoundBoard {
  readonly scheduler = new SoundScheduler();
  private ac: AudioContext | null = null;
  private out: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private volume = 0.6;
  private discoMusic: DiscoMusic | null = null;
  private longNoise: AudioBuffer | null = null;
  private beds = new Map<SoundKind, { bed: Bed; at: number }>();
  private bedTimer: ReturnType<typeof setInterval> | null = null;

  configure(enabled: boolean, settings: SoundSettings): void {
    this.enabled = enabled;
    this.volume = settings.volume;
    this.scheduler.configure(enabled, settings);
  }

  /**
   * Must be called from a user gesture (click/key) for the browser to unlock
   * audio. Resolves when audio is ready (or could not be unlocked).
   */
  unlock(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    return this.ensure();
  }

  /**
   * Disco track (Shift + D): plays even with the office sounds turned off, because the person asked for the party
   * (the shortcut is the gesture the browser requires), at the master volume from the settings. `on` false stops it.
   */
  disco(on: boolean, seconds: number): void {
    if (!on) {
      this.discoMusic?.stop();
      return;
    }
    const gain = masterGain(this.volume) * 0.55;
    if (gain <= 0.0005) return;
    void this.ensure().then(() => {
      const ac = this.ac;
      if (!ac || !this.out || ac.state !== 'running') return;
      this.discoMusic ??= new DiscoMusic(ac, this.out, this.noise);
      this.discoMusic.start(seconds, gain);
    });
  }

  /** Creates (or resumes) the AudioContext; call it from a user gesture. */
  private ensure(): Promise<void> {
    try {
      if (!this.ac) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return Promise.resolve();
        const ac = new Ctor();
        // soft limiter: several sounds together never clip
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 12;
        comp.ratio.value = 6;
        comp.connect(ac.destination);
        this.ac = ac;
        this.out = comp;
        this.noise = makeNoise(ac);
        this.longNoise = makeLongNoise(ac);
      }
      if (this.ac.state === 'suspended') return this.ac.resume().catch(() => undefined);
    } catch {
      this.ac = null;
      this.out = null;
    }
    return Promise.resolve();
  }

  /** Plays `kind` if the preference and the limits allow. Returns whether it played. */
  play(kind: SoundKind, opts: { gain?: number; pan?: number; count?: number } = {}): boolean {
    const ac = this.ac;
    if (!ac || !this.out || ac.state !== 'running') return false;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const gain = this.scheduler.decide(kind, performance.now(), { hidden, gain: opts.gain });
    if (gain === null) return false;
    if (BED_KINDS.has(kind)) return this.bed(ac, kind as 'rain' | 'wind' | 'robot_hum' | 'generator', gain);
    try {
      playVoice(ac, this.out, kind, ac.currentTime + 0.01, { gain, pan: opts.pan, count: opts.count, rng: Math.random, noise: this.noise });
      return true;
    } catch {
      return false;
    }
  }

  /** Keeps the loop of a bed at `gain` (starting it if needed); it fades out alone when the updates stop. */
  private bed(ac: AudioContext, kind: 'rain' | 'wind' | 'robot_hum' | 'generator', gain: number): boolean {
    let cur = this.beds.get(kind);
    if (!cur) {
      const bed = this.out ? startBed(ac, this.out, kind, this.longNoise) : null;
      if (!bed) return false;
      cur = { bed, at: 0 };
      this.beds.set(kind, cur);
    }
    cur.at = performance.now();
    cur.bed.level.gain.setTargetAtTime(Math.max(0.0001, gain), ac.currentTime, BED_FADE);
    this.bedTimer ??= setInterval(() => this.reapBeds(), 500);
    return true;
  }

  /** Beds without updates fade out and stop. */
  private reapBeds(): void {
    const ac = this.ac;
    const now = performance.now();
    for (const [kind, cur] of this.beds) {
      if (ac && now - cur.at < BED_IDLE_MS) continue;
      if (ac) {
        cur.bed.level.gain.setTargetAtTime(0.0001, ac.currentTime, BED_FADE);
        cur.bed.stop(ac.currentTime + BED_FADE * 5);
      }
      this.beds.delete(kind);
    }
    if (!this.beds.size && this.bedTimer) {
      clearInterval(this.bedTimer);
      this.bedTimer = null;
    }
  }
}
