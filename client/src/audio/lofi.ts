// Background lofi (opt-in): two soft CC0 tracks (public/assets/music, see CREDITS.md) played one after the other with
// an <audio> element, with its own switch and volume. Starts only after a user gesture (autoplay policy), keeps
// playing with the tab hidden (it's music the person chose) and goes quiet while the disco plays.

export const LOFI_TRACKS: readonly string[] = ['/assets/music/lofi-hip-hop-loop.mp3', '/assets/music/lofi-again.mp3'];

/** Default music volume (0–1). */
export const DEFAULT_MUSIC_VOLUME = 0.4;

const FADE_MS = 1200;
const FADE_TICK_MS = 50;

/** Slider (0–1) -> element volume: perceptual curve, and quiet at the top (it's background). */
export function musicGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return Math.round(v * v * 0.6 * 1000) / 1000;
}

/** Next track of the playlist (wraps around). */
export function nextTrack(i: number, n = LOFI_TRACKS.length): number {
  return n > 0 ? (i + 1) % n : 0;
}

export class LofiPlayer {
  private el: HTMLAudioElement | null = null;
  private track = Math.floor(Math.random() * LOFI_TRACKS.length);
  private enabled = false;
  private volume = DEFAULT_MUSIC_VOLUME;
  /** Quiet until this instant (performance.now() ms): the disco has the floor. */
  private duckUntil = 0;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  /** Applies the preferences. Turning off fades out and pauses; volume changes apply right away. */
  configure(enabled: boolean, volume: number): void {
    const was = this.enabled;
    this.enabled = enabled;
    this.volume = volume;
    if (!enabled) {
      if (was) this.fadeTo(0, () => this.el?.pause());
      return;
    }
    if (this.el && !this.el.paused && !this.fadeTimer) this.el.volume = this.target();
  }

  /** Starts (or resumes) playing; call it from a user gesture. */
  start(): void {
    if (!this.enabled || performance.now() < this.duckUntil) return;
    const el = this.ensure();
    if (!el) return;
    if (!el.paused && !this.fadeTimer) return;
    el.volume = el.paused ? 0 : el.volume;
    void el.play().then(
      () => this.fadeTo(this.target()),
      () => undefined,
    );
  }

  /** The disco plays for `seconds`: the music fades out and comes back afterwards. 0 = back now. */
  duck(seconds: number): void {
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = null;
    if (seconds <= 0) {
      this.duckUntil = 0;
      this.start();
      return;
    }
    this.duckUntil = performance.now() + seconds * 1000;
    if (this.el && !this.el.paused) this.fadeTo(0, () => this.el?.pause());
    this.duckTimer = setTimeout(() => this.duck(0), seconds * 1000 + 300);
  }

  private target(): number {
    return musicGain(this.volume);
  }

  private ensure(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio === 'undefined') return null;
    const el = new Audio(LOFI_TRACKS[this.track]);
    el.preload = 'auto';
    el.addEventListener('ended', () => {
      this.track = nextTrack(this.track);
      el.src = LOFI_TRACKS[this.track];
      if (this.enabled && performance.now() >= this.duckUntil) void el.play().catch(() => undefined);
    });
    this.el = el;
    return el;
  }

  private fadeTo(to: number, done?: () => void): void {
    const el = this.el;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    if (!el) return;
    const from = el.volume;
    const steps = Math.max(1, Math.round(FADE_MS / FADE_TICK_MS));
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      el.volume = Math.min(1, Math.max(0, from + ((to - from) * i) / steps));
      if (i >= steps) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        done?.();
      }
    }, FADE_TICK_MS);
  }
}
