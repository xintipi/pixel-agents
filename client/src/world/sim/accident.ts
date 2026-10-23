// A traffic accident on the street (purely visual; always the street's own generated traffic, never the agents): now
// and then (about once or twice a day, more likely in the rain and at rush hour) a motorbike gets bumped from behind
// and goes down in its lane. The bike lies there with bits of plastic around it, the rider sits by it holding a leg,
// the other rider gets off to argue and ask if they're okay, then rides on. The lane is blocked: the traffic behind
// queues and, when the oncoming lane is free, slowly goes around; at rush hour that rarely happens and the street
// really jams. A traffic police officer walks up, puts out cones and directs the traffic past one side at a time; an
// ambulance comes with its siren, two medics bandage the rider and take them away; the officer wheels the bike off,
// picks up the cones and the lane reopens. The whole thing lasts two or three minutes.
// This module is the pure part: when one can happen, the timeline, the scene's layout and the obstacle it makes.
// sim/traffic.ts runs the vehicles (the crash, the queue, the ambulance), sim/accident-crew.ts the people.
import { tr } from '../../../../shared/i18n';
import { hash32 } from '../../../../shared/hash';

/** Never late at night (23:00–6:00, local, fractional hours). */
export const ACCIDENT_FROM_H = 6;
export const ACCIDENT_TO_H = 23;
/** At least this long (ms of the world clock) between two crashes... */
export const ACCIDENT_COOLDOWN_MS = 2.5 * 3_600_000;
/** ...and none in the first minutes after the page opens (ms of the world clock). */
export const ACCIDENT_GRACE_MS = 10 * 60_000;
/** On a quiet dry day, the chance of a crash in a given hour (rush hour and rain raise it). */
const BASE_PER_HOUR = 1 / 11;
/** A crash rolled for a minute waits this long (ms) for a fitting pair of vehicles. */
export const ACCIDENT_PENDING_MS = 45_000;

/** Timeline (ms after the crash). */
export const ACCIDENT_T = {
  /** The other vehicle stays this long, its rider arguing, then rides on. */
  other: [14_000, 20_000],
  /** The officer is sent after this long (and walks up). */
  officer: [5_000, 11_000],
  /** The ambulance sets off this long after the crash (and drives up). */
  ambulance: [18_000, 28_000],
  /** Not there yet by then (stuck somewhere): it's put by the scene. */
  ambulanceLate: 80_000,
  /** The medics bandage the rider for this long. */
  treat: 7_000,
  /** The officer alternates the free lane this often while directing. */
  hold: 8_000,
  /** Whatever happens, the scene is gone after this long (a hidden tab, a timelapse, something stuck). */
  max: 200_000,
} as const;

/** What's going on, in order (sim/accident-crew.ts and the tests read it). */
export type AccidentStage = 'crash' | 'police' | 'ambulance' | 'treat' | 'clearing' | 'done';

/** The crash, shared by the street (sim/traffic.ts) and the people (sim/accident-crew.ts); the renderer draws it. */
export interface AccidentScene {
  id: number;
  /** When it happened (ms, the traffic's clock). */
  at: number;
  /** Where the bike lies (bottom center, px), the lane it blocks (line, px) and that lane's direction. */
  x: number;
  laneY: number;
  dir: 1 | -1;
  /** The fallen bike's variant (its color, its rider's look). */
  variant: number;
  /** The vehicle that hit it (variant; null: the bike slipped on its own), a bike or a car, and until when it stays (ms). */
  other: number | null;
  otherKind: 'bike' | 'car';
  otherX: number;
  otherY: number;
  otherUntil: number;
  /** When the officer and the ambulance are sent (ms). */
  officerDue: number;
  ambulanceDue: number;
  // ---- the people (sim/accident-crew.ts)
  /** The officer reached the scene (ms; 0 = not yet). */
  officerAt: number;
  /** Cones put out (0–3). */
  cones: number;
  /** The officer directs the traffic past the scene: who waits (1 = eastbound, -1 = westbound) and until when (ms). */
  directing: boolean;
  hold: 1 | -1;
  holdUntil: number;
  /** The bike: lying in the lane, wheeled by the officer (at bikeX, bikeY), parked by the curb, gone. */
  bike: 'down' | 'wheeled' | 'parked' | 'gone';
  bikeX: number;
  bikeY: number;
  /** The rider got bandaged; the ambulance's back doors are open; the rider is inside and it may go. */
  bandaged: boolean;
  doors: boolean;
  loaded: boolean;
  /** Everyone left: the street drops the scene. */
  done: boolean;
  // ---- the street (sim/traffic.ts)
  /** The ambulance: not sent yet, on its way, stopped by the scene (ambX, ambY, facing ambDir), leaving, gone. */
  ambulance: 'none' | 'coming' | 'there' | 'leaving' | 'gone';
  ambX: number;
  ambY: number;
  ambDir: 1 | -1;
}

