// The flower bike (xe hoa dạo, Hà Nội): twice a day a woman walks her old bicycle along the curb, the rear rack and the
// front basket heaped with the flowers of the month (peach branches at Tết, white lilies in April, lotus in summer,
// yellow chrysanthemums in autumn, cúc họa mi in winter). She stops in front of the building for a few minutes; now and
// then an idle agent goes out the usual way (corridor glass gap, stone path, sidewalk), buys a bunch and puts it in a
// little vase on their desk, where it stays until the end of the day. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir, HeldItem } from '../../art/api';
import { TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';

export type FlowerKind = 'dao' | 'loaken' | 'sen' | 'cuc' | 'hoami';

export interface FlowerInfo {
  kind: FlowerKind;
  /** The bunch in the hand on the way back. */
  held: HeldItem;
  /** Petal (dark, light) and center colors: the bike's load and the vase on the desk. */
  petal: string;
  petalLit: string;
  center: string;
}

const FLOWERS: Readonly<Record<FlowerKind, FlowerInfo>> = {
  dao: { kind: 'dao', held: 'bouquet_pink', petal: '#e86a9a', petalLit: '#ffb3cf', center: '#c23c6e' },
  loaken: { kind: 'loaken', held: 'bouquet_white', petal: '#e9eef2', petalLit: '#ffffff', center: '#e8d36a' },
  sen: { kind: 'sen', held: 'bouquet_pink', petal: '#f07fa8', petalLit: '#ffc9dc', center: '#f2d14c' },
  cuc: { kind: 'cuc', held: 'bouquet_yellow', petal: '#f2b630', petalLit: '#ffe07a', center: '#c98a1f' },
  hoami: { kind: 'hoami', held: 'bouquet_white', petal: '#f4f6f8', petalLit: '#ffffff', center: '#f2c94c' },
};

/** The flowers of the month (1–12). */
export function flowerOfMonth(month: number): FlowerInfo {
  if (month <= 2) return FLOWERS.dao;
  if (month <= 4) return FLOWERS.loaken;
  if (month <= 7) return FLOWERS.sen;
  if (month <= 10) return FLOWERS.cuc;
  return FLOWERS.hoami;
}

/** All the kinds, in a fixed order (the bike sprite's seed). */
export const FLOWER_KINDS: readonly FlowerKind[] = ['dao', 'loaken', 'sen', 'cuc', 'hoami'];

export function flowerInfo(kind: FlowerKind): FlowerInfo {
  return FLOWERS[kind];
}

/** She comes by once in each of these windows (local, fractional): early morning and mid-afternoon. */
export const FLOWER_WINDOWS: readonly (readonly [number, number])[] = [
  [8, 8.75],
  [15.5, 16.25],
];
/** How long she stops in front of the building (ms). */
export const FLOWER_STOP_MS = 4 * 60_000;
/** At most this many bunches sold per visit. */
export const FLOWER_MAX_SALES = 3;
/** Each second while she's stopped, the chance that an idle agent goes out to buy. */
export const FLOWER_BUY_CHANCE = 0.06;
/** She calls out this often while walking or stopped. */
export const FLOWER_CALL_MS = 12_000;

/** Along the curb, like the scrap buyer. */
const CURB_Y = 33 * TILE + 5;
/** The bike rides just ahead of her (she walks it by the handlebar's left side). */
const BIKE_DX = 32;

/** Where she stops: in front of the building, between the iced tea stall and the bánh mì cart. */
export const FLOWER_STOP = { x: 13 * TILE, y: CURB_Y } as const;

export interface BuyerSpot {
  x: number;
  y: number;
  dir: Dir;
}

/** Where the buyers stand: on the sidewalk's edge by the bike's load, facing down at it. */
export const FLOWER_SPOTS: readonly BuyerSpot[] = [
  { x: FLOWER_STOP.x + BIKE_DX - 12, y: 32 * TILE + 8, dir: 'down' },
  { x: FLOWER_STOP.x + BIKE_DX + 6, y: 32 * TILE + 8, dir: 'down' },
];

/** Which window this hour is in (-1: none). */
export function flowerWindow(hour: number): number {
  return FLOWER_WINDOWS.findIndex(([from, to]) => hour >= from && hour < to);
}

/** In from the west end of the curb to the stop, and on past the east end. */
export function flowerRoute(fromX: number, toX: number): { in: number[]; out: number[] } {
  return { in: [fromX, CURB_Y, FLOWER_STOP.x, CURB_Y], out: [toX, CURB_Y] };
}

/** Where the bike is drawn (bottom center, px): just ahead of her. */
export function flowerBikeAt(vendor: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(vendor.x + BIKE_DX), y: Math.round(vendor.y + 1) };
}

export function flowerBikeProps(bike: { x: number; y: number } | null, kind: FlowerKind): readonly ExteriorProp[] {
  return bike ? [{ kind: 'flower_bike', x: bike.x, y: bike.y, seed: FLOWER_KINDS.indexOf(kind) }] : [];
}

/** End of the local day (ms epoch): the vase stays on the desk until then. */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** The name of the flowers, as she calls them. */
export function flowerName(kind: FlowerKind): string {
  switch (kind) {
    case 'dao':
      return tr('peach blossoms');
    case 'loaken':
      return tr('white lilies');
    case 'sen':
      return tr('lotus');
    case 'cuc':
      return tr('chrysanthemums');
    case 'hoami':
      return tr('daisies');
  }
}

/** Her call. */
export function flowerCall(kind: FlowerKind, rng: () => number): string {
  const name = flowerName(kind);
  return pick(rng, [tr('Flowers here, fresh {0}! 💐', [name]), tr('Who wants {0}? Fresh this morning! 💐', [name])]);
}

/** What a buyer says. */
export function flowerOrder(kind: FlowerKind, rng: () => number): string {
  const name = flowerName(kind);
  return pick(rng, [tr('A bunch of {0}, please! 💐', [name]), tr('How much for the {0}? 💐', [name]), tr('Some {0} for my desk 💐', [name])]);
}

/** ...and her reply. */
export function flowerReply(rng: () => number): string {
  return pick(rng, [tr('Thirty thousand, the prettiest ones! 🌸'), tr('Here, I added a few more for you 🌸')]);
}
