// City bus and its stop across the street: the timetable, the bus pulling over and holding up the cars behind it, and
// in the simulation the people waiting, getting on and off, and the one running late.
import { describe, expect, it } from 'vitest';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { STREET_H, STREET_Y } from '../layout/exterior';
import { BUS_DOOR, BUS_DWELL_MS, BUS_HOLD_MAX_MS, BUS_PARK, BUS_SPOTS, busGapMs, busRuns, type BusAt } from './bus';
import { BUS_RIDER_ID } from './busstop';
import { Sim } from './sim';
import { Traffic, type TrafficEnv, type Vehicle } from './traffic';

const env: TrafficEnv = { x0: -400, x1: 1200, lanes: [{ y: STREET_Y + 29, dir: 1 }, { y: STREET_Y + 69, dir: -1 }], sidewalkY: STREET_Y + STREET_H };

function seeded(seed = 0.37): () => number {
  let r = seed;
  return () => (r = ((r * 9301 + 49297) % 233280) / 233280);
}

describe('the bus timetable', () => {
  it('runs from 5:30 to 21:00, every 15–20 minutes, more often at rush hour', () => {
    expect(busRuns(5.4)).toBe(false);
    expect(busRuns(5.5)).toBe(true);
    expect(busRuns(20.9)).toBe(true);
    expect(busRuns(21)).toBe(false);
    const rng = seeded();
    for (let i = 0; i < 20; i++) {
      const quiet = busGapMs(0, rng);
      expect(quiet).toBeGreaterThanOrEqual(15 * 60_000);
      expect(quiet).toBeLessThanOrEqual(20 * 60_000);
      expect(busGapMs(1, rng)).toBeLessThan(11 * 60_000);
    }
  });

  it('comes on its own in service hours, never at night', () => {
    for (const [hour, want] of [
      [10, true],
      [23, false],
    ] as const) {
      const t = new Traffic(seeded());
      t.forced = false;
      let now = 1_000;
      let seen = false;
      for (let i = 0; i < 25 * 60 * 10 && !seen; i++) {
        now += 100;
        t.step(now, 0.1, env, hour, 3);
        seen = t.vehicles.some((v) => v.bus);
      }
      expect(seen).toBe(want);
    }
  });
});

describe('the bus on the street', () => {
  /** A quiet street at 10:00 and a bus sent right now. */
  function street(): { t: Traffic; bus: () => Vehicle | undefined; run: (s: number, until?: (now: number) => boolean) => number } {
    const t = new Traffic(seeded());
    t.forced = false;
    let now = 1_000;
    t.busNow = true;
    const run = (s: number, until?: (now: number) => boolean) => {
      for (let i = 0; i < s * 30; i++) {
        now += 1000 / 30;
        t.step(now, 1 / 30, env, 10, 3);
        if (until?.(now)) break;
      }
      return now;
    };
    return { t, bus: () => t.vehicles.find((v) => v.bus), run };
  }

  it('pulls over at the stop, opens the doors at least ~10 s, then pulls out and drives off west', () => {
    const { t, bus, run } = street();
    run(0.1);
    expect(bus()?.dir).toBe(-1);
    let now = run(60, (n) => !!t.busAt(n)?.doorsOpen);
    const at = t.busAt(now)!;
    expect(at.phase).toBe('stopped');
    expect(Math.round(at.x)).toBe(BUS_PARK.x);
    expect(bus()!.y).toBe(BUS_PARK.y);
    const opened = now;
    now = run(40, (n) => !t.busAt(n)?.doorsOpen);
    expect(now - opened).toBeGreaterThanOrEqual(BUS_DWELL_MS - 50);
    now = run(60, () => !bus() || bus()!.x < BUS_PARK.x - 300);
    expect(t.busAt(now)?.phase ?? 'leaving').toBe('leaving');
  });

  it('waits while the stop holds it, but not forever', () => {
    const { t, run } = street();
    let now = run(60, (n) => !!t.busAt(n)?.doorsOpen);
    const opened = now;
    t.busHold = true;
    now = run(60, (n) => !t.busAt(n)?.doorsOpen);
    expect(now - opened).toBeGreaterThan(BUS_DWELL_MS + 5_000);
    expect(now - opened).toBeLessThanOrEqual(BUS_HOLD_MAX_MS + 1_000);
  });

  it('a car behind it waits instead of driving through it', () => {
    const { t, bus, run } = street();
    let now = run(60, (n) => !!t.busAt(n)?.doorsOpen);
    const lane = env.lanes[1];
    const car: Vehicle = { kind: 'car', x: BUS_PARK.x + 160, y: lane.y, dir: -1, speed: 50, want: 50, laneY: lane.y, ty: lane.y, variant: 3, riders: 1, stuck: 0, sidewalk: 0 };
    t.vehicles.push(car);
    now = run(6);
    expect(t.busAt(now)?.phase).toBe('stopped');
    // bumper to bumper behind it, not past it
    expect(car.x).toBeGreaterThan(bus()!.x + 60);
    expect(car.speed).toBeLessThan(5);
  });
});

