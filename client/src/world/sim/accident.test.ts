// Traffic accidents: when one may happen (the hours, what else is going on, the grace and the cooldown), the stretch of
// lane the scene blocks (the queue behind it, going around when the oncoming lane is free, a real jam when it's busy),
// and the whole event with the street and the people together: crash, officer, ambulance, clearing.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import type { OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { STREET_H, STREET_Y } from '../layout/exterior';
import {
  ACCIDENT_COOLDOWN_MS,
  ACCIDENT_GRACE_MS,
  ACCIDENT_T,
  AccidentClock,
  accidentAllowed,
  accidentChancePerMinute,
  accidentRoll,
  accidentStage,
  obstacleGap,
  sceneObstacle,
  type AccidentScene,
  type AccidentStage,
  type Obstacle,
} from './accident';
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
};
const EAST = env.lanes[0].y;
const WEST = env.lanes[1].y;

function vehicle(kind: 'bike' | 'car', x: number, dir: 1 | -1, extra: Partial<Vehicle> = {}): Vehicle {
  const laneY = dir > 0 ? EAST : WEST;
  const y = kind === 'bike' ? laneY - 4 : laneY;
  return { kind, x, y, dir, speed: 50, want: 50, laneY, ty: y, variant: 7, riders: 1, stuck: 0, sidewalk: 0, ...extra };
}

/** A street with no new arrivals (the test places every vehicle). */
function street(): Traffic {
  const t = new Traffic(mulberry32(7));
  t.forced = false;
  // nothing spawns on its own: the next arrivals are far away
  (t as unknown as { nextSpawn: Map<number, number> }).nextSpawn = new Map([
    [EAST, Infinity],
    [WEST, Infinity],
  ]);
  t.nextBusAt = Infinity;
  t.nextFlatAt = Infinity;
  return t;
}

function run(t: Traffic, seconds: number, from: number, each?: (now: number) => void): number {
  let now = from;
  for (let i = 0; i < seconds * 30; i++) {
    now += 1000 / 30;
    t.step(now, 1 / 30, env, 3, 3);
    each?.(now);
  }
  return now;
}

describe('accident schedule', () => {
  it('only by day, and not while something else is going on or on the first days of Tết', () => {
    expect(accidentAllowed({ hour: 10 })).toBe(true);
    expect(accidentAllowed({ hour: 17.5 })).toBe(true);
    expect(accidentAllowed({ hour: 23.2 })).toBe(false);
    expect(accidentAllowed({ hour: 3 })).toBe(false);
    expect(accidentAllowed({ hour: 5.9 })).toBe(false);
    // the siesta, the New Year party, the disco, a power cut, a visit
    expect(accidentAllowed({ hour: 13, blocked: true })).toBe(false);
    expect(accidentAllowed({ hour: 10, tetHoliday: true })).toBe(false);
  });

  it('rush hour and rain make it likelier; about one or two a day', () => {
    const quiet = accidentChancePerMinute(0, false);
    expect(accidentChancePerMinute(1, false)).toBeGreaterThan(quiet);
    expect(accidentChancePerMinute(0, true)).toBeGreaterThan(quiet);
    // 17 hours a day, half of them a little busy
    const perDay = 17 * 60 * accidentChancePerMinute(0.3, false);
    expect(perDay).toBeGreaterThan(1);
    expect(perDay).toBeLessThan(3);
  });

  it('the roll is the same for the same minute', () => {
    for (let m = 0; m < 50; m++) expect(accidentRoll(m, 0.3)).toBe(accidentRoll(m, 0.3));
    let hits = 0;
    for (let m = 0; m < 10_000; m++) if (accidentRoll(m, 0.1)) hits++;
    expect(hits).toBeGreaterThan(800);
    expect(hits).toBeLessThan(1200);
  });

  it('never in the grace after the page opens or within the cooldown, never when not allowed', () => {
    const p = accidentChancePerMinute(1, true);
    const hit = (from: number) => {
      let m = from;
      while (!accidentRoll(m, p)) m++;
      return m;
    };
    const m0 = hit(29_000_000);
    const clock = m0 * 60_000;
    // the page opened 5 minutes before: still in the grace
    const early = new AccidentClock();
    early.due(clock - 5 * 60_000, 1, true, true);
    expect(early.due(clock, 1, true, true)).toBe(false);
    // opened long enough before: due, unless not allowed
    const late = new AccidentClock();
    late.due(clock - ACCIDENT_GRACE_MS - 60_000, 1, true, true);
    const off = new AccidentClock();
    off.due(clock - ACCIDENT_GRACE_MS - 60_000, 1, true, true);
    expect(off.due(clock, 1, true, false)).toBe(false);
    expect(late.due(clock, 1, true, true)).toBe(true);
    late.fired(clock);
    // the next hit within the cooldown doesn't count; the first one after it does
    const m1 = hit(m0 + 1);
    if ((m1 - m0) * 60_000 < ACCIDENT_COOLDOWN_MS) expect(late.due(m1 * 60_000, 1, true, true)).toBe(false);
    const m2 = hit(m0 + ACCIDENT_COOLDOWN_MS / 60_000);
    expect(late.due(m2 * 60_000, 1, true, true)).toBe(true);
  });

  it('the street never crashes on its own at night or while the sim has something else going on', () => {
    for (const [hour, off] of [
      [3, false],
      [13, true],
    ] as const) {
      const t = street();
      t.forced = true;
      t.accidentOff = off;
      let now = 0;
      const base = Date.UTC(2026, 9, 23, 0);
      for (let i = 0; i < 6 * 60 * 2; i++) {
        now += 500;
        t.clock = base + now * 30;
        t.step(now, 0.5, env, hour, 3);
        if (!t.vehicles.some((v) => v.kind === 'bike')) t.vehicles.push(vehicle('bike', 300, 1), vehicle('bike', 270, 1));
      }
      expect(t.accident).toBeNull();
    }
  });
});

