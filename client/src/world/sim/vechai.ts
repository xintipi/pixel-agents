// The scrap buyer (ve chai, đồng nát): four times a day she walks her old bicycle along the curb, loaded with sacks and
// flattened cardboard, the little loudspeaker on the handlebar calling "ai ve chai…"; she stops by the iced tea stall,
// the seller sells her the bag of empty bottles (when there's one: every few hours), and she walks on east. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { ExteriorProp } from '../layout/types';
import { TILE } from '../constants';
import { TEA_TABLE } from './tea';

/**
 * She comes by once in each of these windows (local, fractional), fitted into the street's day: after the morning rush,
 * mid-morning, early and mid-afternoon (never at rush hour, over lunch or once the tea stall has packed up).
 */
export const SCRAP_WINDOWS: readonly (readonly [number, number])[] = [
  [9, 9.5],
  [10.5, 11],
  [14, 14.5],
  [16, 16.5],
];
/** The tea stall only has a bag of empty bottles for her this often (ms): the other times she just rides by calling. */
export const SCRAP_SALE_GAP_MS = 3 * 3_600_000;
/** The loudspeaker repeats the call this often while she walks. */
export const SCRAP_CALL_MS = 9_000;

/** Along the curb, like the garbage cart. */
const CURB_Y = 33 * TILE + 5;
/** The bike rides just ahead of her (she pushes it by the rear rack, the load clear of her). */
const BIKE_DX = 32;

/** Where she stops: west of the tea stall (the bike just short of it), so the seller can bring out the bottles. */
export const SCRAP_STOP = { x: TEA_TABLE.x - 70, y: CURB_Y } as const;

/** Which window this hour is in (-1: none). */
export function scrapWindow(hour: number): number {
  return SCRAP_WINDOWS.findIndex(([from, to]) => hour >= from && hour < to);
}

/** In from the west end of the curb to the stop, and on past the east end. */
export function scrapRoute(fromX: number, toX: number): { in: number[]; out: number[] } {
  return { in: [fromX, CURB_Y, SCRAP_STOP.x, CURB_Y], out: [toX, CURB_Y] };
}

/** Where the bike is drawn (bottom center, px): just ahead of her. */
export function scrapBikeAt(buyer: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(buyer.x + BIKE_DX), y: Math.round(buyer.y + 1) };
}

export function scrapBikeProps(bike: { x: number; y: number } | null): readonly ExteriorProp[] {
  return bike ? [{ kind: 'scrap_bike', x: bike.x, y: bike.y, seed: 0 }] : [];
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** The loudspeaker. */
export function scrapCall(rng: () => number): string {
  return pick(rng, [
    tr('Scrap! Anyone selling scrap? 📢'),
    tr('Buying old bottles, cardboard, broken fans… 📢'),
    tr('Old TVs, fridges, scrap metal, I buy it all! 📢'),
  ]);
}

/** The tea seller, with her bag of empty bottles. */
export function scrapSell(rng: () => number): string {
  return pick(rng, [tr('Wait! A whole bag of bottles here ♻️'), tr('Take these cans and bottles, how much? ♻️')]);
}

/** ...and what she pays. */
export function scrapPay(rng: () => number): string {
  return pick(rng, [tr('Five thousand for the lot, okay? 💵'), tr("Here's ten thousand, thank you! 💵")]);
}
