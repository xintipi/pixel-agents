// The evening garbage cart (xe rác): around 19:00 the street sweeper in her orange vest and conical hat pushes the big
// hand cart along the curb, ringing the bell ("keng keng"); she stops by the hủ tiếu cart (the tea stall has packed up
// by then), the hủ tiếu boy runs out with the cart's bag of trash, and she pushes on east. Once a day. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { ExteriorProp } from '../layout/types';
import { TILE } from '../constants';
import { HUTIEU_CART } from './hutieu';
import { LANE_Y } from './tea';

/** She comes by once a day, starting in this window (local, fractional). */
export const TRASH_FROM_H = 19;
export const TRASH_TO_H = 19.5;

/** She pushes the cart along the curb (street edge), like the bánh mì vendor. */
const CURB_Y = 33 * TILE + 5;
/** The cart rides this far ahead of her feet (she pushes it from its west end). */
const CART_DX = 28;

/** Where she stops: east of the hủ tiếu cart and its stools, so the boy can bring out its bag. */
export const TRASH_STOP = { x: HUTIEU_CART.x + 100, y: CURB_Y } as const;

/** Where the hủ tiếu boy hands her the bag: on the sidewalk's edge, right by her (feet, px). */
export const TRASH_HANDOVER = { x: TRASH_STOP.x - 4, y: LANE_Y + 18 } as const;

export function trashTime(hour: number): boolean {
  return hour >= TRASH_FROM_H && hour < TRASH_TO_H;
}

/** In from the west end of the curb to the stop, and on past the east end. */
export function trashRoute(fromX: number, toX: number): { in: number[]; out: number[] } {
  return { in: [fromX, CURB_Y, TRASH_STOP.x, CURB_Y], out: [toX, CURB_Y] };
}

/** Where the cart is drawn (bottom center, px): just ahead of her. */
export function trashCartAt(worker: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(worker.x + CART_DX), y: Math.round(worker.y + 1) };
}

export function trashCartProps(cart: { x: number; y: number } | null): readonly ExteriorProp[] {
  return cart ? [{ kind: 'trash_cart', x: cart.x, y: cart.y, seed: 0 }] : [];
}

/** What she calls out. */
export function trashCall(rng: () => number): string {
  const lines = [tr('Garbage! Bring it out! 🔔'), tr('Trash collection! 🔔')];
  return lines[Math.floor(rng() * lines.length)];
}

/** The hủ tiếu boy, hurrying out with the bag. */
export function trashReply(rng: () => number): string {
  const lines = [tr('Wait, wait, coming! 🗑️'), tr('Here you go, thank you!')];
  return lines[Math.floor(rng() * lines.length)];
}
