// City bus (xe buýt, Sài Gòn style) and its stop on the sidewalk across the street: a shelter with a roof and a bench and
// the blue sign post with the route numbers. From early morning to 21:00 a long green bus comes by every 15–20 minutes
// (more often at rush hour), signals, pulls over to the curb, opens its doors for ~10 s and pulls out again; the bikes
// behind wait or weave around it, honking. Passers-by walk up over time and wait (on the bench, scrolling the phone,
// looking down the street), board, and a few others step off and walk away. Now and then someone runs late, chasing it.
// The street (sim/traffic.ts) drives the bus, the sim (sim/busstop.ts) the people. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir } from '../../art/api';
import { BUILDING_H, TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';

/** Service hours (local, fractional): the first bus a little after 5:30, the last one around 21:00. */
export const BUS_FROM_H = 5.5;
export const BUS_TO_H = 21;
/** Between two buses (s) on a quiet street; at full rush hour the gap shrinks to about half. */
export const BUS_GAP_S: readonly [number, number] = [900, 1200];
/** The routes stopping here (the sign lists them, each bus shows one). */
export const BUS_ROUTES = ['08', '19', '150'] as const;

/** Top of the sidewalk across the street (px), like the outdoor layout (layout/exterior.ts). */
const FAR_WALK_Y = (BUILDING_H + 9) * TILE;
/** The stop: the shelter's center (px), between the evening dance (x ≤ 10 tiles) and the east end, clear of the crossing. */
export const BUS_STOP_X = 18 * TILE;
/** The shelter (bottom center, px), at the back of the sidewalk. */
export const BUS_SHELTER = { x: BUS_STOP_X, y: FAR_WALK_Y + 28 } as const;
/** The sign post (bottom center, px), by the curb west of the shelter; the front door stops just past it. */
export const BUS_SIGN = { x: BUS_STOP_X - 56, y: FAR_WALK_Y + 9 } as const;

/** Half the bus's length (px), bumper to bumper (a motorbike is 26). */
export const BUS_HALF = 42;
/** The doors (px from the bus's center, towards the front): the front one to get on, the middle one to get off. */
export const BUS_FRONT_DOOR = 30;
export const BUS_REAR_DOOR = -12;
/**
 * The bus pulled over (bottom center, px): wheels by the curb (close enough that a car behind can't get past, the bikes
 * can), the front door between the sign and the shelter (westbound).
 */
export const BUS_PARK = { x: BUS_SIGN.x + 14 + BUS_FRONT_DOOR, y: FAR_WALK_Y - 3 } as const;
/** Where those getting on step in, and those getting off step down (feet, px). */
export const BUS_DOOR = { x: BUS_PARK.x - BUS_FRONT_DOOR, y: FAR_WALK_Y + 4 } as const;
export const BUS_EXIT = { x: BUS_PARK.x - BUS_REAR_DOOR, y: FAR_WALK_Y + 4 } as const;
/** The walking lane along that sidewalk (px). */
export const BUS_WALK_Y = FAR_WALK_Y + 20;

/** The doors stay open at least this long (ms); the driver waits for the stragglers at most this long. */
export const BUS_DWELL_MS = 10_000;
export const BUS_HOLD_MAX_MS = 30_000;
/** Doors opening after the stop, and closing before pulling out (ms). */
export const BUS_DOOR_MS = 700;
export const BUS_CLOSE_MS = 1_200;
/** Cruising speed (px/s): slower than the cars. */
export const BUS_SPEED = 34;
/** Each bus: the chance someone comes running after it, and that the driver waits for them. */
export const BUS_CHASE_CHANCE = 0.3;
export const BUS_WAIT_CHANCE = 0.55;
/** Each second in service hours: the chance someone walks up to wait (plus more at rush hour), and how many at most. */
export const BUS_RIDER_CHANCE = 0.008;
export const BUS_RIDER_RUSH = 0.008;

export interface BusSpot {
  /** Feet (px). */
  x: number;
  y: number;
  dir: Dir;
  /** On the bench (seated) or standing. */
  seat?: boolean;
}

/** Where people wait: the three places on the bench, then standing beside the shelter and by the sign. */
export const BUS_SPOTS: readonly BusSpot[] = [
  { x: BUS_STOP_X - 13, y: BUS_SHELTER.y - 4, dir: 'down', seat: true },
  { x: BUS_STOP_X + 1, y: BUS_SHELTER.y - 4, dir: 'down', seat: true },
  { x: BUS_STOP_X + 15, y: BUS_SHELTER.y - 4, dir: 'down', seat: true },
  { x: BUS_STOP_X + 42, y: FAR_WALK_Y + 14, dir: 'right' },
  { x: BUS_STOP_X + 56, y: FAR_WALK_Y + 24, dir: 'down' },
  { x: BUS_STOP_X - 70, y: FAR_WALK_Y + 20, dir: 'right' },
  { x: BUS_STOP_X - 82, y: FAR_WALK_Y + 11, dir: 'right' },
];

/** Depth of whoever sits on the bench: right after the shelter itself. */
export const BUS_SEAT_DEPTH = BUS_SHELTER.y + 0.5;

/** The bus as the stop sees it (the street works it out each frame; the renderer passes it on). */
export type BusPhase = 'coming' | 'pulling' | 'stopped' | 'leaving';
export interface BusAt {
  phase: BusPhase;
  /** Center of the bus (px). */
  x: number;
  route: string;
  /** Stopped with the doors open: people can get on and off. */
  doorsOpen: boolean;
}

/** Buses run (local hour). */
export function busRuns(hour: number): boolean {
  return hour >= BUS_FROM_H && hour < BUS_TO_H;
}

/** Time to the next bus (ms): 15–20 minutes, shorter at rush hour (`rush` 0–1). */
export function busGapMs(rush: number, rng: () => number): number {
  const [a, b] = BUS_GAP_S;
  return (a + rng() * (b - a)) * (1 - 0.45 * rush) * 1000;
}

/** Walking in from one end of the far sidewalk to a waiting spot. */
export function busRouteIn(fromX: number, s: { x: number; y: number }): number[] {
  return [fromX, BUS_WALK_Y, s.x, BUS_WALK_Y, s.x, s.y];
}

/** From the waiting spot (or wherever they are) up to the front door. */
export function busRouteToDoor(from: { x: number; y: number }): number[] {
  const end = [BUS_DOOR.x + 3, BUS_DOOR.y + 8, BUS_DOOR.x, BUS_DOOR.y];
  // off the bench: out the front of the shelter and around its west end
  if (Math.abs(from.x - BUS_STOP_X) < 36 && from.y > BUS_WALK_Y) {
    const side = BUS_STOP_X - 38;
    return [from.x, BUS_SHELTER.y + 4, side, BUS_SHELTER.y + 4, side, BUS_DOOR.y + 8, ...end];
  }
  return [from.x, BUS_DOOR.y + 8, ...end];
}

/** Stepping down from the middle door and walking off to one end (around the shelter, not through the bench). */
export function busRouteOff(toX: number, lane: number): number[] {
  const side = toX > BUS_EXIT.x ? BUS_STOP_X + 38 : BUS_STOP_X - 38;
  return [BUS_EXIT.x, BUS_EXIT.y, side, BUS_EXIT.y + 3, side, BUS_WALK_Y + lane, toX, BUS_WALK_Y + lane];
}

/** The stop's furniture: the shelter and the sign post (always there). */
const STOP_PROPS: readonly ExteriorProp[] = [
  { kind: 'bus_shelter', x: BUS_SHELTER.x, y: BUS_SHELTER.y, seed: 0 },
  { kind: 'bus_sign', x: BUS_SIGN.x, y: BUS_SIGN.y, seed: 0 },
];

export function busStopProps(): readonly ExteriorProp[] {
  return STOP_PROPS;
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** Running after the bus. */
export function chaseLine(rng: () => number): string {
  return pick(rng, [tr('Wait for me, uncle!'), tr('Wait! Wait! 🏃'), tr('Hold the door! 🏃')]);
}

/** Made it: the driver waited. */
export function caughtLine(rng: () => number): string {
  return pick(rng, [tr('Phew, thanks uncle! 😅'), tr('Made it! 😮‍💨')]);
}

/** Too late: the bus pulled away. */
export function missedLine(rng: () => number): string {
  return pick(rng, [tr('Missed it again... 😩'), tr('Twenty more minutes now 😮‍💨'), tr('He saw me, I know he did 😤')]);
}

/** Now and then, someone waiting. */
export function waitLine(rng: () => number): string {
  return pick(rng, [tr('Where is that bus... ⏳'), tr('Is the 150 still running? 🤔'), tr('Late again, as always 😮‍💨'), tr('Should have left earlier 😮‍💨')]);
}

/** Waited past the last bus: giving up. */
export function lastBusLine(rng: () => number): string {
  return pick(rng, [tr('No more buses tonight, I guess 😩'), tr('Fine, I will take a xe ôm 🛵')]);
}
