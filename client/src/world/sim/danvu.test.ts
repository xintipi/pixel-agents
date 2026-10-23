// Evening folk dance: the hours, the routine in step (and a beat late), and in the simulation the aunties walking in,
// an idle agent joining the back row and everyone going home at the end.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BEAT_MS, DANCERS, DANCER_SLOTS, JOIN_SLOTS, danceMove, danceTime } from './danvu';
import { Sim } from './sim';

describe('evening dance', () => {
  it('happens in the evening only', () => {
    expect(danceTime(19.2)).toBe(true);
    expect(danceTime(20.4)).toBe(true);
    expect(danceTime(18.9)).toBe(false);
    expect(danceTime(21)).toBe(false);
  });

  it('the routine changes every two beats, and whoever lags does the previous move', () => {
    expect(danceMove(0)).toEqual(danceMove(BEAT_MS));
    const moves = new Set(Array.from({ length: 16 }, (_, i) => JSON.stringify(danceMove(i * BEAT_MS * 2))));
    expect(moves.size).toBeGreaterThan(3);
    expect(danceMove(4 * BEAT_MS, 2)).toEqual(danceMove(2 * BEAT_MS));
  });

  it('every place is distinct (aunties and joiners)', () => {
    const all = [...DANCER_SLOTS, ...JOIN_SLOTS].map((s) => `${s.x},${s.y}`);
    expect(new Set(all).size).toBe(all.length);
    expect(DANCER_SLOTS.length).toBe(DANCERS);
  });
});

const T0 = new Date(2026, 9, 23, 19, 5).getTime();
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

describe('evening dance in the office', () => {
  it('the aunties dance in step, an idle agent joins a beat late, and at the end everyone goes home', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    sim.hourOverride = 19.1;
    const clock = { now: T0 };
    sim.applySnapshot(snap(), clock.now);
    const step = (seconds: number, until: () => boolean) => {
      for (let i = 0; i < seconds * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        if (until()) return;
      }
    };
    const dancers = () => sim.extras.filter((e) => e.id.startsWith('npc:danvu:'));
    step(120, () => dancers().filter((d) => d.danceLag === 0).length === DANCERS);
    expect(dancers().filter((d) => d.danceLag === 0)).toHaveLength(DANCERS);
    expect(sim.danceUp()).toBe(true);
    // all in step: the same pose at the same time
    expect(new Set(dancers().map((d) => d.pose)).size).toBe(1);
    const ana = sim.chars.get('ana')!;
    step(900, () => ana.danceLag === 1);
    expect(ana.danceLag).toBe(1);
    // the hour is over: the aunties walk off, the agent goes back in
    sim.hourOverride = 21;
    step(240, () => dancers().length === 0 && ana.danceLag === null && !ana.outdoors);
    expect(dancers()).toHaveLength(0);
    expect(ana.danceLag).toBeNull();
    expect(ana.outdoors).toBeNull();
  });
});
