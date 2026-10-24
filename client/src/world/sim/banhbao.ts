// The night bánh bao seller: once an evening he walks his bicycle along the sidewalk, the steamer box on the rear rack
// and the little loudspeaker on the handlebar ("bánh bao nóng hổi đây…"); he stops at the foot of the stone path, whoever
// is still idle in the office comes down for one, and he walks on east. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import { TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';
import { LOTTERY_STOPS } from './lottery';

/** He comes by once a day, starting in this window (local, fractional). */
export const BUN_FROM_H = 20.5;
export const BUN_TO_H = 21;
/** The loudspeaker repeats the call this often while he walks. */
export const BUN_CALL_MS = 8_000;
/** At most this many come down to buy. */
export const BUN_MAX_BUYERS = 3;

/** The bike rides just ahead of him (he pushes it by the rear rack). */
const BIKE_DX = 32;
/**
 * He walks the same line as the lottery seller and stops just east of the lamp post at x = 4 tiles, the bike ahead of
 * him clear of the tea stall's stacked stools, the buyers lining up west of him (between the zebra crossing's sign and
 * the lamp post): at the foot of the path the sign would hide him or his steamer box.
 */
const STOP = { x: 4 * TILE + 7, y: LOTTERY_STOPS.path.y } as const;

/** Where a buyer from the office stands (feet, px): beside him, the first one closest. */
export function bunBuyerSpot(i: number): { x: number; y: number } {
  return { x: STOP.x - 14 - i * 11, y: STOP.y - 3 };
}

export function bunTime(hour: number): boolean {
  return hour >= BUN_FROM_H && hour < BUN_TO_H;
}

/** In from the west end to the foot of the path, and on past the east end. */
export function bunRoute(fromX: number, toX: number): { in: number[]; out: number[] } {
  return { in: [fromX, STOP.y, STOP.x, STOP.y], out: [toX, STOP.y] };
}

/** Where the bike is drawn (bottom center, px): just ahead of him. */
export function bunBikeAt(seller: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(seller.x + BIKE_DX), y: Math.round(seller.y + 1) };
}

export function bunBikeProps(bike: { x: number; y: number } | null): readonly ExteriorProp[] {
  return bike ? [{ kind: 'bun_bike', x: bike.x, y: bike.y, seed: 0 }] : [];
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** The loudspeaker. */
export function bunCall(rng: () => number): string {
  return pick(rng, [tr('Hot bánh bao here… 📢'), tr('Bánh bao, piping hot! Pork and quail egg 📢'), tr('Steamed buns for the night owls! 📢')]);
}

export function bunOrder(rng: () => number): string {
  return pick(rng, [tr('One bánh bao, please! 🥟'), tr('Two with the egg inside, please 🥟'), tr('Perfect for a late night of coding 🥟')]);
}

export function bunThanks(rng: () => number): string {
  return pick(rng, [tr("Here you go, careful, it's hot! 🔥"), tr("Thank you! Don't stay up too late 🌙")]);
}