/** A stretch of a lane nobody can ride through (px): x0..x1 along it, y0..y1 across it. */
export interface Obstacle {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The world as the accident scheduler sees it. */
export interface AccidentCalendar {
  hour: number;
  /** The first days of Tết (an empty street). */
  tetHoliday?: boolean;
  /** Something else is going on: the siesta, the New Year party, the disco, a power cut, an office visit. */
  blocked?: boolean;
}

/** Can a crash happen now (the hour and what's going on)? */
export function accidentAllowed(c: AccidentCalendar): boolean {
  return c.hour >= ACCIDENT_FROM_H && c.hour < ACCIDENT_TO_H && !c.tetHoliday && !c.blocked;
}

/** Chance of a crash in a given minute: rush hour (level 0–1) and rain make it likelier. */
export function accidentChancePerMinute(level: number, raining: boolean): number {
  return (BASE_PER_HOUR / 60) * (1 + 1.5 * Math.max(0, Math.min(1, level))) * (raining ? 2 : 1);
}

/** The roll for a minute of the world clock: the same minute always gives the same answer. */
export function accidentRoll(minute: number, chance: number): boolean {
  return hash32(`accident:${minute}`) / 4_294_967_296 < chance;
}

/**
 * When crashes happen: once a minute of the world clock, a roll (deterministic for that minute); a hit waits a little
 * for a fitting pair of vehicles. Never within the grace after the page opens or the cooldown after the last one.
 */
export class AccidentClock {
  private startAt: number | null = null;
  private lastAt = -Infinity;
  private minute = -1;
  private pendingUntil = 0;

  /** Is a crash wanted right now? `clock`: the world clock (ms epoch). */
  due(clock: number, level: number, raining: boolean, allowed: boolean): boolean {
    // the clock went back (a timelapse, a replay): start over
    if (this.startAt === null || clock < this.startAt) {
      this.startAt = clock;
      this.lastAt = -Infinity;
      this.pendingUntil = 0;
    }
    if (clock < this.lastAt) this.lastAt = -Infinity;
    const minute = Math.floor(clock / 60_000);
    if (minute !== this.minute) {
      this.minute = minute;
      if (allowed && accidentRoll(minute, accidentChancePerMinute(level, raining))) this.pendingUntil = clock + ACCIDENT_PENDING_MS;
    }
    return allowed && clock < this.pendingUntil && clock - this.startAt >= ACCIDENT_GRACE_MS && clock - this.lastAt >= ACCIDENT_COOLDOWN_MS;
  }

