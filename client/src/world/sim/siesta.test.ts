// Lunch and siesta windows: lunch flows into the siesta, the lights ramp in and out instead of snapping.
import { describe, expect, it } from 'vitest';
import { LUNCH_END, lunchTime, SIESTA_RAMP_H, SIESTA_START, siestaLevel, siestaTime } from './siesta';

describe('ngủ trưa', () => {
  it('almoço de 11:30 a 12:30, sesta logo em seguida até 13:30', () => {
    expect(lunchTime(11.4)).toBe(false);
    expect(lunchTime(11.5)).toBe(true);
    expect(lunchTime(12.49)).toBe(true);
    expect(lunchTime(12.5)).toBe(false);
    expect(LUNCH_END).toBe(SIESTA_START);
    expect(siestaTime(12.49)).toBe(false);
    expect(siestaTime(12.5)).toBe(true);
    expect(siestaTime(12.75)).toBe(true);
    expect(siestaTime(13.49)).toBe(true);
    expect(siestaTime(13.5)).toBe(false);
    expect(siestaTime(0.75)).toBe(false);
  });

  it('a luz baixa e volta aos poucos (rampa), plena no meio da sesta', () => {
    expect(siestaLevel(12)).toBe(0);
    expect(siestaLevel(12.5)).toBe(0);
    expect(siestaLevel(12.5 + SIESTA_RAMP_H / 2)).toBeCloseTo(0.5);
    expect(siestaLevel(12.75)).toBe(1);
    expect(siestaLevel(13.5 - SIESTA_RAMP_H / 4)).toBeCloseTo(0.25);
    expect(siestaLevel(13.5)).toBe(0);
    for (let h = 12.5; h < 13.5; h += 0.01) {
      const l = siestaLevel(h);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });
});
