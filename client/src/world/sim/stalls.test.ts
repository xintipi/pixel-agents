// Customers from the street at the iced tea stall and the bánh mì cart: passers-by walking up, riders pulling over
// (getting off for a glass, or waiting on the bike for the bánh mì vendor to bring it to the curb).
import { describe, expect, it } from 'vitest';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BANHMI_CART, BANHMI_PARKS } from './banhmi';
import { Sim } from './sim';
import { TEA_PARK } from './tea';

const T0 = new Date(2026, 9, 23, 7, 0).getTime();
const appearance = { top: '#3f7fd8', look: 'm', accessory: 'none', lanyard: null } as unknown as Appearance;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

/** An empty office at `hour`, with the stalls set up. */
function morning(hour: number): { sim: Sim; step: (s: number, until: () => boolean) => void } {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
  sim.hourOverride = hour;
  sim.streetCustomers = false;
  const clock = { now: T0 };
  sim.applySnapshot({ rev: 1, serverTime: T0, rooms: [], agents: [], accounts: [], meta: { demo: true, sources: [], startedAt: T0, version: 't' } }, clock.now);
  const step = (seconds: number, until: () => boolean) => {
    for (let i = 0; i < seconds * 30; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      if (until()) return;
    }
  };
  step(120, () => sim.teaUp && sim.banhmiUp);
  return { sim, step };
}

describe('customers from the street at the tea stall', () => {
  it('a passer-by sits down for a glass and walks on', () => {
    const { sim, step } = morning(8);
    expect(sim.teaUp).toBe(true);
    sim.teaGuestNow('walk');
    const guest = () => sim.extras.find((e) => e.id.startsWith('npc:khach:'));
    expect(guest()).toBeDefined();
    let drank = false;
    step(120, () => {
      const g = guest();
      if (g && g.seated && g.held === 'water') drank = true;
      return drank;
    });
    expect(drank).toBe(true);
    step(200, () => !guest());
    expect(guest()).toBeUndefined();
    expect(sim.tea.taken.every((t) => !t)).toBe(true);
  });

  it('a rider called over gets off at the stall, drinks and is sent back to the bike', () => {
    const { sim, step } = morning(12);
    sim.teaGuestNow('bike');
    expect(sim.dinerCalls).toEqual([{ x: TEA_PARK.x, y: TEA_PARK.y, tag: 'tea', stays: false }]);
    // only one bike at a time for the spot
    sim.teaGuestNow('bike');
    expect(sim.dinerCalls).toHaveLength(1);
    sim.dinerCalls.length = 0;
    sim.dinerParked(4242, 'tea', T0);
    const rider = () => sim.extras.find((e) => e.id === 'npc:khach-xe:4242');
    let drank = false;
    step(120, () => {
      if (rider()?.held === 'water') drank = true;
      return drank;
    });
    expect(drank).toBe(true);
    step(300, () => sim.dinersDone.includes(4242));
    expect(sim.dinersDone).toContain(4242);
  });
});

describe('customers from the street at the bánh mì cart', () => {
  it('a passer-by buys one to go and walks on holding it', () => {
    const { sim, step } = morning(7.5);
    expect(sim.banhmiUp).toBe(true);
    sim.banhmiGuestNow('walk');
    const guest = () => sim.extras.find((e) => e.id.startsWith('npc:khach:'));
    let carried = false;
    step(120, () => {
      const g = guest();
      if (g && !sim.banhmi.taken.includes(g.id) && (g.held === 'banhmi' || g.held === 'xoi')) carried = true;
      return carried;
    });
    expect(carried).toBe(true);
    step(200, () => !guest());
    expect(guest()).toBeUndefined();
  });

  it('a rider stops by the curb, the vendor brings it over (the cart stays put) and walks back', () => {
    const { sim, step } = morning(7.5);
    sim.banhmiGuestNow('bike');
    sim.banhmiGuestNow('bike');
    expect(sim.dinerCalls.map((c) => c.tag)).toEqual(['banhmi:0', 'banhmi:1']);
    expect(sim.dinerCalls.every((c) => c.stays)).toBe(true);
    sim.dinerCalls.length = 0;
    const vendor = sim.extras.find((e) => e.id === 'npc:banh-mi')!;
    const home = { x: vendor.x, y: vendor.y };
    const cart = sim.banhmiCart();
    expect(cart?.x).toBe(BANHMI_CART.x);
    sim.dinerParked(99, 'banhmi:1', T0);
    let atCurb = false;
    step(60, () => {
      if (Math.abs(vendor.x - (BANHMI_PARKS[1].x + 20)) < 2 && vendor.held) atCurb = true;
      if (atCurb) expect(sim.banhmiCart()).toEqual(cart);
      return sim.dinersDone.includes(99);
    });
    expect(atCurb).toBe(true);
    expect(sim.dinersDone).toContain(99);
    step(60, () => vendor.x === home.x && vendor.y === home.y);
    expect({ x: vendor.x, y: vendor.y }).toEqual(home);
    expect(sim.banhmiCart()).toEqual(cart);
  });

  it('at closing, riders still waiting ride on', () => {
    const { sim, step } = morning(9.4);
    sim.dinerParked(5, 'banhmi:0', T0);
    sim.dinerParked(6, 'banhmi:1', T0);
    sim.hourOverride = 9.6;
    step(30, () => sim.dinersDone.includes(5) && sim.dinersDone.includes(6));
    expect(sim.dinersDone).toEqual(expect.arrayContaining([5, 6]));
  });
});
