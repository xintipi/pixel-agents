// The night guard: his hours, the shutter's hours and motion, the gap, the order of the desks; and in the simulation
// the round that nags whoever is still at the desk (who answers back, and nothing about the agent changes), the shutter
// pulled down at 23:00, lifted for whoever walks through, and the walk home at dawn.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { FOOT_DY, TILE } from '../constants';
import {
  GUARD_ID,
  GUARD_SEAT,
  SHUTTER_LIFT,
  guardOnDuty,
  nearGap,
  nextVisit,
  postBlock,
  roundHours,
  shutterHours,
  shutterStep,
  shutterTarget,
} from './guard';
import { Sim } from './sim';
import { TEA_DOOR } from './tea';

const T0 = 1_700_000_000_000;
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

function agent(id: string, status: AgentInfo['status'], statusSince: number): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId: '/a',
    name: id,
    look: 'f',
    role: 'Main agent',
    sessionId: `s-${id}`,
    account: '.claude',
    status,
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 1234567,
  };
}

function snap(agents: AgentInfo[]): OfficeSnapshot {
  return {
    rev: 1,
    serverTime: T0,
    rooms: [{ id: '/a', name: 'a', path: '/a', slot: 0, seed: 7, createdAt: T0 }],
    agents,
    accounts: [{ id: '.claude', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

const guardOf = (sim: Sim) => sim.extras.find((e) => e.id === GUARD_ID);

describe('night guard: hours, shutter and round order', () => {
  it('on duty from 22:00 to 5:30, the round only before 23:00, the shutter down 23:00–6:00', () => {
    expect(guardOnDuty(21.9)).toBe(false);
    expect(guardOnDuty(22)).toBe(true);
    expect(guardOnDuty(2)).toBe(true);
    expect(guardOnDuty(5.6)).toBe(false);
    expect(roundHours(22.5)).toBe(true);
    expect(roundHours(23.1)).toBe(false);
    expect(roundHours(1)).toBe(false);
    expect(shutterHours(22.9)).toBe(false);
    expect(shutterHours(23)).toBe(true);
    expect(shutterHours(5.9)).toBe(true);
    expect(shutterHours(6)).toBe(false);
  });

  it('rolls down in a few seconds, lifts quickly for someone and rolls all the way up in the morning', () => {
    expect(shutterTarget(false, true)).toBe(0);
    expect(shutterTarget(true, false)).toBe(1);
    expect(shutterTarget(true, true)).toBe(SHUTTER_LIFT);
    let l = 0;
    for (let i = 0; i < 30; i++) l = shutterStep(l, 1, 1 / 30);
    expect(l).toBeGreaterThan(0.3);
    expect(l).toBeLessThan(0.5);
    for (let i = 0; i < 60; i++) l = shutterStep(l, 1, 1 / 30);
    expect(l).toBe(1);
    for (let i = 0; i < 15; i++) l = shutterStep(l, SHUTTER_LIFT, 1 / 30);
    expect(l).toBe(SHUTTER_LIFT);
    l = 1;
    for (let i = 0; i < 60; i++) l = shutterStep(l, 0, 1 / 30);
    expect(l).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) l = shutterStep(l, 0, 1 / 30);
    expect(l).toBe(0);
  });

  it('the gap: the door tile and the doormat outside, not his stool nor the corridor beyond', () => {
    const doorY = TEA_DOOR.ty * TILE + FOOT_DY;
    expect(nearGap(TEA_DOOR.tx * TILE + 8, doorY)).toBe(true);
    expect(nearGap(-2 * TILE, doorY + 10)).toBe(true);
    expect(nearGap(GUARD_SEAT.x, GUARD_SEAT.y)).toBe(false);
    expect(nearGap(6 * TILE, doorY)).toBe(false);
    expect(nearGap(TILE, doorY + 4 * TILE)).toBe(false);
  });

  it('visits the closest desk not yet visited', () => {
    const desks = [
      { id: 'a', x: 100, y: 50 },
      { id: 'b', x: 400, y: 50 },
      { id: 'c', x: 420, y: 300 },
    ];
    expect(nextVisit(desks, { x: 450, y: 220 }, new Set())?.id).toBe('c');
    expect(nextVisit(desks, { x: 450, y: 220 }, new Set(['c']))?.id).toBe('b');
    expect(nextVisit(desks, { x: 0, y: 0 }, new Set(['a', 'b', 'c']))).toBeNull();
  });

  it('at the post: never dozing right after being woken', () => {
    let r = 0;
    const rng = () => (r = (r + 0.137) % 1);
    for (let i = 0; i < 40; i++) expect(postBlock(rng, true).pose).not.toBe('sleep');
    const poses = new Set(Array.from({ length: 40 }, () => postBlock(rng, false).pose));
    expect(poses.has('sleep')).toBe(true);
    expect(poses.has('sit')).toBe(true);
  });
});

describe('night guard in the office', () => {
  it('at 22:30 walks in, nags whoever is at the desk (who answers back) and nothing about the agent changes', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 22.5;
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('ana', 'working', T0)]), clock.now);
    run(sim, clock, 2);
    const ana = sim.chars.get('ana')!;
    // the page just opened at 22:30: he's already at the post, no shutter yet
    expect(guardOf(sim)).toBeDefined();
    expect(sim.guard.closed).toBe(false);
    expect(sim.guard.guardNow()).toBe(true);
    let nagged = '';
    let answered = '';
    run(sim, clock, 120, () => {
      const g = guardOf(sim)!;
      if (g.sayUntil > clock.now && g.sayText.includes('🌙')) nagged = g.sayText;
      if (nagged && ana.sayUntil > clock.now) answered = ana.sayText;
      return !!answered;
    });
    expect(nagged).not.toBe('');
    expect(answered).toContain('uncle');
    expect(ana.mode).toBe('work');
    expect(ana.info.status).toBe('working');
    // standing right beside the desk
    const g = guardOf(sim)!;
    expect(Math.max(Math.abs(g.tx - ana.tx), Math.abs(g.ty - ana.ty))).toBeLessThanOrEqual(1);
  });

  it('at 23:00 pulls the shutter down, lifts it for whoever walks through, and goes home at dawn', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 22.8;
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('ana', 'working', T0)]), clock.now);
    run(sim, clock, 2);
    expect(sim.guard.shutter).toBe(0);
    sim.hourOverride = 23.1;
    run(sim, clock, 90, () => sim.guard.shutter >= 1);
    expect(sim.guard.closed).toBe(true);
    expect(sim.guard.shutter).toBe(1);
    // someone walks in through the gap: lifted partway, then down again
    const g = guardOf(sim)!;
    const ana = sim.chars.get('ana')!;
    const [x, y] = [ana.x, ana.y];
    ana.x = TEA_DOOR.tx * TILE;
    ana.y = TEA_DOOR.ty * TILE + FOOT_DY;
    run(sim, clock, 1);
    expect(sim.guard.passing).toBe(true);
    expect(sim.guard.shutter).toBeCloseTo(SHUTTER_LIFT);
    ana.x = x;
    ana.y = y;
    run(sim, clock, 4);
    expect(sim.guard.shutter).toBe(1);
    // 5:40: he walks off west along the sidewalk; at 6:00 the shutter rolls up
    sim.hourOverride = 5.7;
    run(sim, clock, 120, () => !guardOf(sim));
    expect(guardOf(sim)).toBeUndefined();
    expect(g.x).toBeLessThan(-10 * TILE);
    expect(sim.guard.closed).toBe(true);
    sim.hourOverride = 6.1;
    run(sim, clock, 6);
    expect(sim.guard.closed).toBe(false);
    expect(sim.guard.shutter).toBe(0);
  });

  it('opening the page in the small hours: shutter already down, the guard already on his stool', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 2;
    const clock = { now: T0 };
    sim.applySnapshot(snap([]), clock.now);
    run(sim, clock, 1.5);
    expect(sim.guard.shutter).toBe(1);
    const g = guardOf(sim)!;
    expect(g.seated).toBe(true);
    expect(g.x).toBe(GUARD_SEAT.x);
    expect(sim.guard.props()).toHaveLength(1);
    // debug: up and back
    sim.guard.shutterNow(false);
    run(sim, clock, 4);
    expect(sim.guard.shutter).toBe(0);
    sim.guard.shutterNow(null);
    run(sim, clock, 4);
    expect(sim.guard.shutter).toBe(1);
  });

  it('never in a visit', () => {
    const sim = new Sim(art, () => DEFAULT_WORLD_OPTIONS, null, { visit: true });
    sim.hourOverride = 23.5;
    const clock = { now: T0 };
    sim.applySnapshot(snap([]), clock.now);
    run(sim, clock, 2);
    expect(guardOf(sim)).toBeUndefined();
    expect(sim.guard.guardNow()).toBe(false);
    expect(sim.guard.shutter).toBe(0);
  });
});
