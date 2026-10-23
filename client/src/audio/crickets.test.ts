// Night crickets: the night curve, the volume under the music and the chirp schedule (the WebAudio side needs a browser).
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../shared/hash';
import { ambientAt } from '../world/render/daylight';
import { chirpLength, cricketGain, cricketLevel, makeCricket, planChirps } from './crickets';
import { musicGain } from './lofi';

const levelAt = (hour: number) => cricketLevel(ambientAt(hour).night);

describe('crickets', () => {
  it('sing only at night, fading in at dusk and out at dawn', () => {
    expect(cricketLevel(0)).toBe(0);
    expect(cricketLevel(0.6)).toBe(0);
    expect(cricketLevel(1)).toBe(1);
    expect(cricketLevel(Number.NaN)).toBe(0);
    for (let n = 0; n < 1; n += 0.05) expect(cricketLevel(n + 0.05)).toBeGreaterThanOrEqual(cricketLevel(n));
    // by the world clock
    expect(levelAt(12)).toBe(0);
    expect(levelAt(18)).toBe(0);
    expect(levelAt(19)).toBeGreaterThan(0.2);
    expect(levelAt(19)).toBeLessThan(1);
    expect(levelAt(21)).toBe(1);
    expect(levelAt(2)).toBe(1);
    expect(levelAt(5.5)).toBeGreaterThan(0);
    expect(levelAt(5.5)).toBeLessThan(levelAt(5.2));
    expect(levelAt(6.2)).toBe(0);
  });

  it('follow the music volume and stay well under the music', () => {
    expect(cricketGain(0, 1)).toBe(0);
    expect(cricketGain(0.8, 0)).toBe(0);
    expect(cricketGain(0.8, 1)).toBeGreaterThan(cricketGain(0.4, 1));
    expect(cricketGain(0.8, 0.5)).toBeCloseTo(cricketGain(0.8, 1) / 2);
    for (const v of [0.1, 0.4, 1]) {
      expect(cricketGain(v, 1)).toBeGreaterThan(0);
      expect(cricketGain(v, 1)).toBeLessThan(musicGain(v) * 0.25);
    }
  });

  it('make crickets with a high, short chirp', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      const c = makeCricket(rng);
      expect(c.freq).toBeGreaterThanOrEqual(4000);
      expect(c.freq).toBeLessThanOrEqual(5200);
      expect(Math.abs(c.pan)).toBeLessThanOrEqual(0.6);
      expect(c.pulses).toBeGreaterThanOrEqual(2);
      expect(c.pulses).toBeLessThanOrEqual(4);
      expect(chirpLength(c)).toBeLessThan(c.period);
    }
  });

  it('plan the chirps in consecutive windows, without gaps or doubles, with rests between phrases', () => {
    const rng = mulberry32(7);
    const c = makeCricket(rng);
    const all: number[] = [];
    // ticks every half second writing two seconds ahead, as the player does
    for (let t = 0; t < 120; t += 0.5) {
      const got = planChirps(c, t + 0.05, t + 2, rng);
      for (const at of got) {
        expect(at).toBeGreaterThanOrEqual(t + 0.05);
        expect(at).toBeLessThan(t + 2);
      }
      all.push(...got);
    }
    expect(all.length).toBeGreaterThan(60);
    let rests = 0;
    for (let i = 1; i < all.length; i++) {
      const gap = all[i] - all[i - 1];
      expect(gap).toBeGreaterThanOrEqual(c.period * 0.9);
      // chirps never overlap
      expect(gap).toBeGreaterThan(chirpLength(c));
      if (gap > c.period * 1.5 + 1) rests++;
    }
    expect(rests).toBeGreaterThan(2);
  });

  it('start a fresh phrase after a pause instead of catching up', () => {
    const rng = mulberry32(3);
    const c = makeCricket(rng);
    planChirps(c, 0, 2, rng);
    const got = planChirps(c, 100, 102, rng);
    expect(got.every((at) => at >= 100)).toBe(true);
    expect(got.length).toBeLessThan(6);
  });
});
