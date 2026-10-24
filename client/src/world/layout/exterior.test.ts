// Lamp posts on both sidewalks: the far side's stand clear of what's already there.
import { describe, expect, it } from 'vitest';
import { TILE } from '../constants';
import { BUS_PARK, BUS_SIGN, BUS_STOP_X } from '../sim/bus';
import { DANCE_SPEAKER } from '../sim/danvu';
import { CROSSWALK, farLampXs, layoutExterior } from './exterior';

describe('street lamps', () => {
  const lamps = layoutExterior(3).props.filter((p) => p.kind === 'lamp');
  const near = Math.min(...lamps.map((l) => l.y));
  const far = lamps.filter((l) => l.y > near);

  it('both sidewalks have them', () => {
    expect(lamps.some((l) => l.y === near)).toBe(true);
    expect(far.length).toBeGreaterThanOrEqual(3);
  });

  it("the far side's stay clear of the crossing, the dance and the bus stop (with the bus pulling in)", () => {
    const clear = (x: number, a: number, b: number) => x < a || x > b;
    for (const l of far) {
      expect(clear(l.x, CROSSWALK.x - TILE, CROSSWALK.x + CROSSWALK.w + TILE)).toBe(true);
      expect(clear(l.x, DANCE_SPEAKER.x - TILE, 10.5 * TILE)).toBe(true);
      expect(clear(l.x, Math.min(BUS_SIGN.x, BUS_PARK.x) - TILE, BUS_STOP_X + 4 * TILE)).toBe(true);
    }
  });

  it('only up to the east end', () => {
    expect(farLampXs(30).every((x) => x < 30)).toBe(true);
  });
});
