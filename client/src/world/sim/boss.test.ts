// The boss's rounds: when they happen, what the boss sees and the order of the stops; and, in the simulation, the
// idle agent napping at the desk who jolts awake and types while the boss is around.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BOSS_MAX_ROOMS, BOSS_SIGHT, bossHours, inSight, patrolOrder } from './boss';
import { Sim } from './sim';

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

describe('boss rounds in the office', () => {
  it('the idle napper jolts awake and types while the boss is around, then sighs; the boss leaves', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 10;
    const clock = { now: T0 };
    // idle for 20 minutes: napping at the desk, no strolls
    sim.applySnapshot(snap([agent('ana', 'idle', T0 - 20 * 60_000), agent('bruno', 'working', T0)]), clock.now);
    run(sim, clock, 1);
    const ana = sim.chars.get('ana')!;
    expect(ana.pose).toBe('sleep');
    expect(sim.bossPatrol(clock.now)).toBe(true);
    expect(sim.bossPatrol(clock.now)).toBe(false); // one boss at a time
    run(sim, clock, 120, () => clock.now < ana.fakeWorkUntil);
    expect(clock.now).toBeLessThan(ana.fakeWorkUntil);
    run(sim, clock, 0.1);
    expect(ana.pose).toBe('type');
    expect(ana.chatEmoji).toBe('😳');
    // the boss leaves the room: a sigh, the pretending stops and the nap doesn't come back right away
    run(sim, clock, 120, () => ana.fakeWorkUntil === 0);
    expect(ana.fakeWorkUntil).toBe(0);
    expect(ana.chatEmoji).toBe('😮‍💨');
    run(sim, clock, 0.1);
    expect(ana.pose).not.toBe('type');
    expect(ana.pose).not.toBe('sleep');
    run(sim, clock, 180, () => !sim.extras.some((e) => e.id === 'npc:sep'));
    expect(sim.extras.some((e) => e.id === 'npc:sep')).toBe(false);
    // whoever was really working never pretended
    expect(sim.chars.get('bruno')!.fakeWorkUntil).toBe(0);
  });
});

describe('boss rounds', () => {
  it('only on weekdays, in office hours, never over lunch and the siesta', () => {
    expect(bossHours(10, 2)).toBe(true);
    expect(bossHours(15, 5)).toBe(true);
    expect(bossHours(10, 0)).toBe(false); // Sunday
    expect(bossHours(10, 6)).toBe(false); // Saturday
    expect(bossHours(7, 3)).toBe(false);
    expect(bossHours(19, 3)).toBe(false);
    expect(bossHours(12, 3)).toBe(false);
    expect(bossHours(13.6, 3)).toBe(true);
  });

  it('sees a few tiles around, in every direction', () => {
    expect(inSight({ tx: 10, ty: 10 }, { tx: 10 + BOSS_SIGHT, ty: 10 - BOSS_SIGHT })).toBe(true);
    expect(inSight({ tx: 10, ty: 10 }, { tx: 11 + BOSS_SIGHT, ty: 10 })).toBe(false);
  });

  it('walks the rooms west to east, at most a few', () => {
    const stops = [{ tx: 70 }, { tx: 40 }, { tx: 90 }, { tx: 50 }, { tx: 120 }, { tx: 60 }];
    const order = patrolOrder(stops);
    expect(order).toHaveLength(BOSS_MAX_ROOMS);
    expect(order.map((s) => s.tx)).toEqual([40, 50, 60, 70]);
  });
});
