// Lamp posts on both sidewalks: the far side's stand clear of what's already there.
import { describe, expect, it } from 'vitest';
import { TILE } from '../constants';
import { BUS_PARK, BUS_SIGN, BUS_STOP_X } from '../sim/bus';
import { DANCE_SPEAKER } from '../sim/danvu';
import { CROSSWALK, farLampXs, inPond, layoutExterior, POND } from './exterior';

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

describe('o lago do parque', () => {
  const props = layoutExterior(3).props;
  it('existe um só, e nenhuma árvore ou arbusto cresce dentro dele nem encostado na borda', () => {
    expect(props.filter((p) => p.kind === 'pond')).toHaveLength(1);
    for (const p of props) if (p.kind === 'tree' || p.kind === 'pine' || p.kind === 'bush') expect(inPond(p.x, p.y, 20)).toBe(false);
  });
  it('o clique vale na água (elipse) e não fora dela', () => {
    expect(inPond(POND.x, POND.y)).toBe(true);
    expect(inPond(POND.x + POND.rx - 2, POND.y)).toBe(true);
    expect(inPond(POND.x + POND.rx + 2, POND.y)).toBe(false);
    expect(inPond(POND.x, POND.y - POND.ry - 2)).toBe(false);
    expect(inPond(POND.x + POND.rx * 0.9, POND.y + POND.ry * 0.9)).toBe(false);
  });
  it('a árvore do resto do parque não mudou de lugar: o sorteio segue a mesma ordem', () => {
    expect(layoutExterior(3).props.length).toBe(props.length);
    expect(props.filter((p) => p.kind === 'tree').length).toBeGreaterThan(30);
  });
});
