// The receptionist: her hours, the greeting cooldown and lines, what she does at the desk; and, in the simulation, her
// day behind the reception counter (in at 9:00, greets an arriving agent once, goes home after 18:00, never an agent).
import { describe, expect, it } from 'vitest';
import { tr } from '../../../../shared/i18n';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { RECEPTION_ID } from '../layout/core';
import { GREET_COOLDOWN_MS, RECEPTIONIST_ID, RECEPTION_DESK_SPOT, byeLine, canGreet, deskAct, helloLine, receptionOpen } from './reception';
import { Sim } from './sim';

const T0 = 1_700_000_000_000;
const appearance = { top: '#3f7fd8', look: 'f', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

function agent(id: string): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId: '/a',
    name: id,
    look: 'f',
    role: 'Main agent',
    sessionId: `s-${id}`,
    account: '.claude',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
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

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('the receptionist', () => {
  it('works 7:30–18:00', () => {
    expect(receptionOpen(7.4)).toBe(false);
    expect(receptionOpen(7.5)).toBe(true);
    expect(receptionOpen(12)).toBe(true);
    expect(receptionOpen(17.99)).toBe(true);
    expect(receptionOpen(18)).toBe(false);
    expect(receptionOpen(2)).toBe(false);
  });

  it('one bubble per cooldown', () => {
    expect(canGreet(0, T0)).toBe(true);
    expect(canGreet(T0, T0 + GREET_COOLDOWN_MS - 1)).toBe(false);
    expect(canGreet(T0, T0 + GREET_COOLDOWN_MS)).toBe(true);
    expect(canGreet(T0, T0 + 5_000, 5_000)).toBe(true);
  });

  it('good morning in the morning, see you tomorrow late in the day', () => {
    expect(helloLine(8, seq(0))).toBe(tr('Good morning! ☀️'));
    expect(helloLine(14, seq(0))).toBe(tr('Welcome to the office! 😊'));
    expect(byeLine(17.5, seq(0.9))).toBe(tr('See you tomorrow! 👋'));
    expect(byeLine(11, seq(0))).not.toBe(tr('See you tomorrow! 👋'));
  });

  it('at the desk: dozes in the siesta, often eats at lunch, otherwise works', () => {
    expect(deskAct(seq(0.5), { lunch: false, siesta: true })).toMatchObject({ pose: 'sulk', doze: true });
    expect(deskAct(seq(0.1), { lunch: true, siesta: false })).toMatchObject({ held: 'noodles' });
    expect(deskAct(seq(0.1), { lunch: false, siesta: false })).toMatchObject({ pose: 'use' });
    expect(deskAct(seq(0.4, 0.1, 0.1), { lunch: false, siesta: false })).toMatchObject({ held: 'phone', phone: true });
    for (let i = 0; i < 50; i++) {
      const a = deskAct(Math.random, { lunch: false, siesta: false });
      expect(a.doze).toBeFalsy();
      expect(a.ms).toBeGreaterThan(0);
    }
  });
});

describe('the receptionist in the office', () => {
  it('is behind the counter at 9:00, greets an arriving agent once, goes home after 18:00 and is never an agent', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 9;
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('ana')]), clock.now);
    run(sim, clock, 2);
    const rc = sim.extras.find((e) => e.id === RECEPTIONIST_ID)!;
    expect(rc).toBeDefined();
    // page load in office hours: already at the desk (no walk in), behind the counter, facing the room
    const area = sim.building.core.find((a) => a.id === RECEPTION_ID)!;
    expect({ tx: rc.tx, ty: rc.ty }).toEqual({ tx: area.rect.x + RECEPTION_DESK_SPOT.lx, ty: area.rect.y + RECEPTION_DESK_SPOT.ly });
    expect(rc.dir).toBe('down');
    // never counted among the agents
    expect(sim.chars.has(RECEPTIONIST_ID)).toBe(false);
    expect(sim.chars.size).toBe(1);
    // two agents arrive by elevator, one right after the other: one greeting (the cooldown covers the second)
    const greetings = new Set([tr('Good morning! ☀️'), tr('Welcome to the office! 😊')]);
    const said: number[] = [];
    const watch = () => {
      if (greetings.has(rc.sayText) && rc.sayAt && !said.includes(rc.sayAt)) said.push(rc.sayAt);
      return false;
    };
    sim.applySnapshot(snap([agent('ana'), agent('bruno')]), clock.now);
    run(sim, clock, 1);
    sim.applySnapshot(snap([agent('ana'), agent('bruno'), agent('caio')]), clock.now);
    run(sim, clock, 15, watch);
    expect(said).toHaveLength(1);
    expect(rc.pose === 'raise_hand' || clock.now - said[0] > 1_800).toBe(true);
    run(sim, clock, 60, watch);
    // both were close by at most once each; never two bubbles within the cooldown
    for (let i = 1; i < said.length; i++) expect(said[i] - said[i - 1]).toBeGreaterThanOrEqual(GREET_COOLDOWN_MS);
    expect(sim.chars.size).toBe(3);
    // closing time: she takes the elevator home and the desk is empty
    sim.hourOverride = 18.5;
    run(sim, clock, 120, () => !sim.extras.some((e) => e.id === RECEPTIONIST_ID));
    expect(sim.extras.some((e) => e.id === RECEPTIONIST_ID)).toBe(false);
    // the next morning she steps out of the elevator and walks to the desk
    sim.hourOverride = 7.6;
    run(sim, clock, 2);
    const again = sim.extras.find((e) => e.id === RECEPTIONIST_ID)!;
    expect(again.arriving).toBe(true);
    run(sim, clock, 60, () => !again.arriving);
    expect({ tx: again.tx, ty: again.ty }).toEqual({ tx: area.rect.x + RECEPTION_DESK_SPOT.lx, ty: area.rect.y + RECEPTION_DESK_SPOT.ly });
  });

  it('says goodbye to an agent leaving through the reception', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 17;
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('ana')]), clock.now);
    run(sim, clock, 2);
    const rc = sim.extras.find((e) => e.id === RECEPTIONIST_ID)!;
    sim.applySnapshot(snap([]), clock.now);
    run(sim, clock, 90, () => rc.sayText === tr('See you tomorrow! 👋'));
    expect(rc.sayText).toBe(tr('See you tomorrow! 👋'));
  });

  it('back from a hidden tab: at the desk again right away', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 10;
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('ana')]), clock.now);
    run(sim, clock, 2);
    clock.now += 60_000;
    sim.fastForward(clock.now);
    run(sim, clock, 1.5);
    const rc = sim.extras.find((e) => e.id === RECEPTIONIST_ID)!;
    expect(rc).toBeDefined();
    expect(rc.arriving).toBe(false);
    expect(rc.alpha).toBe(1);
  });
});
