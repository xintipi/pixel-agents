// Street traffic: rush hour by the clock, queues that never overlap, the cap, bikes climbing the far sidewalk, horns.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import { REPAIR_SPOT } from './repair';
import { MAX_VEHICLES, Traffic, rushLevel, type StreetDay, type TrafficEnv, type Vehicle } from './traffic';

const ENV: TrafficEnv = {
  x0: -200,
  x1: 1200,
  lanes: [
    { y: 100, dir: 1 },
    { y: 140, dir: -1 },
  ],
  sidewalkY: 151,
};

function run(t: Traffic, seconds: number, start = 0): number {
  let now = start;
  for (let i = 0; i < seconds * 30; i++) {
    now += 1000 / 30;
    t.step(now, 1 / 30, ENV, 12, 3);
  }
  return now;
}

/** Any two vehicles of the same direction in each other's way, overlapping bumpers? */
function overlaps(vs: readonly Vehicle[]): boolean {
  const half = (v: Vehicle) => (v.kind === 'car' ? 29 : 13);
  return vs.some((a, i) =>
    vs.some((b, j) => j > i && a.dir === b.dir && a.y === a.ty && b.y === b.ty && Math.abs(a.y - b.y) < (a.kind === 'car' || b.kind === 'car' ? 10 : 7) && Math.abs(a.x - b.x) < half(a) + half(b) - 1),
  );
}

/** Broken-down cars blocking a whole lane at `x` (bikes squeeze past a single one). */
function roadblock(t: Traffic, x: number, laneY: number, dir: 1 | -1): Vehicle[] {
  const cars = [laneY, laneY - 12].map((y): Vehicle => ({ kind: 'car', x, y, dir, speed: 0, want: 0, laneY, ty: y, variant: 0, riders: 1, stuck: 0, sidewalk: 0 }));
  t.vehicles = t.vehicles.filter((v) => v.dir !== dir || Math.abs(v.x - x) > 40);
  t.vehicles.push(...cars);
  return cars;
}

