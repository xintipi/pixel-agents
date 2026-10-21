// Thần Tài altar: the pure rules (sim/altar.ts) and the trip to the reception in the simulation.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS, tetDay } from '../api';
import { layoutReception } from '../layout/core';
import {
  ALTAR_COOLDOWN_MS,
  ALTAR_WAIT_MS,
  INCENSE_MS,
  altarState,
  cooldownOver,
  dayKey,
  isViaThanTai,
  morningDue,
  prayerLine,
  waitingLong,
} from './altar';
import { Sim } from './sim';

const T0 = 1_700_000_000_000;

describe('altar: regras', () => {
  it('só quem espera o usuário há 2 min conta', () => {
    expect(waitingLong('wait', 'waiting', T0 - ALTAR_WAIT_MS, T0)).toBe(true);
    expect(waitingLong('wait', 'waiting', T0 - ALTAR_WAIT_MS + 1, T0)).toBe(false);
    expect(waitingLong('idle', 'waiting', T0 - 10 * ALTAR_WAIT_MS, T0)).toBe(false);
    expect(waitingLong('work', 'working', T0 - 10 * ALTAR_WAIT_MS, T0)).toBe(false);
  });

  it('intervalo entre rezas no escritório todo', () => {
    expect(cooldownOver(0, T0)).toBe(true);
    expect(cooldownOver(T0 - ALTAR_COOLDOWN_MS + 1, T0)).toBe(false);
    expect(cooldownOver(T0 - ALTAR_COOLDOWN_MS, T0)).toBe(true);
  });

  it('incenso da manhã: uma vez por dia, das 7h às 11h', () => {
    expect(morningDue(6.9, T0, '')).toBe(false);
    expect(morningDue(7, T0, '')).toBe(true);
    expect(morningDue(10.9, T0, '')).toBe(true);
    expect(morningDue(11, T0, '')).toBe(false);
    expect(morningDue(8, T0, dayKey(T0))).toBe(false);
    expect(morningDue(8, T0 + 86_400_000, dayKey(T0))).toBe(true);
  });

  it('Vía Thần Tài é o mùng 10 (9 dias depois do Tết) e muda o estado do altar', () => {
    const tet = tetDay(2026)!;
    const via = new Date(tet.getFullYear(), tet.getMonth(), tet.getDate() + 9, 10).getTime();
    expect(isViaThanTai(via)).toBe(true);
    expect(isViaThanTai(via - 86_400_000)).toBe(false);
    expect(altarState(via + INCENSE_MS, via)).toBe(3);
    expect(altarState(0, via)).toBe(2);
    expect(altarState(T0 + 1, T0)).toBe(1);
    expect(altarState(T0, T0)).toBe(0);
  });

  it('frases curtas para os dois motivos', () => {
    for (const why of ['wait', 'morning'] as const) {
      for (const r of [0, 0.5, 0.99]) expect(prayerLine(() => r, why)).toMatch(/🙏$/);
    }
  });

  it('o altar fica na recepção, com o ponto de uso livre na frente', () => {
    const reception = layoutReception();
    const altar = reception.furniture.find((f) => f.kind === 'altar')!;
    const spot = reception.spots.find((s) => s.kind === 'altar')!;
    expect(altar).toBeDefined();
    expect(spot.furnitureId).toBe(altar.id);
    expect(spot.ty).toBe(altar.ty + 1);
    expect(spot.dir).toBe('up');
  });
});

// ------------------------------------------------------------------ simulation

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const appearance = {
  skin: '#f0c8a0',
  hair: '#3a2a20',
  hairStyle: 'short',
  eyes: '#222',
  top: '#3f7fd8',
  topAccent: '#fff',
  topStyle: 'tshirt',
  bottom: '#333',
  shoes: '#111',
  accessory: 'none',
  accessoryColor: '#000',
  lanyard: null,
  look: 'm',
} as Appearance;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;

const room = (id: string, slot: number): RoomInfo => ({ id, name: id.slice(1), path: id, slot, seed: slot * 99 + 7, createdAt: T0 });

function agent(id: string, status: AgentInfo['status'], extra: Partial<AgentInfo> = {}): AgentInfo {
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
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 1234567,
    ...extra,
  };
}

const snap = (agents: AgentInfo[]): OfficeSnapshot => ({
  rev: 1,
  serverTime: T0,
  rooms: [room('/a', 0)],
  agents,
  accounts: [{ id: '.claude', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
  meta: { demo: true, sources: [], startedAt: T0, version: 't' },
});

function newSim(hour: number, visit = false): Sim {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { visit });
  sim.hourOverride = hour;
  return sim;
}

/** Runs `seconds` at 30 fps; returns whether someone stood at the altar and the lines said there. */
function watch(sim: Sim, clock: { now: number }, seconds: number): { prayed: Set<string>; lines: Set<string> } {
  const spot = sim.spots.ofKind('altar')[0];
  const prayed = new Set<string>();
  const lines = new Set<string>();
  for (let i = 0; i < seconds * 30; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    for (const ch of sim.chars.values()) {
      if (Math.abs(ch.x - spot.x) < 1 && Math.abs(ch.y - spot.y) < 1) {
        prayed.add(ch.id);
        if (ch.sayUntil > clock.now) lines.add(ch.sayText);
      }
    }
  }
  return { prayed, lines };
}

describe('altar: na simulação', () => {
  it('agente esperando há muito tempo: um colega à toa vai acender incenso e rezar, e volta', () => {
    const sim = newSim(15);
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('bia', 'waiting', { statusSince: T0 - 3 * 60_000 }), agent('caio', 'idle')]), clock.now);
    const { prayed, lines } = watch(sim, clock, 240);
    expect(prayed.has('caio')).toBe(true);
    expect(prayed.has('bia')).toBe(false);
    expect([...lines].some((l) => l.endsWith('🙏'))).toBe(true);
    expect(sim.altarLitUntil).toBeGreaterThan(T0);
    // the incense is lit (smoke) until it burns out
    expect(sim.altarState(sim.altarLitUntil - 1) & 1).toBe(1);
  });

  it('espera curta, de tarde: ninguém vai ao altar', () => {
    const sim = newSim(15);
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('bia', 'waiting', { statusSince: T0 }), agent('caio', 'idle')]), clock.now);
    const { prayed } = watch(sim, clock, 100);
    expect(prayed.size).toBe(0);
    expect(sim.altarLitUntil).toBe(0);
  });

  it('de manhã, alguém acende o incenso do dia (uma vez só)', () => {
    const sim = newSim(8);
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('caio', 'idle')]), clock.now);
    const first = watch(sim, clock, 120);
    expect(first.prayed.has('caio')).toBe(true);
    const lit = sim.altarLitUntil;
    expect(lit).toBeGreaterThan(T0);
    watch(sim, clock, 60);
    expect(sim.altarLitUntil).toBe(lit);
  });

  it('na visita não tem reza (o tempo de espera lá não é real)', () => {
    const sim = newSim(8, true);
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('bia', 'waiting', { statusSince: T0 - 10 * 60_000 }), agent('caio', 'idle')]), clock.now);
    const { prayed } = watch(sim, clock, 60);
    expect(prayed.size).toBe(0);
    expect(sim.altarNow()).toBe(false);
  });

  it('debug: altarNow manda alguém agora', () => {
    const sim = newSim(15);
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('caio', 'idle')]), clock.now);
    watch(sim, clock, 1);
    expect(sim.altarNow()).toBe(true);
    expect(watch(sim, clock, 60).prayed.has('caio')).toBe(true);
  });
});