const T0 = new Date(2026, 9, 23, 10, 0).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

describe('people at the bus stop', () => {
  function stop(): { sim: Sim; step: (s: number, until?: () => boolean) => void; set: (b: BusAt | null) => void } {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 10;
    const clock = { now: T0 };
    sim.applySnapshot({ rev: 1, serverTime: T0, rooms: [], agents: [], accounts: [], meta: { demo: true, sources: [], startedAt: T0, version: 't' } }, clock.now);
    // only the people the test puts there (no random passers-by walking up mid-count)
    sim.busStop.arrivals = false;
    let bus: BusAt | null = null;

    const step = (s: number, until?: () => boolean) => {
      for (let i = 0; i < s * 30; i++) {
        clock.now += 1000 / 30;
        // the renderer's part: the street says where the bus is
        sim.busStop.bus = bus;
        sim.update(1 / 30, clock.now);
        if (until?.()) return;
      }
    };
    return { sim, step, set: (b) => (bus = b) };
  }
  const riders = (sim: Sim) => sim.extras.filter((e) => e.id.startsWith(BUS_RIDER_ID));

  it('those waiting get on when the doors open, holding the bus until the last one is in', () => {
    const { sim, step, set } = stop();
    expect(sim.busStop.ridersNow(4, sim.now)).toBe(4);
    step(2);
    expect(sim.busStop.waiting()).toHaveLength(4);
    // the bench first
    expect(sim.busStop.waiting().some((c) => c.seated)).toBe(true);
    sim.busStop.chaseNext = null;
    set({ phase: 'pulling', x: BUS_PARK.x + 40, route: '19', doorsOpen: false });
    step(1);
    set({ phase: 'stopped', x: BUS_PARK.x, route: '19', doorsOpen: true });
    step(1);
    expect(sim.busStop.hold).toBe(true);
    step(30, () => sim.busStop.boarded >= 4);
    expect(sim.busStop.boarded).toBe(4);
    step(1);
    expect(sim.busStop.hold).toBe(false);
    expect(sim.busStop.spots.taken.every((t) => !t)).toBe(true);
    // those who got off are walking away; nobody left waiting
    expect(riders(sim).every((c) => c.y >= BUS_DOOR.y)).toBe(true);
  });

  it('someone running late: the bus pulls away without them, they grumble and wait for the next one', () => {
    const { sim, step, set } = stop();
    sim.busStop.chaseNext = 'miss';
    set({ phase: 'pulling', x: BUS_PARK.x + 40, route: '08', doorsOpen: false });
    step(1);
    set({ phase: 'stopped', x: BUS_PARK.x, route: '08', doorsOpen: true });
    step(10);
    // the doors close: here they come, too late, and the bus doesn't wait for them
    set({ phase: 'stopped', x: BUS_PARK.x, route: '08', doorsOpen: false });
    step(0.2);
    expect(sim.busStop.hold).toBe(false);
    const before = new Set(riders(sim).map((c) => c.id));
    expect(before.size).toBeGreaterThan(0);
    set({ phase: 'leaving', x: BUS_PARK.x - 20, route: '08', doorsOpen: false });
    step(1);
    set(null);
    step(20, () => sim.busStop.waiting().length > 0);
    expect(sim.busStop.boarded).toBe(0);
    const waiting = sim.busStop.waiting();
    expect(waiting).toHaveLength(1);
    expect(BUS_SPOTS.some((s) => s.x === waiting[0].x && s.y === waiting[0].y)).toBe(true);
  });

  it('the driver waits for the one running when they are seen in time', () => {
    const { sim, step, set } = stop();
    sim.busStop.chaseNext = 'wait';
    set({ phase: 'pulling', x: BUS_PARK.x + 40, route: '150', doorsOpen: false });
    step(1);
    set({ phase: 'stopped', x: BUS_PARK.x, route: '150', doorsOpen: true });
    step(BUS_DWELL_MS / 1000 - 1);
    // the runner is out and the bus is held for them...
    expect(sim.busStop.hold).toBe(true);
    step(15, () => !sim.busStop.hold);
    // ...until they're on
    expect(sim.busStop.boarded).toBe(1);
  });
});
