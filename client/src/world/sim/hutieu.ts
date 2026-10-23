// The night hủ tiếu cart (hủ tiếu gõ): once the iced tea stall has packed up, an uncle in a white tank top pushes his
// little wooden cart (glass case, steaming pot, a bulb hanging over it) along the curb and parks in front of the
// building until late. His helper, a boy, walks the sidewalk clacking two bamboo sticks ("cốc cốc cốc"); an idle agent
// still at the desk now and then orders a bowl, and the boy carries it in through the corridor door, right to the
// desk, and runs back out. A few plastic stools by the cart: passers-by walk up and eat, riders pull over, park the
// bike by the curb and eat, and now and then an agent walks out to eat there too. Purely visual. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir } from '../../art/api';
import { TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';
import { LANE_Y, STOOL_FOOT_DY, type TeaSeat } from './tea';

/** Selling hours (local, fractional): from when the tea stall packs up until late. */
export const HUTIEU_OPEN_H = 18.5;
export const HUTIEU_CLOSE_H = 23;
/** At most this many bowls a night. */
export const HUTIEU_MAX_BOWLS = 3;
/** Each second while the boy is out clacking, the chance that an idle agent orders. */
export const HUTIEU_ORDER_CHANCE = 0.03;
/** The order is forgotten (no bowl) if it isn't delivered in this long (ms). */
export const HUTIEU_ORDER_MS = 3 * 60_000;

/** Parked cart: bottom center (px), on the sidewalk by the curb, between the bánh mì spot and the tyre repair. */
export const HUTIEU_CART = { x: 23 * TILE, y: 32 * TILE + 12 } as const;
/** The cart rides this far right of the uncle's feet (he pushes it by the handle on its west end). */
const CART_DX = 34;
const CART_DY = 1;
/** Where the uncle stands while parked: at the handle (west end), facing the cart. */
export const HUTIEU_UNCLE_SPOT: { x: number; y: number; dir: Dir } = { x: HUTIEU_CART.x - CART_DX, y: HUTIEU_CART.y - CART_DY, dir: 'right' };
/** Where the boy picks up the bowls: at the cart's east end. */
export const HUTIEU_PICKUP: { x: number; y: number; dir: Dir } = { x: HUTIEU_CART.x + 34, y: HUTIEU_CART.y - 2, dir: 'left' };

/** The uncle walks the cart in along the curb, like the other carts. */
const CURB_Y = 33 * TILE + 5;

/**
 * Low plastic stools by the cart's east end, facing it: passers-by, riders who pull over and agents who walk out sit
 * here to eat (feet of whoever sits, px; `color` = the stool's).
 */
export const HUTIEU_STOOLS: readonly TeaSeat[] = [
  { x: HUTIEU_CART.x + 42, y: HUTIEU_CART.y - 14, dir: 'left', color: 1 },
  { x: HUTIEU_CART.x + 58, y: HUTIEU_CART.y - 14, dir: 'left', color: 0 },
  { x: HUTIEU_CART.x + 50, y: HUTIEU_CART.y - 2, dir: 'left', color: 1 },
];

/** Stools out while the cart is parked. */
export function hutieuStoolProps(up: boolean): readonly ExteriorProp[] {
  return up ? HUTIEU_STOOLS.map((s) => ({ kind: 'tea_stool', x: s.x, y: s.y + STOOL_FOOT_DY, seed: s.color })) : [];
}

/** Where a rider who pulls over to eat parks the bike: by the curb, west of the cart (bottom center, px). */
export const DINER_PARK = { x: HUTIEU_CART.x - 70, y: 32 * TILE + 14 } as const;

/** Each second while the cart is out with a free stool: the chance a passer-by walks up, or a rider pulls over. */
export const PASSERBY_CHANCE = 0.012;
export const RIDER_CHANCE = 0.008;
/** A bowl at the stool lasts this long (ms). */
export const EAT_MS: readonly [number, number] = [25_000, 45_000];

/** A passer-by walks along the sidewalk (just below the lane) from one end, to a stool, and on to the other end. */
const STROLL_Y = LANE_Y + 10;

export function passerbyRouteIn(fromX: number, s: TeaSeat): number[] {
  return [fromX, STROLL_Y, s.x, STROLL_Y, s.x, s.y];
}

export function passerbyRouteOut(s: TeaSeat, toX: number): number[] {
  return [s.x, STROLL_Y, toX, STROLL_Y];
}

/** A rider walks from the parked bike to the stool, and back. */
export function riderToStool(s: TeaSeat): number[] {
  return [DINER_PARK.x, STROLL_Y, s.x, STROLL_Y, s.x, s.y];
}

export function riderToBike(s: TeaSeat): number[] {
  return [s.x, STROLL_Y, DINER_PARK.x, STROLL_Y, DINER_PARK.x, DINER_PARK.y - 2];
}

/** The boy's beat along the sidewalk (px): west end, east end. */
export const BOY_BEAT: readonly [number, number] = [3 * TILE, 30 * TILE];

export function hutieuOpen(hour: number): boolean {
  return hour >= HUTIEU_OPEN_H && hour < HUTIEU_CLOSE_H;
}

/** The uncle pushes the cart in from the west end of the curb and steps up onto the sidewalk at the parking spot. */
export function uncleRouteIn(fromX: number): number[] {
  const v = HUTIEU_UNCLE_SPOT;
  return [fromX, CURB_Y, v.x, CURB_Y, v.x, v.y];
}

/** ...and at closing goes on east. */
export function uncleRouteOut(toX: number): number[] {
  return [HUTIEU_UNCLE_SPOT.x, CURB_Y, toX, CURB_Y];
}

/** Where the cart is drawn (bottom center, px) for the uncle's feet: always just ahead of him. */
export function hutieuCartAt(uncle: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(uncle.x + CART_DX), y: Math.round(uncle.y + CART_DY) };
}

