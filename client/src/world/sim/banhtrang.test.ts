// Night bánh tráng nướng stand: the hours, where it stands (clear of the other evening things on the sidewalk) and, in
// the simulation, the auntie setting up, the kids buying one each, an agent walking out for one, and packing up at 22:00.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { TILE } from '../constants';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BANHTRANG_SEAT, BANHTRANG_SPOTS, BANHTRANG_STAND, banhtrangOpen, banhtrangProps, kidRouteIn, standAt, vendorRouteIn } from './banhtrang';
import { DINER_PARK, HUTIEU_CART, HUTIEU_STOOLS } from './hutieu';
import { LOTTERY_STOPS } from './lottery';
import { Sim } from './sim';
import { TEA_TABLE } from './tea';

/** Half the stand sprite's width (render/banhtrang-fx.ts). */
const HALF_W = 16;

describe('bánh tráng nướng stand', () => {
  it('grills from 20:00 to 22:00', () => {
    expect(banhtrangOpen(19.9)).toBe(false);
    expect(banhtrangOpen(20)).toBe(true);
    expect(banhtrangOpen(21.99)).toBe(true);
    expect(banhtrangOpen(22)).toBe(false);
  });

  it('she walks in beside the stand, not behind it, and ends up on her stool', () => {
    const pts = vendorRouteIn(-300);
    const end = { x: pts[pts.length - 2], y: pts[pts.length - 1] };
    expect(end).toEqual({ x: BANHTRANG_SEAT.x, y: BANHTRANG_SEAT.y });
    expect(standAt(end)).toEqual({ x: BANHTRANG_STAND.x, y: BANHTRANG_STAND.y });
    // ...with the brazier (west 14 px of the stand) clear of her (about 8 px either side of her feet)
    expect(standAt(end).x - 14).toBeGreaterThanOrEqual(end.x + 8);
    expect(banhtrangProps(null, false)).toEqual([]);
    expect(banhtrangProps(BANHTRANG_STAND, true).map((p) => p.kind)).toEqual(['banhtrang_stand', 'tea_stool']);
  });

  it('the customer spots are beside the stand, on the sidewalk, and apart from each other', () => {
    for (const s of BANHTRANG_SPOTS) {
      expect(s.x - BANHTRANG_STAND.x).toBeGreaterThanOrEqual(HALF_W + 2);
      expect(s.y).toBeGreaterThan(31 * TILE);
      expect(s.y).toBeLessThan(33 * TILE);
      const pts = kidRouteIn(-300, s);
      expect(pts.slice(-2)).toEqual([s.x, s.y]);
    }
    for (let i = 0; i < BANHTRANG_SPOTS.length; i++)
      for (let j = i + 1; j < BANHTRANG_SPOTS.length; j++) {
        const a = BANHTRANG_SPOTS[i];
        const b = BANHTRANG_SPOTS[j];
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(8);
      }
  });

  it('stays clear of the tea stall, the hủ tiếu cart, the bánh bao stop and the lamp posts', () => {
    const left = BANHTRANG_SEAT.x - 4;
    const right = Math.max(...BANHTRANG_SPOTS.map((s) => s.x)) + 4;
    // the tea stall's stack of stools (26 px wide, 12 px left of its anchor) is west of her stool
    expect(left).toBeGreaterThan(TEA_TABLE.x - 4 + 14);
    // the hủ tiếu rider's bike, the uncle and his stools are well east of the kids
    expect(right).toBeLessThan(DINER_PARK.x - 20);
    expect(right).toBeLessThan(Math.min(HUTIEU_CART.x - 40, ...HUTIEU_STOOLS.map((s) => s.x)));
    // the bánh bao seller stops at the foot of the stone path
    expect(left).toBeGreaterThan(LOTTERY_STOPS.path.x + 60);
    expect(right).toBeLessThan(14 * TILE);
    // lamp posts every 10 tiles from x = -16 tiles
    for (let t = -16; t < 60; t += 10) expect(t * TILE < left - 2 || t * TILE >= right).toBe(true);
  });
});