  /** A crash happened (or was forced) at `clock`. */
  fired(clock: number): void {
    this.lastAt = clock;
    this.pendingUntil = 0;
  }
}

/** Where things are in the event, from what the street and the people have done so far. */
export function accidentStage(s: AccidentScene, now: number): AccidentStage {
  if (s.done || now - s.at >= ACCIDENT_T.max || now < s.at) return 'done';
  if (s.ambulance === 'leaving' || s.ambulance === 'gone' || s.loaded) return 'clearing';
  if (s.ambulance === 'there') return 'treat';
  if (s.ambulance === 'coming') return 'ambulance';
  if (s.officerAt || s.cones > 0 || now >= s.officerDue) return 'police';
  return 'crash';
}

/** Lane band (px) around a lane line: bikes spread this far above and below it (as sim/traffic.ts). */
export const LANE_UP = 15;
export const LANE_DOWN = 6;

/** The cones around the bike (feet, px): two upstream, one downstream. */
export function conePoints(s: Pick<AccidentScene, 'x' | 'laneY' | 'dir'>): readonly { x: number; y: number }[] {
  const { x, laneY, dir } = s;
  return [
    { x: x - dir * 34, y: laneY - 9 },
    { x: x - dir * 30, y: laneY + 4 },
    { x: x + dir * 30, y: laneY - 3 },
  ];
}

/** Where the rider sits, by the bike on the curb side of the lane (feet, px). */
export function riderSpot(s: Pick<AccidentScene, 'x' | 'laneY' | 'dir'>): { x: number; y: number } {
  return { x: s.x + s.dir * 13, y: s.dir > 0 ? s.laneY - 11 : s.laneY + 5 };
}

/** Where the officer stands to direct: upstream of the cones, on the free lane's side (feet, px). */
export function officerSpot(s: Pick<AccidentScene, 'x' | 'laneY' | 'dir'>): { x: number; y: number } {
  return { x: s.x - s.dir * 40, y: s.dir > 0 ? s.laneY + 9 : s.laneY - 16 };
}

/** The curb the bike gets wheeled to: the near sidewalk's edge for the eastbound lane, the far one's for the westbound. */
export function curbSpot(s: Pick<AccidentScene, 'x' | 'laneY' | 'dir'>, streetY: number, streetH: number): { x: number; y: number } {
  return { x: s.x - s.dir * 6, y: s.dir > 0 ? streetY - 3 : streetY + streetH + 12 };
}

/** Height (px) where the traffic goes around the scene: just past the blocked lane's band, toward the center line. */
export function detourY(s: Pick<AccidentScene, 'laneY' | 'dir'>): number {
  return s.dir > 0 ? s.laneY + LANE_DOWN + 13 : s.laneY - LANE_UP - 12;
}

/**
 * The stretch of lane the scene blocks (into `out`), or false when nothing does any more: the bike lying there (with
 * its bits around), the cones once they're out (the officer's spot included).
 */
export function sceneObstacle(s: AccidentScene, out: Obstacle): boolean {
  const bike = s.bike === 'down';
  if (!bike && s.cones <= 0) return false;
  // the cones' stretch, upstream longer (the officer stands there); the bike alone, a little less
  const back = s.cones > 0 ? 44 : 22;
  const ahead = s.cones > 0 ? 34 : 20;
  out.x0 = s.dir > 0 ? s.x - back : s.x - ahead;
  out.x1 = s.dir > 0 ? s.x + ahead : s.x + back;
  out.y0 = s.laneY - LANE_UP - 1;
  out.y1 = s.laneY + LANE_DOWN + 1;
  return true;
}

/**
 * Room (px) ahead of a vehicle (center `x`, half length `half`, going `dir`, at height `y`, `margin` half its width)
 * before the obstacle, or Infinity if it isn't in the way (another height, or already behind).
 */
export function obstacleGap(x: number, half: number, dir: 1 | -1, y: number, margin: number, o: Obstacle): number {
  if (y + margin < o.y0 || y - margin > o.y1) return Infinity;
  const gap = dir > 0 ? o.x0 - (x + half) : x - half - o.x1;
  // already inside or past it (say, the stopped vehicle that hit the bike): only what's ahead counts
  if (dir > 0 ? x - half > o.x1 : x + half < o.x0) return Infinity;
  return Math.max(0, gap);
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** The rider on the ground. */
export function riderLine(rng: () => number): string {
  return pick(rng, [tr('Ouch, my leg... 🤕'), tr('Ow ow ow... 🤕')]);
}

/** The other rider, off the bike: first angry, then worried. */
export function otherLines(rng: () => number): [string, string] {
  return [pick(rng, [tr('You came out of nowhere! 😤'), tr('Why did you brake so suddenly?! 😤')]), pick(rng, [tr('Are you okay?! 😰'), tr('Can you get up? 😰')])];
}

/** The officer at the scene, directing. */
export function officerLine(rng: () => number): string {
  return pick(rng, [tr('Tweet! This way, slowly! 👮'), tr('Tweet tweet! One side at a time! 👮'), tr('Keep moving, nothing to see! 👮')]);
}

/** The medics. */
export function medicLine(rng: () => number): string {
  return pick(rng, [tr("Don't move, we've got you 🚑"), tr("Just a scrape, you'll be fine 🩹")]);
}

/** Someone on the sidewalk who saw it. */
export function onlookerLine(rng: () => number): string {
  return pick(rng, [tr('Oh no, someone fell! 😱'), tr('Is anyone hurt? 😰'), tr('Call an ambulance! 📞')]);
}
