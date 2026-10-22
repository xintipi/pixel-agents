// Lottery ticket seller (bán vé số dạo): through the day she walks the sidewalk in front of the building with her stack
// of tickets, stops at the foot of the stone path calling out (idle agents come down to buy one) and at the iced tea
// stall (customers buy from their stools), and walks on. At 16:15 the afternoon draw is read on the radio: whoever
// bought a ticket today checks it, a lucky few win. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import { LANE_Y, TEA_TABLE } from './tea';

/** She makes her rounds between these hours (local, fractional). */
export const LOTTERY_FROM_H = 8;
export const LOTTERY_TO_H = 17.5;
/** The afternoon draw (xổ số miền Nam, 16:15). */
export const DRAW_H = 16.25;
/** Minutes between two rounds. */
export const ROUND_GAP_MIN: readonly [number, number] = [25, 45];
/** Share of the ticket holders who win something. */
export const WIN_CHANCE = 0.15;

/** She walks along the sidewalk, a bit below the walking lane (like the tea seller). */
const WALK_Y = LANE_Y + 14;

/** Where she stops: at the foot of the stone path (calling the office) and in front of the tea stall. */
export const LOTTERY_STOPS = {
  path: { x: -6, y: WALK_Y },
  tea: { x: TEA_TABLE.x - 30, y: WALK_Y },
} as const;

export function lotteryOpen(hour: number): boolean {
  return hour >= LOTTERY_FROM_H && hour < LOTTERY_TO_H;
}

/** Where a buyer from the office stands to buy (feet, px): beside her, the first one closest. */
export function buyerSpot(i: number): { x: number; y: number } {
  return { x: LOTTERY_STOPS.path.x - 14 - i * 11, y: WALK_Y - 3 };
}

/** One round west to east: in from the west end, the two stops, out past the east end. Flat x,y px pairs per leg. */
export function roundLegs(fromX: number, toX: number): { toPath: number[]; toTea: number[]; out: number[] } {
  const { path, tea } = LOTTERY_STOPS;
  return { toPath: [fromX, WALK_Y, path.x, path.y], toTea: [tea.x, tea.y], out: [toX, WALK_Y] };
}

/** Does a ticket win in the afternoon draw? (each holder on their own luck) */
export function wins(rng: () => number): boolean {
  return rng() < WIN_CHANCE;
}

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** What she calls out. */
export function sellerCall(rng: () => number): string {
  return pick(rng, [tr('Lottery tickets! Buy one for luck 🎫'), tr("Today's draw, this afternoon! 🍀"), tr('Buy one from me, today is your lucky day 🎫')]);
}

export function buyerLine(rng: () => number): string {
  return pick(rng, [tr('Two tickets, please'), tr('One ending in 68, please 🍀'), tr("I'll take one, for luck")]);
}

export function sellerThanks(rng: () => number): string {
  return pick(rng, [tr('Thank you, good luck! 🍀'), tr('May you win the jackpot! 💰')]);
}

export function winLine(rng: () => number): string {
  return pick(rng, [tr('I WON!!! 🎉'), tr('Won a small prize! 💸'), tr('My ticket won! Drinks on me 🧋')]);
}

export function loseLine(rng: () => number): string {
  return pick(rng, [tr('Missed again 😩'), tr('Not even close 🥲'), tr("I'll buy another tomorrow")]);
}
