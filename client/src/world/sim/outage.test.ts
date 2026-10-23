import { describe, expect, it } from 'vitest';
import {
  FLASH_MS,
  GENERATOR_DARK,
  GENERATOR_DELAY_MS,
  OUTAGE_DARK,
  OVERLOAD_CHANCE,
  OVERLOAD_COOLDOWN_MS,
  OVERLOAD_HOLD_MS,
  OVERLOAD_WORKERS,
  SCHEDULE_FROM,
  SCHEDULE_MAX,
  SCHEDULE_MIN,
  SCHEDULE_TO,
  STRIKE_CUT_MAX_MS,
  STRIKE_CUT_MIN_MS,
  approachLevel,
  cutClock,
  flashLevel,
  generatorOn,
  noticeUp,
  outageLevel,
  overloadTrips,
  scheduledCut,
  stormStrike,
  type Outage,
} from './outage';

const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(2026, 0, 1 + i));

describe('cúp điện theo lịch', () => {
  it('about 1–2 days a week, a 3–8 minute window between 9:00 and 16:00, the same all day', () => {
    const cuts = days(364).map(scheduledCut).filter((c) => c !== null);
    const perWeek = cuts.length / 52;
    expect(perWeek).toBeGreaterThan(0.8);
    expect(perWeek).toBeLessThan(2.2);
    for (const c of cuts) {
      expect(c.start).toBeGreaterThanOrEqual(SCHEDULE_FROM);
      expect(c.start).toBeLessThan(SCHEDULE_TO);
      const min = Math.round((c.end - c.start) * 60);
      expect(min).toBeGreaterThanOrEqual(SCHEDULE_MIN);
      expect(min).toBeLessThanOrEqual(SCHEDULE_MAX);
    }
    const d = cuts.length ? days(364).find((x) => scheduledCut(x))! : new Date(2026, 0, 1);
    expect(scheduledCut(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59))).toEqual(scheduledCut(d));
  });

  it('the notice is up from the morning until the cut ends; the clock reads like a notice', () => {
    const cut = { start: 14 + 5 / 60, end: 14 + 10 / 60 };
    expect(noticeUp(cut, 6.5)).toBe(false);
    expect(noticeUp(cut, 8)).toBe(true);
    expect(noticeUp(cut, 14.1)).toBe(true);
    expect(noticeUp(cut, 14.2)).toBe(false);
    expect(noticeUp(null, 10)).toBe(false);
    expect(cutClock(cut.start)).toBe('14:05');
    expect(cutClock(9)).toBe('9:00');
  });

  it('dark at first, the generator brings a low level back after a while', () => {
    const o: Outage = { cause: 'schedule', start: 1000, until: 1000 + 300_000, fixer: null };
    expect(outageLevel(o, 1000)).toBe(OUTAGE_DARK);
    expect(generatorOn(o, 1000 + GENERATOR_DELAY_MS - 1)).toBe(false);
    expect(generatorOn(o, 1000 + GENERATOR_DELAY_MS)).toBe(true);
    expect(outageLevel(o, 1000 + GENERATOR_DELAY_MS)).toBe(GENERATOR_DARK);
    expect(GENERATOR_DARK).toBeLessThan(OUTAGE_DARK);
    // no generator for the other causes, and no darkness without an outage
    expect(outageLevel({ ...o, cause: 'overload' }, 1000 + GENERATOR_DELAY_MS)).toBe(OUTAGE_DARK);
    expect(generatorOn({ ...o, cause: 'storm' }, 1e9)).toBe(false);
    expect(outageLevel(null, 0)).toBe(0);
  });
});

describe('quá tải', () => {
  it('needs enough workers, for long enough, past the cooldown, and a bit of luck', () => {
    const ok = [OVERLOAD_WORKERS, OVERLOAD_HOLD_MS, OVERLOAD_COOLDOWN_MS, 0] as const;
    expect(overloadTrips(...ok)).toBe(true);
    expect(overloadTrips(OVERLOAD_WORKERS - 1, ok[1], ok[2], 0)).toBe(false);
    expect(overloadTrips(ok[0], OVERLOAD_HOLD_MS - 1, ok[2], 0)).toBe(false);
    expect(overloadTrips(ok[0], ok[1], OVERLOAD_COOLDOWN_MS - 1, 0)).toBe(false);
    expect(overloadTrips(ok[0], ok[1], ok[2], OVERLOAD_CHANCE)).toBe(false);
  });
});

describe('mưa giông', () => {
  it('at most one strike an hour, deterministic; some take the power for 15–60 s', () => {
    let strikes = 0;
    let cuts = 0;
    for (const d of days(60)) {
      for (let h = 0; h < 24; h++) {
        const s = stormStrike(d, h + 0.5);
        expect(s).toEqual(stormStrike(d, h));
        if (!s) continue;
        strikes++;
        expect(s.minute).toBeGreaterThanOrEqual(0);
        expect(s.minute).toBeLessThan(60);
        if (s.cutMs) {
          cuts++;
          expect(s.cutMs).toBeGreaterThanOrEqual(STRIKE_CUT_MIN_MS);
          expect(s.cutMs).toBeLessThanOrEqual(STRIKE_CUT_MAX_MS);
        }
      }
    }
    // a few a day, some of them cutting the power
    expect(strikes / 60).toBeGreaterThan(4);
    expect(strikes / 60).toBeLessThan(11);
    expect(cuts).toBeGreaterThan(strikes * 0.25);
    expect(cuts).toBeLessThan(strikes * 0.7);
  });

  it('the flash: bright, a dip, a flicker, then nothing', () => {
    expect(flashLevel(-1)).toBe(0);
    expect(flashLevel(0)).toBe(1);
    expect(flashLevel(150)).toBeLessThan(0.3);
    expect(flashLevel(240)).toBeGreaterThan(0.5);
    expect(flashLevel(FLASH_MS)).toBe(0);
  });
});

describe('the light level', () => {
  it('snaps off fast, comes back more gently, and lands exactly', () => {
    let down = 0;
    for (let i = 0; i < 6; i++) down = approachLevel(down, 1, 1 / 30);
    let up = 1;
    for (let i = 0; i < 6; i++) up = approachLevel(up, 0, 1 / 30);
    expect(down).toBeGreaterThan(0.85);
    expect(1 - up).toBeLessThan(down);
    let x = 0.5;
    for (let i = 0; i < 300; i++) x = approachLevel(x, 0, 1 / 30);
    expect(x).toBe(0);
  });
});