const T0 = new Date(2026, 9, 23, 20, 0).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

function snap(withAgent: boolean): OfficeSnapshot {
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
    rooms: withAgent ? [{ id: '/a', name: 'a', path: '/a', slot: 0, seed: 7, createdAt: T0 }] : [],
    agents: withAgent ? [ana] : [],
    accounts: [{ id: '.claude', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

/** A sim at `hour` (no kids on their own: their window starts later), stepped until the stand is set up. */
function night(hour: number, withAgent = false): { sim: Sim; step: (s: number, until: () => boolean) => void } {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
  sim.hourOverride = hour;
  const clock = { now: T0 };
  sim.applySnapshot(snap(withAgent), clock.now);
  const step = (seconds: number, until: () => boolean) => {
    for (let i = 0; i < seconds * 30; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      if (until()) return;
    }
  };
  step(180, () => sim.banhtrang.up);
  return { sim, step };
}

const auntie = (sim: Sim) => sim.extras.find((e) => e.id === 'npc:banh-trang');
const kids = (sim: Sim) => sim.extras.filter((e) => e.id.startsWith('npc:banh-trang-kid:'));

describe('bánh tráng nướng in the simulation', () => {
  it('she carries the stand in at 20:00, sits by it, and at 22:00 packs up and goes', () => {
    const { sim, step } = night(20.1);
    expect(sim.banhtrang.up).toBe(true);
    const v = auntie(sim)!;
    expect(v.seated).toBe(true);
    expect(sim.banhtrang.stand()).toEqual({ x: BANHTRANG_STAND.x, y: BANHTRANG_STAND.y });
    sim.hourOverride = 22.05;
    step(300, () => !auntie(sim));
    expect(auntie(sim)).toBeUndefined();
    expect(sim.banhtrang.up).toBe(false);
    expect(sim.banhtrang.stand()).toBeNull();
  });

  it('is not out by day, unless forced by debug', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 15;
    let now = T0;
    sim.applySnapshot(snap(false), now);
    for (let i = 0; i < 60 * 30; i++) sim.update(1 / 30, (now += 1000 / 30));
    expect(auntie(sim)).toBeUndefined();
    expect(sim.banhtrang.forceNow(now)).toBe(true);
    for (let i = 0; i < 120 * 30 && !sim.banhtrang.up; i++) sim.update(1 / 30, (now += 1000 / 30));
    expect(sim.banhtrang.up).toBe(true);
  });

  it('the kids walk up, each buys one and walks off eating it', () => {
    const { sim, step } = night(20.1);
    const n = sim.banhtrang.kidsNow(sim.now);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
    const got = new Set<string>();
    step(240, () => {
      for (const k of kids(sim)) if (k.held === 'banhtrang') got.add(k.id);
      return got.size === n;
    });
    expect(got.size).toBe(n);
    step(300, () => kids(sim).length === 0);
    expect(kids(sim)).toHaveLength(0);
    expect(sim.banhtrang.spots.taken.every((t) => !t)).toBe(true);
  });

  it('an idle agent walks out for one, and eats it back at the desk', () => {
    const { sim, step } = night(20.1, true);
    const ana = sim.chars.get('ana')!;
    step(20, () => false);
    expect(sim.banhtrang.agentsNow()).toBe(1);
    let bought = false;
    step(200, () => {
      if (ana.outdoors && ana.held === 'banhtrang') bought = true;
      return bought;
    });
    expect(bought).toBe(true);
    let ate = false;
    step(300, () => {
      if (!ana.outdoors && ana.atSpot === ana.homeSpot && ana.held === 'banhtrang') ate = true;
      return ate;
    });
    expect(ate).toBe(true);
    expect(sim.banhtrang.spots.taken.every((t) => !t)).toBe(true);
  });
});
