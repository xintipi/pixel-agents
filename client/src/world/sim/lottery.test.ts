// Lottery seller: when she's out, where she stops and where buyers stand, the odds of the afternoon draw.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import { LOTTERY_STOPS, WIN_CHANCE, buyerSpot, lotteryOpen, roundLegs, wins } from './lottery';
import { TEA_TABLE } from './tea';

describe('lottery seller', () => {
  it('makes her rounds through the working day only', () => {
    expect(lotteryOpen(7.5)).toBe(false);
    expect(lotteryOpen(8)).toBe(true);
    expect(lotteryOpen(16.25)).toBe(true);
    expect(lotteryOpen(17.5)).toBe(false);
  });

  it('walks west to east: the path first, then the tea stall, then out past the east end', () => {
    const legs = roundLegs(-300, 900);
    expect(legs.toPath.slice(-2)).toEqual([LOTTERY_STOPS.path.x, LOTTERY_STOPS.path.y]);
    expect(LOTTERY_STOPS.tea.x).toBeGreaterThan(LOTTERY_STOPS.path.x);
    expect(LOTTERY_STOPS.tea.x).toBeLessThan(TEA_TABLE.x);
    expect(legs.out[0]).toBe(900);
  });

  it('buyers line up beside her, west of her, without stepping on each other', () => {
    const a = buyerSpot(0);
    const b = buyerSpot(1);
    expect(a.x).toBeLessThan(LOTTERY_STOPS.path.x);
    expect(b.x).toBeLessThan(a.x - 8);
  });

  it('a few tickets win', () => {
    const rng = mulberry32(3);
    let n = 0;
    for (let i = 0; i < 4000; i++) if (wins(rng)) n++;
    expect(n / 4000).toBeGreaterThan(WIN_CHANCE - 0.03);
    expect(n / 4000).toBeLessThan(WIN_CHANCE + 0.03);
  });
});
