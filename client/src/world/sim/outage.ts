// Power outages (cúp điện / mất điện): the building goes dark for a while, then the power comes back. Three causes,
// one mechanism: the scheduled cut announced by the power company (a few minutes, on a day picked from the date, with
// the generator outside bringing some light back), the overloaded breaker (too many people working at once trips it,
// a coworker runs to the breaker box) and the thunderstorm (lightning on rainy days, sometimes taking the power with
// it). Purely visual: nothing here changes what the agents do or what is sent anywhere. Pure (no DOM).
import { hash32 } from '../../../../shared/hash';
import { CORRIDOR_Y, TILE } from '../constants';

export type OutageCause = 'schedule' | 'overload' | 'storm';

/** An outage going on: why, since when and until when (ms epoch; for the overload, the breaker resets by itself then). */
export interface Outage {
  cause: OutageCause;
  start: number;
  until: number;
  /** Overload: who went to the breaker box (null: nobody yet). */
  fixer: string | null;
}

// ------------------------------------------------------------------ levels

/** How dark the building is with the power out (0 = normal, 1 = all lights off). */
export const OUTAGE_DARK = 1;
/** Scheduled cut, once the generator runs: a few lights back, a low level. */
export const GENERATOR_DARK = 0.55;
/** The generator outside starts this long after a scheduled cut begins. */
export const GENERATOR_DELAY_MS = 20_000;

/** How dark it should be right now for this outage (null: power on). */
export function outageLevel(o: Outage | null, now: number): number {
  if (!o) return 0;
  return generatorOn(o, now) ? GENERATOR_DARK : OUTAGE_DARK;
}

/** The generator outside is running (scheduled cuts only, after GENERATOR_DELAY_MS)? */
export function generatorOn(o: Outage | null, now: number): boolean {
  return !!o && o.cause === 'schedule' && now - o.start >= GENERATOR_DELAY_MS;
}

/** One step of the smoothed level toward `target`: the cut is almost instant ("tạch"), the return a little softer. */
export function approachLevel(cur: number, target: number, dt: number): number {
  if (cur === target) return target;
  const k = Math.min(1, dt * (target > cur ? 10 : 2.5));
  const next = cur + (target - cur) * k;
  return Math.abs(target - next) < 0.01 ? target : next;
}

// ------------------------------------------------------------------ cause 1: the scheduled cut

/** Share of days (0–100) with a scheduled cut: ~1–2 days a week. */
export const SCHEDULE_PCT = 21;
/** The cut starts between these hours (local)... */
export const SCHEDULE_FROM = 9;
export const SCHEDULE_TO = 16;
/** ...and lasts this many minutes. */
export const SCHEDULE_MIN = 3;
export const SCHEDULE_MAX = 8;
/** The notice goes up on the wall (and someone mentions it) from this hour on the day of a cut. */
export const NOTICE_FROM = 7;

/** A scheduled cut: from `start` to `end` (local hours, fractional). */
export interface ScheduledCut {
  start: number;
  end: number;
}

/** The day's scheduled cut (local date; the same for everyone that day), or null. */
export function scheduledCut(date: Date): ScheduledCut | null {
  const h = hash32(`cupdien:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`);
  if (h % 100 >= SCHEDULE_PCT) return null;
  const startMin = SCHEDULE_FROM * 60 + ((h >>> 8) % ((SCHEDULE_TO - SCHEDULE_FROM) * 60));
  const len = SCHEDULE_MIN + ((h >>> 20) % (SCHEDULE_MAX - SCHEDULE_MIN + 1));
  return { start: startMin / 60, end: (startMin + len) / 60 };
}