export function hutieuCartProps(cart: { x: number; y: number } | null): readonly ExteriorProp[] {
  return cart ? [{ kind: 'hutieu_cart', x: cart.x, y: cart.y, seed: 0 }] : [];
}

/** The boy walks along the sidewalk lane to x (px). */
export function boyWalk(fromX: number, toX: number): number[] {
  return [fromX, LANE_Y, toX, LANE_Y];
}

/** Next stop of the boy's beat: somewhere else along the sidewalk, at least a few tiles away. */
export function nextBeat(x: number, rng: () => number): number {
  const [a, b] = BOY_BEAT;
  for (let i = 0; i < 6; i++) {
    const t = a + Math.round(rng() * (b - a));
    if (Math.abs(t - x) >= 4 * TILE) return t;
  }
  return x < (a + b) / 2 ? b : a;
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** The boy's clacking. */
export function boyCall(rng: () => number): string {
  return pick(rng, [tr('Clack clack clack! 🥢'), tr('Hủ tiếu here! Clack clack! 🥢'), tr('Hot hủ tiếu, clack clack! 🥢')]);
}

/** What an agent orders from the desk. */
export function hutieuOrder(rng: () => number): string {
  return pick(rng, [tr('One hủ tiếu, extra bean sprouts! 🍜'), tr('A bowl of hủ tiếu over here! 🍜'), tr('Hủ tiếu, no chili please 🍜')]);
}

/** What the boy says handing the bowl over. */
export function boyDeliver(rng: () => number): string {
  return pick(rng, [tr("Here's your hủ tiếu! 🍜"), tr('Careful, the broth is hot! 🍜')]);
}

/** A customer sitting down at the cart (passer-by, rider or agent). */
export function stoolOrder(rng: () => number): string {
  return pick(rng, [tr('Uncle, one bowl please! 🍜'), tr('A big bowl, extra noodles! 🍜'), tr('One hủ tiếu, quick please, I\x27m starving! 🍜')]);
}

/** ...and on getting up. */
export function stoolBye(rng: () => number): string {
  return pick(rng, [tr('How much, uncle? 💵'), tr('Delicious, see you tomorrow! 😋')]);
}

/** The agent, with the bowl. */
export function hutieuThanks(rng: () => number): string {
  return pick(rng, [tr('Smells amazing! 😋'), tr('Just what a late night needs 😋')]);
}
