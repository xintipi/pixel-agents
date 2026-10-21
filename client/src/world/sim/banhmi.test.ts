// Morning bánh mì cart: opening hours, the cart riding with the vendor, where it parks, and what customers buy.
import { describe, expect, it } from 'vitest';
import { TILE } from '../constants';
import {
  BANHMI_CART,
  BANHMI_SPOTS,
  BANHMI_VENDOR_SPOT,
  banhmiCartProps,
  banhmiOpen,
  cartAt,
  pickOrder,
  vendorRouteIn,
  vendorRouteOut,
} from './banhmi';
import { TEA_TABLE, routeToSeat } from './tea';

describe('bánh mì cart', () => {
  it('sells only in the morning', () => {
    expect(banhmiOpen(6)).toBe(false);
    expect(banhmiOpen(6.5)).toBe(true);
    expect(banhmiOpen(8)).toBe(true);
    expect(banhmiOpen(9.5)).toBe(false);
    expect(banhmiOpen(12)).toBe(false);
  });

  it('parks where the vendor stops, east of the tea stall and clear of it', () => {
    const route = vendorRouteIn(-19 * TILE);
    const end = { x: route[route.length - 2], y: route[route.length - 1] };
    expect(end).toEqual({ x: BANHMI_VENDOR_SPOT.x, y: BANHMI_VENDOR_SPOT.y });
    expect(cartAt(end)).toEqual({ x: BANHMI_CART.x, y: BANHMI_CART.y });
    // the stall spans about 50 px west to 40 px east of its table; the cart (and the vendor's handle) start well after
    expect(BANHMI_VENDOR_SPOT.x - 8).toBeGreaterThan(TEA_TABLE.x + 40);
    // leaves going on east from where it parked (no turning around)
    const out = vendorRouteOut(60 * TILE);
    expect(out[0]).toBe(BANHMI_VENDOR_SPOT.x);
    expect(out[out.length - 2]).toBeGreaterThan(BANHMI_VENDOR_SPOT.x);
  });

  it('customers walk out to a spot at the east end of the cart, facing it, not hidden behind it', () => {
    expect(BANHMI_SPOTS).toHaveLength(2);
    for (const s of BANHMI_SPOTS) {
      const r = routeToSeat(s);
      expect(r.slice(-2)).toEqual([s.x, s.y]);
      expect(s.dir).toBe('left');
      // past the cart's right edge (the sprite is ~21 px each side of its center), but close by
      expect(s.x - BANHMI_CART.x).toBeGreaterThan(24);
      expect(s.x - BANHMI_CART.x).toBeLessThan(48);
    }
  });

  it('shows the cart only while the vendor is around', () => {
    expect(banhmiCartProps(null)).toEqual([]);
    expect(banhmiCartProps({ x: 10, y: 20 }).map((p) => p.kind)).toEqual(['banhmi_cart']);
  });

  it('mostly bánh mì, sometimes xôi', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const held = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      const o = pickOrder(rng);
      expect(o.line.length).toBeGreaterThan(0);
      held.set(o.held, (held.get(o.held) ?? 0) + 1);
    }
    expect([...held.keys()].sort()).toEqual(['banhmi', 'xoi']);
    expect(held.get('banhmi')!).toBeGreaterThan(held.get('xoi')!);
  });
});