describe('the scene on the street', () => {
  it('blocks its lane: whoever comes up behind stops before it', () => {
    const t = street();
    const v = vehicle('bike', 300, 1);
    t.vehicles.push(v);
    t.crashAt = 300;
    let now = run(t, 0.1, 0);
    expect(t.accident).not.toBeNull();
    expect(t.vehicles).not.toContain(v);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    const car = vehicle('car', 0, 1);
    t.vehicles.push(car);
    // the westbound lane is busy all the time: no going around
    now = run(t, 15, now, () => {
      if (!t.vehicles.some((o) => o.dir < 0 && o.x > 280 && o.x < 440)) t.vehicles.push(vehicle('car', 440, -1));
    });
    const o: Obstacle = { x0: 0, x1: 0, y0: 0, y1: 0 };
    expect(sceneObstacle(s, o)).toBe(true);
    expect(car.x + 29).toBeLessThanOrEqual(o.x0 + 0.5);
    expect(car.speed).toBeLessThan(1);
    expect(car.detour).toBeFalsy();
  });

  it('the one that hit the bike stops dead, its rider off, then rides on', () => {
    const t = street();
    const a = vehicle('bike', 300, 1);
    const b = vehicle('bike', 270, 1, { variant: 99 });
    t.vehicles.push(a, b);
    t.crashAt = 300;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    expect(s.other).toBe(99);
    expect(b.hit && b.riderOff).toBe(true);
    s.officerDue = s.ambulanceDue = Infinity;
    now = run(t, 5, now);
    expect(b.speed).toBe(0);
    run(t, (s.otherUntil - now) / 1000 + 12, now);
    expect(b.hit).toBeFalsy();
    expect(b.riderOff).toBeFalsy();
    // quiet street: it went around and on
    expect(b.x).toBeGreaterThan(s.x + 40);
  });

  it('quiet: the cars behind slow down and go around through the free lane, then back into theirs', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 300, 1));
    t.crashAt = 300;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    const car = vehicle('car', 50, 1);
    t.vehicles.push(car);
    let around = false;
    now = run(t, 25, now, () => (around ||= !!car.detour));
    expect(around).toBe(true);
    expect(car.x).toBeGreaterThan(s.x + 60);
    expect(car.y).toBe(EAST);
    expect(car.detour).toBeFalsy();
  });

  it('busy: a long queue builds up behind the scene and honks; the officer waving that side on lets it through', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 600, 1));
    t.crashAt = 600;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    for (let i = 0; i < 8; i++) t.vehicles.push(vehicle(i % 3 ? 'bike' : 'car', 500 - i * 45, 1, { variant: 100 + i }));
    const oncoming = () => {
      if (!t.vehicles.some((o) => o.dir < 0 && o.x > 580 && o.x < 740)) t.vehicles.push(vehicle('car', 740, -1));
    };
    let honks = 0;
    now = run(t, 20, now, () => {
      oncoming();
      honks += t.horns.length;
      t.horns.length = 0;
    });
    const queued = t.vehicles.filter((o) => o.dir > 0 && o.x < 600);
    expect(queued.length).toBeGreaterThanOrEqual(6);
    expect(queued.filter((o) => o.speed < 2).length).toBeGreaterThanOrEqual(4);
    expect(honks).toBeGreaterThan(0);
    // the officer: cones out, holding the oncoming side, waving the blocked one on
    s.cones = 3;
    s.directing = true;
    s.hold = -1;
    s.holdUntil = Infinity;
    run(t, 25, now, oncoming);
    const passed = t.vehicles.filter((o) => o.dir > 0 && o.x > 650 && o.variant >= 100);
    expect(passed.length).toBeGreaterThanOrEqual(2);
    // and the held side waited before the scene
    const held = t.vehicles.filter((o) => o.dir < 0 && o.x > 600);
    for (const o of held) expect(o.x).toBeGreaterThan(600 + 30);
  });

  it('an obstacle only counts ahead and in its band', () => {
    const o: Obstacle = { x0: 100, x1: 160, y0: 40, y1: 60 };
    expect(obstacleGap(50, 13, 1, 50, 1, o)).toBe(37);
    expect(obstacleGap(210, 13, -1, 50, 1, o)).toBe(37);
    expect(obstacleGap(50, 13, 1, 80, 1, o)).toBe(Infinity);
    expect(obstacleGap(200, 13, 1, 50, 1, o)).toBe(Infinity);
    expect(obstacleGap(110, 13, 1, 50, 1, o)).toBe(0);
  });

  it('the ambulance comes in the other lane, stops by the scene, waits to be loaded and drives off', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 300, 1));
    t.crashAt = 300;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.ambulanceDue = now;
    let sirens = 0;
    now = run(t, 30, now, () => {
      sirens += t.sounds.filter((x) => x.kind === 'siren').length;
      t.sounds.length = 0;
    });
    expect(s.ambulance).toBe('there');
    expect(sirens).toBeGreaterThan(2);
    const amb = t.vehicles.find((v) => v.ambulance)!;
    expect(amb.dir).toBe(-1);
    expect(Math.abs(amb.x + 29 - s.x)).toBeLessThan(25);
    s.loaded = true;
    run(t, 40, now);
    expect(s.ambulance).toBe('gone');
    expect(t.vehicles.some((v) => v.ambulance)).toBe(false);
  });

  it('whoever goes around never drives through the oncoming traffic: the oncoming side yields to them', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 400, 1));
    t.crashAt = 400;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    const halfOf = (v: Vehicle) => (v.kind === 'car' ? 29 : 13);
    const crossing = (a: Vehicle, b: Vehicle) =>
      Math.abs(a.x - b.x) < halfOf(a) + halfOf(b) - 2 && Math.abs(a.y - b.y) < (a.kind === 'car' || b.kind === 'car' ? 10 : 7);
    let overlaps = 0;
    let detours = 0;
    let late = 0;
    let k = 0;
    const surprised = new Set<Vehicle>();
    // eastbound cars piling up behind the scene; whenever one has just pulled out to go around, someone turns up in the
    // oncoming lane right in front of it (a new arrival, or the side the officer just let go)
    now = run(t, 90, now, () => {
      k++;
      if (k % 75 === 0) t.vehicles.push(vehicle(k % 150 ? 'car' : 'bike', -350, 1, { variant: 200 + k }));
      for (const a of t.vehicles) {
        if (!a.detour) continue;
        detours++;
        if (!surprised.has(a)) {
          surprised.add(a);
          late++;
          // a car in the middle of its lane, or a bike weaving along the edge of its band nearest the detour line
          const bike = late % 2 === 0;
          const y = bike ? WEST - 15 : WEST;
          t.vehicles.push(vehicle(bike ? 'bike' : 'car', a.x + 110, -1, { variant: 900 + k, y, ty: y }));
        }
        for (const b of t.vehicles) if (b.dir !== a.dir && crossing(a, b)) overlaps++;
      }
    });
    expect(detours).toBeGreaterThan(0);
    expect(late).toBeGreaterThanOrEqual(2);
    expect(overlaps).toBe(0);
    // and nobody got stuck face to face: the ones that went around made it past the scene
    expect([...surprised].filter((a) => a.x > s.x + 60).length).toBeGreaterThanOrEqual(2);
  });

  it('nobody starts going around while the ambulance is on the street', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 400, 1));
    t.crashAt = 400;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = Infinity;
    s.ambulanceDue = now;
    now = run(t, 2, now);
    expect(t.vehicles.some((v) => v.ambulance)).toBe(true);
    const car = vehicle('car', 200, 1);
    t.vehicles.push(car);
    let around = false;
    run(t, 12, now, () => (around ||= !!car.detour && t.vehicles.some((v) => v.ambulance)));
    expect(around).toBe(false);
  });

  it('a late ambulance put by the scene never lands on top of someone', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 400, 1));
    t.crashAt = 400;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = Infinity;
    s.ambulanceDue = now;
    now = run(t, 1, now);
    // the westbound lane at the stop is packed and doesn't move
    const amb = t.vehicles.find((v) => v.ambulance)!;
    amb.x = 1100;
    for (let i = 0; i < 4; i++) t.vehicles.push(vehicle('car', 330 + i * 62, -1, { want: 0, speed: 0, variant: 500 + i }));
    run(t, ACCIDENT_T.ambulanceLate / 1000 + 2, now);
    expect(s.ambulance).toBe('there');
    for (const o of t.vehicles) if (o !== amb && o.dir === amb.dir && Math.abs(o.y - amb.y) < 10) expect(Math.abs(o.x - amb.x)).toBeGreaterThanOrEqual(29 + (o.kind === 'car' ? 29 : 13));
  });

  it('agents riding in and the racing boy go around too (they used to wait it out)', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 400, 1));
    t.crashAt = 400;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    const mine = vehicle('bike', 200, 1, { owner: 'agent-1', phase: 'arrive', park: { x: 1100, y: STREET_Y - 6 } });
    t.vehicles.push(mine);
    run(t, 20, now);
    expect(mine.x).toBeGreaterThan(s.x + 40);
  });

  it('the crossing officer and the one at the scene hold the same side', () => {
    const t = street();
    t.police.onPost = true;
    t.vehicles.push(vehicle('bike', 100, 1));
    t.crashAt = 100;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    s.cones = 3;
    s.directing = true;
    s.hold = 1;
    s.holdUntil = now + 60_000;
    now = run(t, 1, now);
    expect(t.police.hold).toBe(1);
    s.hold = -1;
    run(t, 1, now);
    expect(t.police.hold).toBe(-1);
  });

  it('nobody drives through the crew out on the road', () => {
    const t = street();
    t.vehicles.push(vehicle('bike', 400, 1));
    t.crashAt = 400;
    let now = run(t, 0.1, 0);
    const s = t.accident!;
    s.officerDue = s.ambulanceDue = Infinity;
    // someone standing in the westbound lane, a car coming at them
    s.walkers = [250, WEST];
    const car = vehicle('car', 600, -1);
    t.vehicles.push(car);
    now = run(t, 12, now);
    expect(car.x - 29).toBeGreaterThanOrEqual(254 - 0.5);
    expect(car.speed).toBeLessThan(1);
    // they stepped off the road: it rides on
    s.walkers = [];
    run(t, 10, now);
    expect(car.x).toBeLessThan(200);
  });

  it('never lasts forever', () => {
    const t = street();
    t.crashAt = 300;
    const now = run(t, 0.1, 0);
    expect(t.accident).not.toBeNull();
    run(t, ACCIDENT_T.max / 1000 + 1, now);
    expect(t.accident).toBeNull();
    expect(t.obstacles.length).toBe(0);
  });
});

