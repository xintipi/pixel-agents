// Iced tea stall (trà đá vỉa hè) on the sidewalk in front of the building: a low table with the tea jug, plastic stools and
// the seller in a conical hat, who walks in at opening and leaves at closing. Idle agents go out through the gap in
// the corridor's west glass, down the stone path and along the sidewalk, sit for a glass and chat. Everything outside
// the building has no walk grid: the walk is a fixed route in world px (the 'route' step). Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir } from '../../art/api';
import { CORRIDOR_Y, FOOT_DX, FOOT_DY, TILE } from '../constants';
import { WEST_GAP_ROW } from '../layout/corridor';
import type { ExteriorProp } from '../layout/types';

/** Opening hours (local, fractional): before and after, the stools are stacked and the seller is gone. */
export const TEA_OPEN_H = 6.5;
export const TEA_CLOSE_H = 21.5;

/** Corridor tile in front of the west glass gap: where the outing leaves the walk grid. */
export const TEA_DOOR = { tx: 1, ty: CORRIDOR_Y + WEST_GAP_ROW } as const;

const DOOR_X = TEA_DOOR.tx * TILE + FOOT_DX;
const DOOR_Y = TEA_DOOR.ty * TILE + FOOT_DY;
/** Center of the stone path (x) and the walking lane along the sidewalk (y), in px. */
const PATH_X = -2 * TILE + 8;
const LANE_Y = 31 * TILE + 5;

/** Table: bottom center (px), on the sidewalk in front of the building, between two lamp posts. The stools and the seller are around it. */
export const TEA_TABLE = { x: 9 * TILE, y: 32 * TILE + 12 } as const;

export interface TeaSeat {
  /** Feet of whoever sits (px). */
  x: number;
  y: number;
  dir: Dir;
  /** Stool color (index into the sprite palette). */
  color: number;
}

/** Customer stools: two behind the table (facing the camera) and one on its right. */
export const TEA_SEATS: readonly TeaSeat[] = [
  { x: TEA_TABLE.x - 3, y: TEA_TABLE.y - 16, dir: 'down', color: 0 },
  { x: TEA_TABLE.x + 12, y: TEA_TABLE.y - 16, dir: 'down', color: 1 },
  { x: TEA_TABLE.x + 28, y: TEA_TABLE.y - 3, dir: 'left', color: 0 },
];

/** The seller's stool, on the table's left, next to the jug. */
export const TEA_SELLER_SEAT: TeaSeat = { x: TEA_TABLE.x - 27, y: TEA_TABLE.y - 3, dir: 'right', color: 1 };

/** Ice cooler behind the seller (bottom center, px). */
export const TEA_COOLER = { x: TEA_TABLE.x - 42, y: TEA_TABLE.y - 8 } as const;

/** Stool base (px): the seated feet sit a little above it. */
export const STOOL_FOOT_DY = 3;

/** Depth of whoever sits on a stool: right after the stool itself. */
export function seatDepth(s: TeaSeat): number {
  return s.y + STOOL_FOOT_DY + 0.25;
}

export function teaOpen(hour: number): boolean {
  return hour >= TEA_OPEN_H && hour < TEA_CLOSE_H;
}

/** Route (flat x,y px pairs) from the corridor door to a stool: through the glass gap, down the path, along the sidewalk. */
export function routeToSeat(s: TeaSeat): number[] {
  return [DOOR_X - TILE, DOOR_Y, PATH_X, DOOR_Y, PATH_X, LANE_Y, s.x, LANE_Y, s.x, s.y];
}

/** Way back in: the points reached on the way out (trail), in reverse, ending at the corridor door. */
export function wayBack(trail: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = trail.length - 2; i >= 0; i -= 2) out.push(trail[i], trail[i + 1]);
  out.push(DOOR_X, DOOR_Y);
  return out;
}

/** Where the seller comes from and goes to: the west end of the sidewalk. */
export function sellerRouteIn(fromX: number): number[] {
  return [fromX, LANE_Y + 14, TEA_SELLER_SEAT.x, LANE_Y + 14, TEA_SELLER_SEAT.x, TEA_SELLER_SEAT.y];
}

export function sellerRouteOut(toX: number): number[] {
  return [TEA_SELLER_SEAT.x, LANE_Y + 14, toX, LANE_Y + 14];
}

const SET_UP: readonly ExteriorProp[] = [
  { kind: 'tea_table', x: TEA_TABLE.x, y: TEA_TABLE.y, seed: 0 },
  { kind: 'tea_cooler', x: TEA_COOLER.x, y: TEA_COOLER.y, seed: 0 },
  ...[...TEA_SEATS, TEA_SELLER_SEAT].map((s): ExteriorProp => ({ kind: 'tea_stool', x: s.x, y: s.y + STOOL_FOOT_DY, seed: s.color })),
];
const PACKED: readonly ExteriorProp[] = [{ kind: 'tea_stack', x: TEA_TABLE.x - 4, y: TEA_TABLE.y - 2, seed: 0 }];

/** What the stall shows on the sidewalk: set up (table, cooler, stools) or packed away (a stack of stools). */
export function teaStallProps(up: boolean): readonly ExteriorProp[] {
  return up ? SET_UP : PACKED;
}

/** Stool reservations: index -> character id (and whether they're already seated). */
export class TeaStall {
  readonly taken: (string | null)[] = TEA_SEATS.map(() => null);
  readonly seated: boolean[] = TEA_SEATS.map(() => false);

  hasFree(): boolean {
    return this.taken.some((t) => t === null);
  }

  /** Reserves a free stool (random among the free ones); -1 if full or already holding one. */
  reserve(by: string, rng: () => number): number {
    if (this.taken.includes(by)) return -1;
    const free = this.taken.flatMap((t, i) => (t === null ? [i] : []));
    if (!free.length) return -1;
    const i = free[Math.floor(rng() * free.length)];
    this.taken[i] = by;
    return i;
  }

  sit(i: number, by: string): void {
    if (this.taken[i] === by) this.seated[i] = true;
  }

  release(by: string): void {
    for (let i = 0; i < this.taken.length; i++) {
      if (this.taken[i] !== by) continue;
      this.taken[i] = null;
      this.seated[i] = false;
    }
  }

  /** Ids of whoever is sitting right now. */
  sitting(): string[] {
    return this.taken.flatMap((t, i) => (t && this.seated[i] ? [t] : []));
  }

  clear(): void {
    this.taken.fill(null);
    this.seated.fill(false);
  }
}

/** What a customer says on sitting down. */
export function orderLine(rng: () => number): string {
  const lines = [tr('One iced tea, please! 🧊'), tr('Two iced teas here! 🧊'), tr('Some peanut candy too 🥜')];
  return lines[Math.floor(rng() * lines.length)];
}

/** Sidewalk chat between customers. */
export function chatLine(rng: () => number): string {
  const lines = [
    tr('It works on my machine… 🤷'),
    tr('Deploy on a Friday? No way 😅'),
    tr('Who broke the build? 👀'),
    tr('One more glass, then back to work ☕'),
    tr('The tea is on me today! 🎉'),
    tr('This bug took me all morning 😩'),
    tr('Just one more refactor… 🔧'),
  ];
  return lines[Math.floor(rng() * lines.length)];
}

/** The seller calling out to passers-by. */
export function sellerLine(rng: () => number): string {
  const lines = [tr('Iced tea here! 🧊'), tr('Sit down, sit down! 🪑'), tr('Iced tea, sunflower seeds! 🌻')];
  return lines[Math.floor(rng() * lines.length)];
}
