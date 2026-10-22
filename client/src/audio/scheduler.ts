// Sound scheduler (pure): decides whether a sound plays now and at what volume, based on the preference
// (global on/off, master volume, categories), the visible tab and the rate limits.
import type { SoundCueKind } from '../world/api';

/** Categories the user turns on/off in the settings. */
export type SoundCategory = 'alerts' | 'keys' | 'elevator' | 'social' | 'life' | 'weather';
/** Sounds: the "needs you" bell, the task-done pop, the achievement fanfare and the ambient ones. */
export type SoundKind = 'chime' | 'pop' | 'fanfare' | SoundCueKind;

export const SOUND_CATEGORIES: readonly SoundCategory[] = ['alerts', 'keys', 'elevator', 'social', 'life', 'weather'];

/**
 * Beds: continuous sounds (rain, wind, the robot's hum). The world keeps sending their level while they last; the
 * board holds one loop per kind and fades it out when the updates stop. They don't count towards the per-second cap.
 */
export const BED_KINDS: ReadonlySet<SoundKind> = new Set<SoundKind>(['rain', 'wind', 'robot_hum']);

export const CATEGORY_OF: Readonly<Record<SoundKind, SoundCategory>> = {
  chime: 'alerts',
  pop: 'alerts',
  fanfare: 'alerts',
  keys: 'keys',
  elevator: 'elevator',
  pingpong: 'social',
  table: 'social',
  arcade: 'social',
  firework_launch: 'social',
  firework_boom: 'social',
  bark: 'life',
  meow: 'life',
  robot_start: 'life',
  robot_dock: 'life',
  robot_hum: 'life',
  door: 'life',
  flush: 'life',
  tap: 'life',
  coffee: 'life',
  pizza: 'life',
  yawn: 'life',
  party: 'life',
  rain: 'weather',
  wind: 'weather',
  thunder: 'weather',
  bird: 'weather',
  horn_bike: 'weather',
  horn_car: 'weather',
};

/** Minimum interval (ms) between two sounds on the same channel. */
export const MIN_GAP_MS: Readonly<Record<SoundKind, number>> = {
  chime: 1_200,
  pop: 1_200,
  fanfare: 1_200,
  keys: 600,
  elevator: 1_500,
  pingpong: 200,
  table: 200,
  arcade: 450,
  firework_launch: 120,
  firework_boom: 90,
  bark: 1_500,
  meow: 1_500,
  robot_start: 1_000,
  robot_dock: 1_000,
  robot_hum: 0,
  door: 400,
  flush: 1_500,
  tap: 1_500,
  coffee: 1_500,
  pizza: 2_000,
  yawn: 1_200,
  party: 2_500,
  rain: 0,
  wind: 0,
  thunder: 6_000,
  bird: 700,
  horn_bike: 450,
  horn_car: 450,
};

/** The bell and the pop share the same channel (one doesn't trample the other). */
const CHANNEL: Readonly<Record<SoundKind, string>> = {
  chime: 'alerts',
  pop: 'alerts',
  fanfare: 'fanfare',
  keys: 'keys',
  elevator: 'elevator',
  pingpong: 'pingpong',
  table: 'pingpong',
  arcade: 'arcade',
  firework_launch: 'fw_launch',
  firework_boom: 'fw_boom',
  bark: 'pets',
  meow: 'pets',
  robot_start: 'robot',
  robot_dock: 'robot',
  robot_hum: 'robot_hum',
  door: 'door',
  flush: 'flush',
  tap: 'tap',
  coffee: 'coffee',
  pizza: 'pizza',
  yawn: 'yawn',
  party: 'party',
  rain: 'rain',
  wind: 'wind',
  thunder: 'thunder',
  bird: 'bird',
  horn_bike: 'horn',
  horn_car: 'horn',
};

/** Global cap: at most this many sounds per second (the alert bell always gets through). */
export const MAX_PER_SECOND = 7;

export interface SoundSettings {
  /** Master volume (0–1). */
  volume: number;
  alerts: boolean;
  keys: boolean;
  elevator: boolean;
  social: boolean;
  /** Pets, robot vacuum, bathroom, coffee machine, pizza, yawns and parties. */
  life: boolean;
  /** Rain, wind, thunder and birds outside, and the horns on the street. */
  weather: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { volume: 0.6, alerts: true, keys: true, elevator: true, social: true, life: true, weather: true };

/** Validates field by field (a corrupted preference falls back to the default). */
export function sanitizeSoundSettings(raw: unknown): SoundSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SOUND_SETTINGS;
  const bool = (v: unknown, f: boolean) => (typeof v === 'boolean' ? v : f);
  const vol = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(1, Math.max(0, o.volume)) : d.volume;
  return {
    volume: vol,
    alerts: bool(o.alerts, d.alerts),
    keys: bool(o.keys, d.keys),
    elevator: bool(o.elevator, d.elevator),
    social: bool(o.social, d.social),
    life: bool(o.life, d.life),
    weather: bool(o.weather, d.weather),
  };
}

/** Master volume curve: the slider feels perceptually linear. */
export function masterGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

export class SoundScheduler {
  private enabled = false;
  private settings: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };
  private last = new Map<string, number>();
  private recent: number[] = [];

  configure(enabled: boolean, settings: SoundSettings): void {
    this.enabled = enabled;
    this.settings = settings;
  }

  /** Is the sound allowed by the preference (global, category and volume)? */
  allowed(kind: SoundKind): boolean {
    return this.enabled && this.settings.volume > 0 && this.settings[CATEGORY_OF[kind]];
  }

  /**
   * Final gain (0–1) to play `kind` now, or null if it shouldn't play. With the tab hidden only the
   * "needs you" bell plays. `gain` is the proximity suggested by the world.
   */
  decide(kind: SoundKind, now: number, opts: { hidden?: boolean; gain?: number } = {}): number | null {
    if (!this.allowed(kind)) return null;
    if (opts.hidden && kind !== 'chime') return null;
    const g0 = masterGain(this.settings.volume) * Math.min(1, Math.max(0, opts.gain ?? 1));
    // a bed is a level update, not a new sound: no gap and no cap
    if (BED_KINDS.has(kind)) return g0 > 0.0005 ? g0 : null;
    const ch = CHANNEL[kind];
    const prev = this.last.get(ch);
    if (prev !== undefined && now - prev < MIN_GAP_MS[kind]) return null;
    while (this.recent.length && now - this.recent[0] >= 1_000) this.recent.shift();
    if (kind !== 'chime' && this.recent.length >= MAX_PER_SECOND) return null;
    const g = g0;
    if (g <= 0.0005) return null;
    this.last.set(ch, now);
    this.recent.push(now);
    return g;
  }
}
