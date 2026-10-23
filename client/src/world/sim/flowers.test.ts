// Flower bike: the month's flowers, when she comes by and, in the simulation, an idle agent buying a bunch that ends up
// in a vase on their desk.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { endOfDay, flowerOfMonth, flowerWindow } from './flowers';
import { Sim } from './sim';

describe('flower bike', () => {
  it('brings the flowers of the month', () => {
    expect(flowerOfMonth(1).kind).toBe('dao');
    expect(flowerOfMonth(4).kind).toBe('loaken');
    expect(flowerOfMonth(6).kind).toBe('sen');
    expect(flowerOfMonth(10).kind).toBe('cuc');
    expect(flowerOfMonth(11).kind).toBe('hoami');
    expect(flowerOfMonth(10).held).toBe('bouquet_yellow');
  });

  it('comes by early in the morning and mid-afternoon', () => {
    expect(flowerWindow(8.2)).toBe(0);
    expect(flowerWindow(15.6)).toBe(1);
    expect(flowerWindow(12)).toBe(-1);
  });

  it('the vase lasts until the end of the day', () => {
    const now = new Date(2026, 9, 23, 8, 30).getTime();
    const end = new Date(endOfDay(now));
    expect(end.getDate()).toBe(23);
    expect(end.getHours()).toBe(23);
  });
});

const T0 = new Date(2026, 9, 23, 8, 10).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

function snap(): OfficeSnapshot {
  const ana: AgentInfo = {
    id: 'ana',
    kind: 'main',
    roomId: '/a',
    name: 'ana',
    look: 'f',
    role: 'Main agent',
    sessionId: 's-ana',
    account: '.claude',
    status: 'idle',
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 4242,
  };
  return {
    rev: 1,
    serverTime: T0,
    rooms: [{ id: '/a', name: 'a', path: '/a', slot: 0, seed: 7, createdAt: T0 }],
    agents: [ana],
    accounts: [{ id: '.claude', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

describe('flower bike in the office', () => {
  it('an idle agent buys a bunch, carries it in and leaves it in a vase on the desk', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.monthOverride = 11;
    // outside her windows: only the debug call brings her
    sim.hourOverride = 11;
    const clock = { now: T0 };
    sim.applySnapshot(snap(), clock.now);
    const step = (seconds: number, until: () => boolean) => {
      for (let i = 0; i < seconds * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        if (until()) return;
      }
    };
    step(1, () => false);
    expect(sim.flowersNow()).toBe(true);
    expect(sim.flowersNow()).toBe(false); // one bike at a time
    expect(sim.flowerKind).toBe('hoami');
    const ana = sim.chars.get('ana')!;
    let carried = false;
    step(400, () => {
      if (ana.held === 'bouquet_white') carried = true;
      return sim.deskFlowers.size > 0;
    });
    expect(carried).toBe(true);
    expect([...sim.deskFlowers.values()][0].kind).toBe('hoami');
    expect(ana.outdoors).toBeNull();
  });
});