const T0 = new Date(2026, 9, 23, 10, 30).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const snap: OfficeSnapshot = { rev: 1, serverTime: T0, rooms: [], agents: [], accounts: [], meta: { demo: true, sources: [], startedAt: T0, version: 't' } };

describe('the whole accident, street and people', () => {
  it('crash, then the officer with the cones, then the ambulance and the medics, then the clearing; the lane reopens', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    let now = T0;
    sim.applySnapshot(snap, now);
    const t = street();
    const a = vehicle('bike', 300, 1);
    const b = vehicle('bike', 270, 1, { variant: 99 });
    t.vehicles.push(a, b);
    t.crashAt = 300;
    const seen: AccidentStage[] = [];
    let id = 0;
    let maxCones = 0;
    let directed = false;
    for (let i = 0; i < 260 * 30; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 10.5, 3);
      sim.accident.scene = t.accident;
      sim.update(1 / 30, now);
      const s = t.accident;
      if (s) {
        id ||= s.id;
        const st = accidentStage(s, now);
        if (seen[seen.length - 1] !== st) seen.push(st);
        maxCones = Math.max(maxCones, s.cones);
        directed ||= s.directing;
      } else if (id) break;
    }
    expect(id).toBeGreaterThan(0);
    expect(seen.slice(0, 2)).toEqual(['crash', 'police']);
    expect(seen).toContain('ambulance');
    expect(seen.indexOf('treat')).toBeGreaterThan(seen.indexOf('ambulance'));
    expect(seen.indexOf('clearing')).toBeGreaterThan(seen.indexOf('treat'));
    expect(maxCones).toBe(3);
    expect(directed).toBe(true);
    // all over: nobody left, nothing blocking, the ambulance gone
    expect(t.accident).toBeNull();
    expect(t.obstacles.length).toBe(0);
    expect(sim.extras.some((e) => e.id.startsWith('npc:accident:') && !e.gone)).toBe(false);
    expect(now - T0).toBeLessThan(ACCIDENT_T.max);
  });

  it('no officer (the art failed): the scene clears by itself once the ambulance has left', () => {
    const noOfficer = {
      appearanceFromSeed: (seed: number) => {
        if (seed === 9931) throw new Error('no art');
        return appearance;
      },
      roomTheme: () => theme,
    } as unknown as ArtModule;
    const sim = new Sim(noOfficer, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    let now = T0;
    sim.applySnapshot(snap, now);
    const t = street();
    t.vehicles.push(vehicle('bike', 300, 1));
    t.crashAt = 300;
    let id = 0;
    let gone = false;
    for (let i = 0; i < 200 * 30; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 10.5, 3);
      sim.accident.scene = t.accident;
      sim.update(1 / 30, now);
      const s = t.accident;
      if (s) {
        id ||= s.id;
        gone ||= s.ambulance === 'leaving' || s.ambulance === 'gone';
      } else if (id) break;
    }
    expect(gone).toBe(true);
    expect(t.accident).toBeNull();
    expect(t.obstacles.length).toBe(0);
    // well before the hard cap
    expect(now - T0).toBeLessThan(ACCIDENT_T.max - 30_000);
  });

  it('the riders and the medics keep their own clothes whatever the theme', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    let now = T0;
    sim.applySnapshot(snap, now);
    const t = street();
    t.vehicles.push(vehicle('bike', 300, 1), vehicle('bike', 270, 1, { variant: 99 }));
    t.crashAt = 300;
    let medics = 0;
    for (let i = 0; i < 120 * 30; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 10.5, 3);
      sim.accident.scene = t.accident;
      sim.update(1 / 30, now);
      medics = Math.max(medics, sim.extras.filter((e) => e.id.includes(':medic:') && !e.gone).length);
      if (medics) break;
    }
    const crew = sim.extras.filter((e) => e.id.startsWith('npc:accident:') && !e.gone);
    expect(crew.find((e) => e.id.endsWith(':rider'))?.plain).toBe(true);
    expect(crew.filter((e) => e.id.includes(':medic:')).every((e) => e.plain)).toBe(true);
    // the officer wears the traffic police uniform (his own costume), not the theme's either
    expect(crew.find((e) => e.id.endsWith(':police'))?.costume).toBe('csgt');
  });

  it('a hidden tab ends it', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    let now = T0;
    sim.applySnapshot(snap, now);
    const t = street();
    t.crashAt = 300;
    for (let i = 0; i < 30 * 30; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 10.5, 3);
      sim.accident.scene = t.accident;
      sim.update(1 / 30, now);
    }
    const s: AccidentScene = t.accident!;
    expect(s).not.toBeNull();
    sim.fastForward(now);
    t.step(now + 33, 1 / 30, env, 10.5, 3);
    expect(t.accident).toBeNull();
  });
});