describe('street traffic', () => {
  it('is busy at rush hour on weekdays and quiet at night and on weekends', () => {
    expect(rushLevel(3, 2)).toBe(0);
    expect(rushLevel(7.75, 2)).toBe(1);
    expect(rushLevel(18, 4)).toBe(1);
    expect(rushLevel(12, 4)).toBe(0);
    expect(rushLevel(6.75, 1)).toBeGreaterThan(0);
    expect(rushLevel(6.75, 1)).toBeLessThan(1);
    expect(rushLevel(7.75, 0)).toBeLessThan(0.5);
  });

  it('fills up at rush hour, never past the cap, and is light otherwise', () => {
    const rush = new Traffic(mulberry32(1));
    rush.forced = true;
    run(rush, 60);
    expect(rush.vehicles.length).toBeGreaterThan(20);
    expect(rush.vehicles.length).toBeLessThanOrEqual(MAX_VEHICLES);
    expect(rush.vehicles.filter((v) => v.kind === 'bike').length).toBeGreaterThan(rush.vehicles.length / 2);
    const quiet = new Traffic(mulberry32(1));
    quiet.forced = false;
    run(quiet, 60);
    expect(quiet.vehicles.length).toBeLessThan(10);
  });

  it('queues up behind a stopped vehicle without overlapping, and leaves the road at the far end', () => {
    const t = new Traffic(mulberry32(2));
    t.forced = true;
    let now = run(t, 20);
    // broken-down cars blocking the whole eastbound lane mid-street
    const wreck = roadblock(t, 500, 100, 1);
    for (let i = 0; i < 40; i++) {
      now = run(t, 1, now);
      for (const w of wreck) w.x = 500;
      expect(overlaps(t.vehicles)).toBe(false);
    }
    expect(t.vehicles.filter((v) => v.dir > 0 && v.x < 500 && v.speed < 5).length).toBeGreaterThan(3);
    t.vehicles = t.vehicles.filter((v) => !wreck.includes(v));
    t.forced = false;
    run(t, 60, now);
    expect(t.vehicles.every((v) => v.x >= ENV.x0 - 20 && v.x <= ENV.x1 + 20)).toBe(true);
  });

  it('jammed westbound bikes take the far sidewalk; eastbound ones never do', () => {
    const t = new Traffic(mulberry32(3));
    t.forced = true;
    const wreck = roadblock(t, 300, 140, -1);
    let walked = false;
    let now = 0;
    for (let i = 0; i < 90 && !walked; i++) {
      now = run(t, 1, now);
      for (const w of wreck) w.x = 300;
      walked = t.vehicles.some((v) => v.dir < 0 && v.y >= ENV.sidewalkY);
      expect(t.vehicles.some((v) => v.dir > 0 && v.y > 110)).toBe(false);
    }
    expect(walked).toBe(true);
  });

  it('lets bikes squeeze past a car stopped in the lane', () => {
    const t = new Traffic(mulberry32(5));
    t.forced = true;
    const car: Vehicle = { kind: 'car', x: 600, y: 100, dir: 1, speed: 0, want: 0, laneY: 100, ty: 100, variant: 0, riders: 1, stuck: 0, sidewalk: 0 };
    t.vehicles.push(car);
    let now = 0;
    for (let i = 0; i < 40; i++) {
      now = run(t, 1, now);
      car.x = 600;
    }
    expect(t.vehicles.some((v) => v.kind === 'bike' && v.dir > 0 && v.x > 700)).toBe(true);
  });

  it('floods with rain at rush hour, slows everyone down, stalls some bikes, and drains afterwards', () => {
    const t = new Traffic(mulberry32(6));
    let now = 0;
    const step = (minutes: number, hour: number, rain: boolean) => {
      for (let i = 0; i < minutes * 60 * 10; i++) t.step((now += 100), 0.1, ENV, hour, 3, rain);
    };
    step(15, 12, true);
    expect(t.flood).toBe(0);
    step(5, 17.5, true);
    expect(t.flood).toBeGreaterThan(0.4);
    expect(t.flood).toBeLessThan(0.6);
    step(10, 17.5, true);
    expect(t.flood).toBe(1);
    expect(t.vehicles.some((v) => v.pushing)).toBe(true);
    expect(Math.max(...t.vehicles.filter((v) => !v.pushing && v.y < ENV.sidewalkY).map((v) => v.speed))).toBeLessThan(40);
    step(10, 19.5, false);
    expect(t.flood).toBeGreaterThan(0.4);
    step(15, 19.5, false);
    expect(t.flood).toBe(0);
    expect(t.vehicles.some((v) => v.pushing)).toBe(false);
  });

  it('carries peach branches before Tết and empties the street on its first days', () => {
    const count = (street: StreetDay) => {
      const t = new Traffic(mulberry32(8));
      let now = 0;
      let peach = 0;
      const seen = new Set<Vehicle>();
      for (let i = 0; i < 30 * 600; i++) {
        t.step((now += 100), 0.1, ENV, 12, 3, false, street);
        for (const v of t.vehicles) if (!seen.has(v)) seen.add(v), (peach += v.cargo === 'peach' ? 1 : 0);
      }
      return { all: seen.size, peach };
    };
    const normal = count({});
    const before = count({ tet: 'before' });
    const holiday = count({ tet: 'holiday' });
    expect(normal.peach).toBe(0);
    expect(before.peach).toBeGreaterThan(before.all * 0.05);
    expect(holiday.all).toBeLessThan(normal.all / 2);
    expect(holiday.peach).toBeGreaterThan(0);
  });

  it("rides an agent's bike in to park, keeps it there and rides it off later", () => {
    const t = new Traffic(mulberry32(9));
    t.forced = true;
    let now = 0;
    const park = { x: 300, y: 75 };
    t.arrive('ana', park, ENV);
    for (let i = 0; i < 60 * 30 && !t.parked.length; i++) t.step((now += 33), 1 / 30, ENV, 12, 3);
    expect(t.parked).toEqual(['ana']);
    const bike = t.vehicles.find((v) => v.owner === 'ana')!;
    expect(bike).toMatchObject({ x: 300, y: 75, phase: 'parked', speed: 0 });
    now = run(t, 30, now);
    expect(bike).toMatchObject({ x: 300, y: 75, phase: 'parked' });
    expect(t.horns.some((h) => h.x === 300 && h.y === 75)).toBe(false);
    t.depart('ana');
    run(t, 90, now);
    expect(t.vehicles.includes(bike)).toBe(false);
  });

  it('an eastbound bike gets a flat now and then: pushed to the repair stall, fixed there, ridden off', () => {
    // the real street (exterior.ts) below the stall: the eastbound lane right under the near sidewalk
    const env: TrafficEnv = { x0: -360, x1: 1400, lanes: [{ y: REPAIR_SPOT.y + 31, dir: 1 }, { y: REPAIR_SPOT.y + 71, dir: -1 }], sidewalkY: REPAIR_SPOT.y + 82 };
    const t = new Traffic(mulberry32(10));
    let now = 0;
    const step = (s: number, hour = 10) => {
      for (let i = 0; i < s * 30; i++) t.step((now += 33), 1 / 30, env, hour, 3);
    };
    for (let i = 0; i < 240 && !t.vehicles.some((v) => v.repair); i++) step(1);
    const bike = t.vehicles.find((v) => v.repair);
    expect(bike).toBeDefined();
    for (let i = 0; i < 120 && bike!.phase !== 'repair'; i++) step(1);
    expect(bike).toMatchObject({ phase: 'repair', x: REPAIR_SPOT.x, y: REPAIR_SPOT.y, pushing: true, speed: 0 });
    expect(t.repairing).toBe(true);
    step(60);
    expect(t.repairing).toBe(false);
    expect(bike!.pushing).toBe(false);
    step(60);
    expect(t.vehicles.includes(bike!)).toBe(false);
    // closed after 18:30: no flats
    const night = new Traffic(mulberry32(10));
    for (let i = 0; i < 400 * 30; i++) night.step((now += 33), 1 / 30, env, 21, 3);
    expect(night.vehicles.some((v) => v.repair)).toBe(false);
  });

  it('honks in the jam, and drops horns nobody listened to', () => {
    const t = new Traffic(mulberry32(4));
    t.forced = true;
    let now = run(t, 30);
    let heard = 0;
    for (let i = 0; i < 30; i++) {
      now = run(t, 1, now);
      heard += t.horns.length;
      t.horns.length = 0;
    }
    expect(heard).toBeGreaterThan(0);
    run(t, 30, now);
    expect(t.horns.length).toBeLessThanOrEqual(8);
  });
});
