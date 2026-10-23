// Traffic police: the street holding one direction at the stop line, both while someone is on the crossing, bikes
// whistled off the sidewalk, the jam that calls the officer; and in the simulation the officer walking out to the post,
// directing and walking off.
import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { CROSSWALK, STREET_H, STREET_Y } from '../layout/exterior';
import { POLICE_POST, policeGesture } from './police';
import { Sim } from './sim';
import { Traffic, type TrafficEnv, type Vehicle } from './traffic';

const env: TrafficEnv = {
  x0: -400,
  x1: 1200,
  lanes: [
    { y: STREET_Y + 29, dir: 1 },
    { y: STREET_Y + 69, dir: -1 },
  ],
  sidewalkY: STREET_Y + STREET_H,
  crossing: CROSSWALK,
};

function bike(x: number, dir: 1 | -1, extra: Partial<Vehicle> = {}): Vehicle {
  const laneY = dir > 0 ? env.lanes[0].y : env.lanes[1].y;
  return { kind: 'bike', x, y: laneY, dir, speed: 50, want: 50, laneY, ty: laneY, variant: 1, riders: 1, stuck: 0, sidewalk: 0, ...extra };
}

/** A quiet street (no new vehicles to speak of) with the officer at the post, holding `hold`. */
function street(hold: 1 | -1): Traffic {
  let r = 0.5;
  const t = new Traffic(() => (r = (r * 9301 + 49297) % 233280 / 233280));
  t.forced = false;
  t.police.onPost = true;
  t.police.hold = hold;
  t.police.holdUntil = Number.MAX_SAFE_INTEGER;
  return t;
}

function run(t: Traffic, seconds: number, from = 0): number {
  let now = from;
  for (let i = 0; i < seconds * 30; i++) {
    now += 1000 / 30;
    t.step(now, 1 / 30, env, 3, 3);
  }
  return now;
}

describe('traffic police on the street', () => {
  it('the held direction waits at the stop line; on its turn it goes through', () => {
    const t = street(1);
    const v = bike(CROSSWALK.x - 120, 1);
    t.vehicles.push(v);
    const now = run(t, 8);
    expect(v.x).toBeLessThan(CROSSWALK.x);
    expect(v.speed).toBeLessThan(1);
    t.police.hold = -1;
    run(t, 8, now);
    expect(v.x).toBeGreaterThan(CROSSWALK.x + CROSSWALK.w);
  });

  it('the other direction keeps going', () => {
    const t = street(1);
    const v = bike(CROSSWALK.x + CROSSWALK.w + 120, -1);
    t.vehicles.push(v);
    run(t, 8);
    expect(v.x).toBeLessThan(CROSSWALK.x);
  });

  it('with someone on the crossing, both directions wait', () => {
    const t = street(1);
    t.police.walkers = true;
    const v = bike(CROSSWALK.x + CROSSWALK.w + 120, -1);
    t.vehicles.push(v);
    run(t, 8);
    expect(v.x).toBeGreaterThan(CROSSWALK.x + CROSSWALK.w);
  });

  it('a bike riding the far sidewalk near the officer gets whistled back down', () => {
    const t = street(1);
    const v = bike(CROSSWALK.x + 100, -1);
    v.ty = v.y = env.sidewalkY + 8;
    v.sidewalk = 500;
    t.vehicles.push(v);
    run(t, 0.2);
    expect(v.caught).toBe(true);
    expect(t.police.catches).toBe(1);
    expect(v.sidewalk).toBeLessThanOrEqual(0);
  });

  it('a jammed rush hour calls for an officer; off duty, nobody is held', () => {
    let r = 0.3;
    const t = new Traffic(() => (r = (r * 9301 + 49297) % 233280 / 233280));
    t.forced = true;
    let now = 0;
    for (let i = 0; i < 240 * 30 && !t.police.wanted; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 3, 3);
    }
    expect(t.police.wanted).toBe(true);
    // without the officer at the post the stop line does nothing
    const free = street(1);
    free.police.onPost = false;
    const v = bike(CROSSWALK.x - 120, 1);
    free.vehicles.push(v);
    run(free, 8);
    expect(v.x).toBeGreaterThan(CROSSWALK.x + CROSSWALK.w);
  });

  it('the gesture faces the waiting side, then waves the other one through', () => {
    expect(policeGesture(1, 0)).toEqual({ pose: 'raise_hand', dir: 'left' });
    expect(policeGesture(1, 900)).toEqual({ pose: 'use', dir: 'right' });
    expect(policeGesture(-1, 0).dir).toBe('right');
  });
});

const T0 = new Date(2026, 9, 23, 17, 30).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const snap: OfficeSnapshot = {
  rev: 1,
  serverTime: T0,
  rooms: [],
  agents: [],
  accounts: [],
  meta: { demo: true, sources: [], startedAt: T0, version: 't' },
};

describe('traffic police in the office', () => {
  it('walks out to the middle of the crossing when wanted, directs, and walks off when the jam is over', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    const clock = { now: T0 };
    sim.applySnapshot(snap, clock.now);
    const step = (seconds: number, until: () => boolean) => {
      for (let i = 0; i < seconds * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        if (until()) return;
      }
    };
    const officer = () => sim.extras.find((e) => e.id === 'npc:csgt');
    sim.policeWanted = true;
    step(120, () => sim.policeOnPost);
    expect(sim.policeOnPost).toBe(true);
    const o = officer()!;
    expect(Math.round(o.x)).toBe(POLICE_POST.x);
    expect(Math.round(o.y)).toBe(POLICE_POST.y);
    step(0.2, () => false);
    expect(['raise_hand', 'use']).toContain(o.pose);
    // the street flows again
    sim.policeWanted = false;
    step(120, () => !officer());
    expect(officer()).toBeUndefined();
    expect(sim.policeOnPost).toBe(false);
  });
});