/** The cut's time as written on the notice ("14:05"). */
export function cutClock(hour: number): string {
  const min = Math.round(hour * 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/** The paper notice is on the wall: the day of a cut, from the morning until the power is back. */
export function noticeUp(cut: ScheduledCut | null, hour: number): boolean {
  return !!cut && hour >= NOTICE_FROM && hour < cut.end;
}

// ------------------------------------------------------------------ cause 2: the overload

/** This many agents really working at the same time can trip the breaker... */
export const OVERLOAD_WORKERS = 5;
/** ...once they've been at it together for this long... */
export const OVERLOAD_HOLD_MS = 5_000;
/** ...with this chance at each once-a-second check (so it's not instant)... */
export const OVERLOAD_CHANCE = 0.12;
/** ...and never twice within this long (also counted from when the office opened). */
export const OVERLOAD_COOLDOWN_MS = 20 * 60_000;
/** Nobody went to the breaker box: it resets by itself after this long. */
export const OVERLOAD_AUTO_MS = 20_000;
/** A hard cap: the breaker is back on by then whatever happens. */
export const OVERLOAD_MAX_MS = 30_000;
/** Nobody idle around: after this long, someone who was working gets up to flip it. */
export const OVERLOAD_WORKER_FIX_MS = 6_000;
/** A moment of "huh?" in the dark before someone heads to the breaker box. */
export const OVERLOAD_REACT_MS = 1_500;

/** Does the breaker trip now? `heldMs`: how long `workers` (or more) have been working together; `sinceLast`: since the last overload. */
export function overloadTrips(workers: number, heldMs: number, sinceLast: number, roll: number): boolean {
  return workers >= OVERLOAD_WORKERS && heldMs >= OVERLOAD_HOLD_MS && sinceLast >= OVERLOAD_COOLDOWN_MS && roll < OVERLOAD_CHANCE;
}

/** The breaker box: on the pillar where the reception and the pantry walls meet the corridor (bottom center, world px). */
export const BREAKER_BOX = { x: 16 * TILE, y: CORRIDOR_Y * TILE - 2 } as const;
/** Where whoever flips it stands (corridor tile, facing the box). */
export const BREAKER_TILE = { tx: 16, ty: CORRIDOR_Y } as const;

// ------------------------------------------------------------------ cause 3: the thunderstorm

/** Chance (0–100) that a given hour of a rainy day has a lightning strike close by. */
export const STRIKE_PCT = 30;
/** Chance (0–100) that a strike takes the power with it. */
export const STRIKE_CUT_PCT = 45;
/** How long the power stays off after a strike (ms). */
export const STRIKE_CUT_MIN_MS = 15_000;
export const STRIKE_CUT_MAX_MS = 60_000;
/** The lightning flash: how long it lasts (ms), with a second flicker. */
export const FLASH_MS = 700;

/** A lightning strike in an hour of a rainy day: at which minute, and whether (and for how long) it cuts the power. */
export interface Strike {
  minute: number;
  cutMs: number;
}

/** This hour's strike (local date + whole hour; deterministic), or null. At most one an hour: that's the cooldown. */
export function stormStrike(date: Date, hour: number): Strike | null {
  const h = hash32(`set:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${Math.floor(hour)}`);
  if (h % 100 >= STRIKE_PCT) return null;
  const minute = (h >>> 8) % 60;
  const cut = (h >>> 14) % 100 < STRIKE_CUT_PCT;
  const cutMs = cut ? STRIKE_CUT_MIN_MS + ((h >>> 21) % (STRIKE_CUT_MAX_MS - STRIKE_CUT_MIN_MS + 1)) : 0;
  return { minute, cutMs };
}

/** Brightness (0–1) of the lightning flash `ms` after the strike: a bright flash, a dip and a second flicker. */
export function flashLevel(ms: number): number {
  if (ms < 0 || ms >= FLASH_MS) return 0;
  if (ms < 90) return 1 - ms / 180;
  if (ms < 200) return 0.15;
  if (ms < 280) return 0.75;
  return 0.75 * (1 - (ms - 280) / (FLASH_MS - 280));
}

// ------------------------------------------------------------------ the generator

/** The rented generator on the lawn in front of the building, during scheduled cuts (bottom center, world px). */
export const GENERATOR = { x: 12 * TILE, y: 30 * TILE - 2 } as const;
