// Night hủ tiếu cart: the hours, the boy's beat and, in the simulation, an idle agent ordering from the desk, the boy
// carrying the bowl in, and both going home at closing.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { TILE } from '../constants';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BOY_BEAT, hutieuOpen, nextBeat } from './hutieu';
import { Sim } from './sim';

describe('hủ tiếu cart', () => {
  it('sells from when the tea stall packs up until late', () => {
    expect(hutieuOpen(18.4)).toBe(false);
    expect(hutieuOpen(18.5)).toBe(true);
    expect(hutieuOpen(22.9)).toBe(true);
    expect(hutieuOpen(23)).toBe(false);
  });

  it("the boy's beat stays on the sidewalk and always moves a few tiles", () => {
    let x = BOY_BEAT[0];
    let r = 0.123;
    const rng = () => (r = (r * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < 50; i++) {
      const to = nextBeat(x, rng);
      expect(to).toBeGreaterThanOrEqual(BOY_BEAT[0]);
      expect(to).toBeLessThanOrEqual(BOY_BEAT[1]);
      expect(Math.abs(to - x)).toBeGreaterThanOrEqual(4 * TILE);
      x = to;
    }
  });
});

const T0 = new Date(2026, 9, 23, 19, 0).getTime();
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

describe('hủ tiếu cart in the office', () => {
  it('an idle agent orders from the desk, the boy brings the bowl in, and at closing they go home', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 19;
    const clock = { now: T0 };
    sim.applySnapshot(snap(), clock.now);
    const step = (seconds: number, until: () => boolean) => {
      for (let i = 0; i < seconds * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        if (until()) return;
      }
    };
    const ana = sim.chars.get('ana')!;
    const boy = () => sim.extras.find((e) => e.id === 'npc:hutieu-go');
    let ordered = false;
    let boyInside = false;
    step(900, () => {
      if (sim.hutieuOrders.has('ana')) ordered = true;
      const b = boy();
      if (b && b.held === 'hutieu' && b.x > 0 && b.y < 29 * TILE) boyInside = true;
      return ana.held === 'hutieu';
    });
    expect(ordered).toBe(true);
    expect(boyInside).toBe(true);
    expect(ana.held).toBe('hutieu');
    expect(ana.atSpot).toBe(ana.homeSpot);
    // closing time: the boy and the uncle walk off
    sim.hourOverride = 23.5;
    step(300, () => !sim.extras.some((e) => e.id.startsWith('npc:hutieu')));
    expect(sim.extras.some((e) => e.id.startsWith('npc:hutieu'))).toBe(false);
    expect(sim.hutieuUp).toBe(false);
  });
});
