// Night hủ tiếu cart: the hours, the boy's beat and, in the simulation, an idle agent ordering from the desk, the boy
// carrying the bowl in, and both going home at closing.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { TILE } from '../constants';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BOY_BEAT, DINER_PARK, hutieuOpen, nextBeat } from './hutieu';
import { Traffic, type TrafficEnv, type Vehicle } from './traffic';
import { STREET_H, STREET_Y } from '../layout/exterior';
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

describe('a rider pulling over on the street', () => {
  it('the next eastbound rider parks at the spot, and rides on when done', () => {
    const env: TrafficEnv = { x0: -400, x1: 1200, lanes: [{ y: STREET_Y + 29, dir: 1 }, { y: STREET_Y + 69, dir: -1 }], sidewalkY: STREET_Y + STREET_H };
    let r = 0.37;
    const t = new Traffic(() => (r = (r * 9301 + 49297) % 233280 / 233280));
    t.forced = false;
    const bike: Vehicle = { kind: 'bike', x: DINER_PARK.x - 200, y: env.lanes[0].y - 4, dir: 1, speed: 50, want: 50, laneY: env.lanes[0].y, ty: env.lanes[0].y - 4, variant: 77, riders: 1, stuck: 0, sidewalk: 0 };
    t.vehicles.push(bike);
    let now = 1_000;
    t.dinerCalls = [{ x: DINER_PARK.x, y: DINER_PARK.y, until: now + 60_000, tag: 'hutieu' }];
    for (let i = 0; i < 20 * 30 && !t.diners.length; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 19, 3);
    }
    expect(t.diners).toEqual([{ variant: 77, tag: 'hutieu' }]);
    expect(bike.phase).toBe('parked');
    expect(bike.x).toBe(DINER_PARK.x);
    t.dinerLeave(77);
    for (let i = 0; i < 10 * 30; i++) {
      now += 1000 / 30;
      t.step(now, 1 / 30, env, 19, 3);
    }
    expect(bike.x).toBeGreaterThan(DINER_PARK.x + 50);
  });
});

describe('customers at the hủ tiếu stools', () => {
  /** A sim at 19:00 with the cart parked (and `agents` in the office). */
  function evening(agents: AgentInfo[] = []): { sim: Sim; step: (s: number, until: () => boolean) => void } {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 19;
    const clock = { now: T0 };
    sim.applySnapshot({ ...snap(), agents, rooms: agents.length ? snap().rooms : [] }, clock.now);
    const step = (seconds: number, until: () => boolean) => {
      for (let i = 0; i < seconds * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        if (until()) return;
      }
    };
    step(120, () => sim.hutieuUp);
    return { sim, step };
  }

  it('a passer-by walks up, sits on a stool with a bowl, and walks on', () => {
    const { sim, step } = evening();
    expect(sim.hutieuUp).toBe(true);
    sim.hutieuGuestNow('walk');
    const guest = () => sim.extras.find((e) => e.id.startsWith('npc:khach:'));
    expect(guest()).toBeDefined();
    let ate = false;
    step(120, () => {
      const g = guest();
      if (g && g.seated && g.held === 'hutieu') ate = true;
      return ate;
    });
    expect(ate).toBe(true);
    step(200, () => !guest());
    expect(guest()).toBeUndefined();
    expect(sim.hutieuStools.taken.every((t) => !t)).toBe(true);
  });

  it('a rider who pulled over gets off, eats, and is sent back to the bike', () => {
    const { sim, step } = evening();
    sim.dinerParked(4242, 'hutieu', T0);
    const rider = () => sim.extras.find((e) => e.id === 'npc:khach-xe:4242');
    expect(rider()).toBeDefined();
    let ate = false;
    step(120, () => {
      if (rider()?.held === 'hutieu') ate = true;
      return ate;
    });
    expect(ate).toBe(true);
    step(200, () => sim.dinersDone.includes(4242));
    expect(sim.dinersDone).toContain(4242);
  });

  it('an idle agent walks out to eat at the stools and comes back in', () => {
    const { sim, step } = evening([snap().agents[0]]);
    const ana = sim.chars.get('ana')!;
    step(20, () => false);
    expect(sim.hutieuOutNow()).toBe(1);
    let ate = false;
    step(200, () => {
      if (ana.outdoors && ana.seated && ana.held === 'hutieu') ate = true;
      return ate;
    });
    expect(ate).toBe(true);
    step(300, () => !ana.outdoors && ana.atSpot === ana.homeSpot);
    expect(ana.outdoors).toBeNull();
  });
});

describe('hủ tiếu cart and the garbage cart', () => {
  it('at 19:00 the boy runs out with the bag and hands it to the sweeper by the curb', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    sim.hourOverride = 18.9;
    const clock = { now: T0 };
    sim.applySnapshot({ ...snap(), agents: [], rooms: [] }, clock.now);
    const step = (seconds: number, until: () => boolean) => {
      for (let i = 0; i < seconds * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        if (until()) return;
      }
    };
    const boy = () => sim.extras.find((e) => e.id === 'npc:hutieu-go');
    step(120, () => !!boy());
    expect(boy()).toBeDefined();
    sim.hourOverride = 19.05;
    let handed = false;
    step(240, () => {
      const b = boy();
      const cart = sim.trashCart();
      if (b && cart && b.held === 'box' && Math.abs(b.x - cart.x) < 50) handed = true;
      return handed;
    });
    expect(handed).toBe(true);
    // she moves on, the boy goes back to his beat
    step(240, () => !sim.trashCart());
    expect(sim.trashCart()).toBeNull();
    expect(boy()).toBeDefined();
  });
});

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
