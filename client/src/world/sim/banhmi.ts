// Morning bánh mì cart (xe bánh mì) on the sidewalk in front of the building: the vendor pushes it in along the curb at
// opening, parks east of the iced tea stall and pushes it off at closing. Idle agents walk out the same way as for the
// tea (corridor glass gap, stone path, sidewalk: a fixed px route), order at the cart, carry a bánh mì or a pack of xôi
// back to the desk and eat it there. Pure (no DOM).
import { tr } from '../../../../shared/i18n';
import type { Dir, HeldItem } from '../../art/api';
import { TILE } from '../constants';
import type { ExteriorProp } from '../layout/types';
import { LANE_Y } from './tea';

/** Opening hours (local, fractional): the breakfast rush only; before and after, the cart is gone. */
export const BANHMI_OPEN_H = 6.5;
export const BANHMI_CLOSE_H = 9.5;

/** Parked cart: bottom center (px), on the sidewalk between the lamp posts east of the tea stall. */
export const BANHMI_CART = { x: 19 * TILE, y: 32 * TILE + 12 } as const;

/** The cart rides this far right of the vendor's feet (he pushes it with the handle on its west end). */
const CART_DX = 20;
const CART_DY = 1;

/** Where the vendor stands while parked: at the handle (west end), facing the cart. */
export const BANHMI_VENDOR_SPOT: { x: number; y: number; dir: Dir } = { x: BANHMI_CART.x - CART_DX, y: BANHMI_CART.y - CART_DY, dir: 'right' };

/** The vendor walks along the curb (street edge), below the tea stall. */
const CURB_Y = 33 * TILE + 5;

export interface CartSpot {
  /** Feet of the customer (px). */
  x: number;
  y: number;
  dir: Dir;
}

/**
 * Customer spots: at the cart's east end (the vendor is at the west one), staggered so the awning hides neither (behind
 * the case only their heads would show). At most two people at the cart at a time.
 */
export const BANHMI_SPOTS: readonly CartSpot[] = [
  { x: BANHMI_CART.x + 28, y: BANHMI_CART.y - 1, dir: 'left' },
  { x: BANHMI_CART.x + 38, y: BANHMI_CART.y - 11, dir: 'left' },
];

export function banhmiOpen(hour: number): boolean {
  return hour >= BANHMI_OPEN_H && hour < BANHMI_CLOSE_H;
}

/** The vendor pushes the cart in from the west end of the curb and steps up onto the sidewalk at the parking spot. */
export function vendorRouteIn(fromX: number): number[] {
  const v = BANHMI_VENDOR_SPOT;
  return [fromX, CURB_Y, v.x, CURB_Y, v.x, v.y];
}

/** ...and at closing goes on east (no turning around with the cart). */
export function vendorRouteOut(toX: number): number[] {
  return [BANHMI_VENDOR_SPOT.x, CURB_Y, toX, CURB_Y];
}

/** Where the cart is drawn (bottom center, px) for the vendor's feet: always just ahead of him. */
export function cartAt(vendor: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(vendor.x + CART_DX), y: Math.round(vendor.y + CART_DY) };
}

/** What shows on the sidewalk: the cart next to the vendor, or nothing while he's away. */
export function banhmiCartProps(cart: { x: number; y: number } | null): ExteriorProp[] {
  return cart ? [{ kind: 'banhmi_cart', x: cart.x, y: cart.y, seed: 0 }] : [];
}

/** What a customer buys: mostly bánh mì, sometimes a pack of xôi; with the line they order it with. */
export function pickOrder(rng: () => number): { held: HeldItem; line: string } {
  if (rng() < 0.3) {
    const lines = [tr('A pack of xôi, please! 🍙'), tr('Xôi with shredded chicken, please 🍙')];
    return { held: 'xoi', line: lines[Math.floor(rng() * lines.length)] };
  }
  const lines = [
    tr('One bánh mì with everything! 🥖'),
    tr('Bánh mì, extra pâté please 🥖'),
    tr('Bánh mì, no chili for me 🥖'),
    tr('Two bánh mì, one is for my teammate 🥖'),
  ];
  return { held: 'banhmi', line: lines[Math.floor(rng() * lines.length)] };
}

/** The vendor handing it over. */
export function vendorReply(rng: () => number): string {
  const lines = [tr('Here you go, still warm! 🔥'), tr('Coming right up! 🥖'), tr('Thanks, see you tomorrow! 👋')];
  return lines[Math.floor(rng() * lines.length)];
}

/** The vendor calling out to passers-by. */
export function vendorLine(rng: () => number): string {
  const lines = [tr('Hot bánh mì here! 🥖'), tr('Bánh mì, xôi, fresh this morning! 🍙'), tr('Breakfast before work? 🌅')];
  return lines[Math.floor(rng() * lines.length)];
}
