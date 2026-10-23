// Racing boys: the windows fitted into the street's day, weaving past slower bikes, ignoring the officer's stop line,
// and each street character reacting in their own way (only whoever is out at that hour).
import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { CROSSWALK, STREET_H, STREET_Y } from '../layout/exterior';
import { racerReaction } from './racer';
import { Sim } from './sim';
import { Traffic, racerWindow, type TrafficEnv, type Vehicle } from './traffic';
import { danceTime } from './danvu';

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

function quietStreet(): Traffic {
  let r = 0.42;
  const t = new Traffic(() => (r = (r * 9301 + 49297) % 233280 / 233280));
  t.forced = false;
  return t;
}

function run(t: Traffic, seconds: number, hour = 22): void {
  let now = 1_000;
  for (let i = 0; i < seconds * 30; i++) {
    now += 1000 / 30;
    t.step(now, 1 / 30, env, hour, 3);
  }
}

describe('racing boys on the street', () => {
  it("ride in the street's quiet stretches: never at rush hour, over lunch, during the evening dance or late at night", () => {
    expect(racerWindow(10.5)).not.toBeNull();
    expect(racerWindow(15)).not.toBeNull();
    expect(racerWindow(22)).not.toBeNull();
    for (const h of [7.5, 12.5, 17.5, 19.5, 23.8, 3]) expect(racerWindow(h)).toBeNull();
    for (let h = 19; h < 20.5; h += 0.25) expect(danceTime(h) && racerWindow(h)).toBeFalsy();
  });

  it('a racing boy comes when called, far faster than everyone, and weaves past a slow bike', () => {
    const t = quietStreet();
    const slow: Vehicle = { kind: 'bike', x: -200, y: env.lanes[0].y - 4, dir: 1, speed: 30, want: 30, laneY: env.lanes[0].y, ty: env.lanes[0].y - 4, variant: 3, riders: 1, stuck: 0, sidewalk: 0 };
    t.vehicles.push(slow);
    t.racerNow = true;
    run(t, 0.1);
    const racer = t.vehicles.find((v) => v.racer);
    expect(racer).toBeDefined();
    expect(racer!.want).toBeGreaterThanOrEqual(150);
    // put the racer right behind the slow bike, same lane
    if (racer!.dir < 0) {
      racer!.dir = 1;
      racer!.laneY = env.lanes[0].y;
    }
    racer!.x = slow.x - 60;
    racer!.y = racer!.ty = slow.y;
    run(t, 3);
    expect(racer!.x).toBeGreaterThan(slow.x + 30);
    expect(t.racerEvents.length).toBeGreaterThan(0);
  });

  it("blows through the traffic police's stop line (and the officer notices)", () => {
    const t = quietStreet();
    t.police.onPost = true;
    t.police.hold = 1;
    t.police.holdUntil = Number.MAX_SAFE_INTEGER;
    const r: Vehicle = { kind: 'bike', x: CROSSWALK.x - 150, y: env.lanes[0].y - 4, dir: 1, speed: 160, want: 160, laneY: env.lanes[0].y, ty: env.lanes[0].y - 4, variant: 9, riders: 1, stuck: 0, sidewalk: 0, racer: true };
    t.vehicles.push(r);
    run(t, 3);
    expect(r.x).toBeGreaterThan(CROSSWALK.x + CROSSWALK.w);
    expect(t.racerEvents.some((e) => e.police)).toBe(true);
  });
});

const T0 = new Date(2026, 9, 23, 10, 0).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const snap: OfficeSnapshot = { rev: 1, serverTime: T0, rooms: [], agents: [], accounts: [], meta: { demo: true, sources: [], startedAt: T0, version: 't' } };

/** Every line `who` can say (the rng picks one). */
function linesOf(who: Parameters<typeof racerReaction>[0]): Set<string> {
  return new Set([0, 0.3, 0.6, 0.99].map((v) => racerReaction(who, () => v)));
}

describe('racing boys and the street', () => {
  it('the tea seller, out at that hour, shouts her own line (once in a while)', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    sim.hourOverride = 10.5;
    const clock = { now: T0 };
    sim.applySnapshot(snap, clock.now);
    for (let i = 0; i < 90 * 30 && !sim.teaUp; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
    }
    const seller = sim.extras.find((e) => e.id === 'npc:tra-da')!;
    expect(seller).toBeDefined();
    sim.racerPassed({ x: seller.x, y: STREET_Y + 10, at: clock.now }, clock.now);
    expect(linesOf('tea').has(seller.sayText)).toBe(true);
    // a second pass right after: no shouting again
    const said = seller.sayAt;
    clock.now += 10_000;
    sim.racerPassed({ x: seller.x, y: STREET_Y + 10, at: clock.now }, clock.now);
    expect(seller.sayAt).toBe(said);
  });

  it('far from the sidewalk (or far along it), nobody reacts', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    sim.hourOverride = 10.5;
    const clock = { now: T0 };
    sim.applySnapshot(snap, clock.now);
    for (let i = 0; i < 90 * 30 && !sim.teaUp; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
    }
    const seller = sim.extras.find((e) => e.id === 'npc:tra-da')!;
    sim.racerPassed({ x: seller.x + 400, y: STREET_Y + 10, at: clock.now }, clock.now);
    expect(seller.sayText === '' || !linesOf('tea').has(seller.sayText)).toBe(true);
  });

  it('the hủ tiếu boy thinks the bike is cool; the uncle worries about his broth', () => {
    expect([...linesOf('hutieuBoy')].every((l) => l.includes('🤩'))).toBe(true);
    expect([...linesOf('hutieu')].some((l) => l.includes('😤'))).toBe(true);
  });
});
