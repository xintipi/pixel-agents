// Simulation integration without DOM: snapshots -> characters walking, sitting, turning off the light and leaving.
import { describe, expect, it } from 'vitest';
import type { AppearanceParts } from '../../../../shared/appearance';
import type { AgentInfo, OfficeSnapshot, RoomInfo, ShellJob } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import type { Character } from './character';
import { BANHMI_CART } from './banhmi';
import { SHELL_DONE_TOOL, Sim } from './sim';
import { BREAKER_TILE, GENERATOR_DARK, GENERATOR_DELAY_MS, OVERLOAD_COOLDOWN_MS, scheduledCut, stormStrike } from './outage';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const appearance: Appearance = {
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
};

const art = {
  appearanceFromSeed: () => appearance,
  roomTheme: () => theme,
} as unknown as ArtModule;

const T0 = 1_700_000_000_000;

function room(id: string, slot: number): RoomInfo {
  return { id, name: id.replace('/', ''), path: id, slot, seed: slot * 99 + 7, createdAt: T0 };
}

function agent(id: string, roomId: string, status: AgentInfo['status'], extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId,
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

function snap(rooms: RoomInfo[], agents: AgentInfo[], rev = 1): OfficeSnapshot {
  return {
    rev,
    serverTime: T0,
    rooms,
    agents,
    accounts: [{ id: '.claude', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

/** Advances the simulation in steps of 1/30 s. */
function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

function newSim(): Sim {
  return new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }));
}

describe('simulação do escritório', () => {
  it('carga inicial: quem trabalha já está sentado digitando, sala acesa', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('bia', '/a', 'waiting', { waitingFor: 'aprovar' })]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    const bia = sim.chars.get('bia')!;
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.pose).toBe('type');
    expect(bia.pose).toBe('raise_hand');
    expect(bia.mode).toBe('wait');
    const r = sim.rooms.get('/a')!;
    expect(r.phase).toBe('ready');
    expect(r.lightOn).toBe(true);
  });

  it('chegada: sala nova é construída apagada, o primeiro acende a luz e senta', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 0.2);
    sim.applySnapshot(snap([room('/a', 0), room('/b', 1)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    expect(b.phase).toBe('building');
    expect(b.lightOn).toBe(false);
    const caio = sim.chars.get('caio')!;
    expect(caio.step?.t ?? caio.queue[0]?.t).toBe('elevOut');
    run(sim, clock, 60, () => !!caio.homeSpot && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length);
    expect(b.phase).toBe('ready');
    expect(b.lightOn).toBe(true);
    expect(caio.atSpot).toBe(caio.homeSpot);
    run(sim, clock, 0.1);
    expect(caio.pose).toBe('type');
  });

  it('chegada: mudar de status a caminho do interruptor não deixa a sala no escuro', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 0.2);
    const rooms = [room('/a', 0), room('/b', 1)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    const caio = sim.chars.get('caio')!;
    run(sim, clock, 3);
    expect(b.lightOn).toBe(false);
    expect(b.switchClaim).toBe('caio');
    // still walking to the light switch: the status changes twice (the plan is redone)
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'waiting', { waitingFor: 'aprovar' })], 3), clock.now);
    run(sim, clock, 0.5);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 4), clock.now);
    run(sim, clock, 60, () => b.lightOn && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length);
    expect(b.lightOn).toBe(true);
    expect(caio.atSpot).toBe(caio.homeSpot);
  });

  it('saída: quem acabou de acender a luz e já precisa ir embora apaga de novo ao sair', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 0.2);
    const rooms = [room('/a', 0), room('/b', 1)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    const caio = sim.chars.get('caio')!;
    run(sim, clock, 60, () => caio.step?.t === 'switch');
    expect(caio.step?.t).toBe('switch');
    // the session ends right in the middle of the light switch click
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'offline')], 3), clock.now);
    run(sim, clock, 20, () => caio.leaving && !b.lightOn);
    expect(b.lightOn).toBe(false);
    // still on the way to the elevator when the light goes off
    expect(sim.chars.has('caio')).toBe(true);
    run(sim, clock, 90, () => !sim.rooms.has('/b'));
    expect(sim.rooms.has('/b')).toBe(false);
  });

  it('saída: o último apaga a luz, vai ao elevador, some e a sala é desmontada', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working'), agent('davi', '/b', 'idle')]), clock.now);
    run(sim, clock, 0.5);
    // sessions of room /b end: caio goes offline, davi vanishes from the snapshot
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'offline')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    expect(b.listed).toBe(false);
    expect(sim.chars.get('caio')!.mode).toBe('leave');
    // davi only leaves after the 3 s debounce
    run(sim, clock, 1);
    expect(sim.chars.get('davi')!.leaving).toBe(false);
    run(sim, clock, 3);
    expect(sim.chars.get('davi')!.leaving).toBe(true);
    // exactly one of them takes charge of the light switch
    expect(b.switchClaim).not.toBeNull();
    run(sim, clock, 90, () => !b.lightOn);
    expect(b.lightOn).toBe(false);
    run(sim, clock, 90, () => !sim.chars.has('caio') && !sim.chars.has('davi'));
    expect(sim.chars.has('caio')).toBe(false);
    expect(sim.chars.has('davi')).toBe(false);
    run(sim, clock, 10, () => !sim.rooms.has('/b'));
    expect(sim.rooms.has('/b')).toBe(false);
    // the other room stays lit
    expect(sim.rooms.get('/a')!.lightOn).toBe(true);
  });

  it('de moto: quem chega de moto espera estacionar, sobe o caminho e, ao sair, volta para a moto e vai embora nela', () => {
    const sim = newSim();
    sim.bikes = true;
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1), room('/c', 2)];
    sim.applySnapshot(snap(rooms, []), clock.now);
    run(sim, clock, 0.5);
    const ids = ['ana', 'bia', 'caio', 'davi', 'edu', 'fê'];
    const who = (id: string, i: number) => agent(id, rooms[i % 3].id, 'working', { seed: 1000 + i * 7919 });
    sim.applySnapshot(snap(rooms, ids.map(who)), clock.now);
    const trips = [...sim.bikeTrips];
    sim.bikeTrips.length = 0;
    // some by bike, the rest by elevator; each bike in its own spot
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.length).toBeLessThan(ids.length);
    expect(new Set(trips.map((t) => t.slot)).size).toBe(trips.length);
    const rider = sim.chars.get(trips[0].id)!;
    run(sim, clock, 5);
    // still riding in: hidden until the street says the bike parked
    expect(rider.alpha).toBe(0);
    for (const t of trips) sim.bikeParked.add(t.id);
    run(sim, clock, 1);
    expect(rider.alpha).toBe(1);
    expect(rider.outdoors).not.toBeNull();
    run(sim, clock, 40, () => rider.outdoors === null);
    expect(rider.outdoors).toBeNull();
    // the session ends: back out to the bike and off on it
    sim.applySnapshot(snap(rooms, ids.map(who).filter((a) => a.id !== rider.info.id), 2), clock.now);
    run(sim, clock, 90, () => sim.bikeTrips.some((t) => t.t === 'depart'));
    expect(sim.bikeTrips).toMatchObject([{ t: 'depart', id: rider.info.id, slot: trips[0].slot }]);
    run(sim, clock, 1);
    expect(sim.chars.has(rider.info.id)).toBe(false);
    expect(sim.parkedBikes.has(rider.info.id)).toBe(false);
  });

  it('vé số: a vendedora passa, um ocioso desce para comprar e às 16h15 confere o bilhete', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1)];
    const ids = ['ana', 'bia', 'caio', 'davi', 'edu', 'fê'];
    sim.hourOverride = 10;
    sim.applySnapshot(snap(rooms, ids.map((id, i) => agent(id, rooms[i % 2].id, 'idle', { seed: 2000 + i * 7919 }))), clock.now);
    run(sim, clock, 1);
    // she's out from 8:00: the first round starts right away
    expect(sim.extras.some((e) => e.id === 'npc:ve-so')).toBe(true);
    run(sim, clock, 120, () => sim.lotteryHolders.size > 0);
    expect(sim.lotteryHolders.size).toBeGreaterThan(0);
    const holder = sim.chars.get([...sim.lotteryHolders][0])!;
    // she walks on once everyone who came down has bought
    run(sim, clock, 300, () => !sim.extras.some((e) => e.id === 'npc:ve-so'));
    expect(sim.extras.some((e) => e.id === 'npc:ve-so')).toBe(false);
    // the draw at 16:15: tickets checked once, the holder reacts
    sim.hourOverride = 16.5;
    run(sim, clock, 2);
    expect(sim.lotteryHolders.size).toBe(0);
    expect(holder.icon === 'coin' || holder.icon === 'storm').toBe(true);
    expect(sim.lotteryDraw(clock.now).buyers).toEqual([]);
  });

  it('vá xe: o mecânico abre a banca, levanta para consertar a moto e vai embora no fim da tarde', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 10;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 60, () => sim.repairUp);
    expect(sim.repairUp).toBe(true);
    const mech = sim.extras.find((e) => e.id === 'npc:sua-xe')!;
    run(sim, clock, 2);
    expect(mech.pose).toBe('read');
    sim.repairBusy = true;
    run(sim, clock, 2);
    expect(mech.pose).toBe('use');
    sim.repairBusy = false;
    run(sim, clock, 5);
    expect(mech.pose).toBe('read');
    sim.hourOverride = 19;
    run(sim, clock, 120, () => !sim.extras.includes(mech));
    expect(sim.extras.includes(mech)).toBe(false);
    expect(sim.repairUp).toBe(false);
  });

  it('loa phường: às 6h e às 17h lê os avisos uma vez e alguém reclama', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 5.9;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 3);
    expect(sim.loaSay()).toBeNull();
    sim.hourOverride = 6.05;
    run(sim, clock, 2);
    const first = sim.loaSay();
    expect(first).not.toBeNull();
    run(sim, clock, 10);
    expect(sim.loaSay()!.text).not.toBe(first!.text);
    run(sim, clock, 60);
    expect(sim.loaSay()).toBeNull();
    expect([...sim.people()].some((c) => c.sayText && !sim.extras.includes(c))).toBe(true);
    // once per window: not again this morning, but again at 17h
    run(sim, clock, 5);
    expect(sim.loaSay()).toBeNull();
    sim.hourOverride = 17.05;
    run(sim, clock, 2);
    expect(sim.loaSay()).not.toBeNull();
  });

  it('bánh bao: à noite passa uma vez, para no caminho e quem está à toa desce para comprar', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 20.4;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle'), agent('bia', '/a', 'idle'), agent('caio', '/a', 'idle')]), clock.now);
    run(sim, clock, 3);
    expect(sim.bunBike()).toBeNull();
    sim.hourOverride = 20.6;
    run(sim, clock, 2);
    const bike = sim.bunBike();
    expect(bike).not.toBeNull();
    run(sim, clock, 5);
    expect(sim.bunBike()!.x).toBeGreaterThan(bike!.x);
    let bought = false;
    run(sim, clock, 400, () => {
      bought ||= [...sim.people()].some((c) => c.held === 'banhbao');
      return !sim.bunBike();
    });
    expect(bought).toBe(true);
    expect(sim.bunBike()).toBeNull();
    run(sim, clock, 5);
    expect(sim.bunBike()).toBeNull();
    expect(sim.banhbaoNow()).toBe(true);
  });

  it('ve chai: passa de manhã e à tarde, compra as garrafas da moça do chá e segue', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 9.4;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 3);
    expect(sim.scrapBike()).toBeNull();
    sim.hourOverride = 9.6;
    run(sim, clock, 2);
    const bike = sim.scrapBike();
    expect(bike).not.toBeNull();
    run(sim, clock, 5);
    expect(sim.scrapBike()!.x).toBeGreaterThan(bike!.x);
    run(sim, clock, 300, () => !sim.scrapBike());
    expect(sim.scrapBike()).toBeNull();
    // once per window: not again this morning, but again in the afternoon
    run(sim, clock, 5);
    expect(sim.scrapBike()).toBeNull();
    sim.hourOverride = 14.6;
    run(sim, clock, 2);
    expect(sim.scrapBike()).not.toBeNull();
  });

  it('xe rác: às 19h passa uma vez, tocando o sino, e o carrinho vai junto', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 18.9;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 3);
    expect(sim.trashCart()).toBeNull();
    sim.hourOverride = 19.05;
    run(sim, clock, 2);
    const cart = sim.trashCart();
    expect(cart).not.toBeNull();
    expect(sim.sfx.some((e) => e.kind === 'trash_bell')).toBe(true);
    run(sim, clock, 5);
    expect(sim.trashCart()!.x).toBeGreaterThan(cart!.x);
    run(sim, clock, 240, () => !sim.trashCart());
    expect(sim.trashCart()).toBeNull();
    // only once a day
    run(sim, clock, 5);
    expect(sim.trashCart()).toBeNull();
    expect(sim.trashNow()).toBe(true);
  });

  it('subagente entrega o resultado ao pai e vai embora', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const main = agent('ana', '/a', 'working');
    sim.applySnapshot(snap(rooms, [main]), clock.now);
    run(sim, clock, 0.2);
    const sub = agent('ana:s1', '/a', 'working', { kind: 'sub', parentId: 'ana', name: 'Beto', title: 'Mapear arquivos' });
    sim.applySnapshot(snap(rooms, [main, sub], 2), clock.now);
    const beto = sim.chars.get('ana:s1')!;
    run(sim, clock, 60, () => beto.atSpot !== null && beto.atSpot === beto.homeSpot && !beto.step && !beto.queue.length);
    expect(beto.homeSpot).not.toBeNull();
    sim.applySnapshot(snap(rooms, [main, { ...sub, status: 'done' }], 3), clock.now);
    expect(beto.mode).toBe('deliver');
    let delivered = false;
    run(sim, clock, 40, () => {
      if (beto.bubbleText?.startsWith('Delivering')) delivered = true;
      return delivered;
    });
    expect(delivered).toBe(true);
    const ana = sim.chars.get('ana')!;
    expect(['check', 'heart']).toContain(ana.icon);
    run(sim, clock, 60, () => !sim.chars.has('ana:s1'));
    expect(sim.chars.has('ana:s1')).toBe(false);
  });

  it('ocioso passeia e volta para a mesa', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: T0 })]), clock.now);
    const ana = sim.chars.get('ana')!;
    ana.nextOutingAt = 1;
    let left = false;
    run(sim, clock, 60, () => {
      if (ana.atSpot !== ana.homeSpot) left = true;
      return left && ana.atSpot === ana.homeSpot;
    });
    expect(left).toBe(true);
    // goes back to work immediately when the status changes
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')], 2), clock.now);
    run(sim, clock, 60, () => !!ana.homeSpot && ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length);
    run(sim, clock, 0.1);
    expect(ana.pose).toBe('type');
  });

  it('quem cochila na mesa (ocioso há muito tempo) acorda ao levantar: o "zzz" não vai junto', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: T0 - 3_600_000 })]), clock.now);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 60, () => ana.atSpot === ana.homeSpot && ana.icon === 'zzz');
    expect(ana.pose).toBe('sleep');
    expect(ana.icon).toBe('zzz');
    // A round (or any plan) takes them out of place without changing the mode: still "idle for a long time".
    ana.queue.push({ t: 'exit' }, { t: 'act', pose: 'stand', ms: 4000 });
    run(sim, clock, 1.5);
    expect(ana.pose).toBe('stand');
    expect(ana.icon).toBeNull();
    // The once-per-second check doesn't give the "zzz" back to someone standing.
    run(sim, clock, 1.5);
    expect(ana.icon).toBeNull();
  });

  it('ngủ trưa: depois do almoço o ocioso cochila na mesa, quem trabalha digita, ninguém vem acordar e no fim ele se espreguiça', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 12.75;
    const rooms = [room('/a', 0)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'idle', { statusSince: T0 }), agent('bia', '/a', 'working')]), clock.now);
    const ana = sim.chars.get('ana')!;
    const bia = sim.chars.get('bia')!;
    run(sim, clock, 60, () => ana.atSpot === ana.homeSpot && ana.icon === 'zzz');
    expect(sim.siestaOn).toBe(true);
    expect(sim.longIdle(ana, clock.now)).toBe(false);
    expect(ana.pose).toBe('sleep');
    expect(ana.icon).toBe('zzz');
    expect(bia.pose).toBe('type');
    // well past the nap limit: no coworker or dog is sent, nobody goes out
    const dog = sim.pets.pets.find((p) => p.kind === 'dog')!;
    run(sim, clock, 150, () => dog.plan?.t === 'wake' || ana.pose !== 'sleep');
    expect(dog.plan?.t).not.toBe('wake');
    expect(ana.pose).toBe('sleep');
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.awakeUntil).toBe(0);
    // whoever stops working mid-siesta falls asleep too; whoever gets work wakes up and types right away
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('bia', '/a', 'idle', { statusSince: clock.now })], 2), clock.now);
    run(sim, clock, 3);
    expect(ana.pose).toBe('type');
    expect(bia.pose).toBe('sleep');
    // the end of the siesta: no startle, a stretch and back to sitting (staggered, within a few seconds)
    sim.hourOverride = 13.6;
    run(sim, clock, 20, () => bia.pose === 'stretch');
    expect(sim.siestaOn).toBe(false);
    expect(bia.pose).toBe('stretch');
    expect(bia.icon).not.toBe('alert');
    run(sim, clock, 10, () => bia.pose === 'sit');
    expect(bia.pose).toBe('sit');
  });

  it('ngủ trưa: debug.siestaNow liga e desliga; quem ainda está acordado na mesa anuncia a soneca', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 17; // outside the siesta
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: T0 })]), clock.now);
    const ana = sim.chars.get('ana')!;
    ana.nextOutingAt = Number.MAX_SAFE_INTEGER;
    run(sim, clock, 30, () => ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length);
    expect(ana.pose).toBe('sit');
    sim.siestaOverride = true;
    run(sim, clock, 2.5);
    expect(ana.sayText).toContain('😴');
    expect(ana.pose).toBe('sleep');
    expect(ana.icon).toBe('zzz');
    run(sim, clock, 5);
    expect(sim.siestaDim).toBeGreaterThan(0.9);
    sim.siestaOverride = false;
    sim.hourOverride = 12.75;
    run(sim, clock, 20, () => ana.pose === 'sit');
    expect(ana.pose).toBe('sit');
    expect(sim.siestaOn).toBe(false);
    run(sim, clock, 5);
    expect(sim.siestaDim).toBe(0);
  });

  it('avanço rápido (aba oculta) teletransporta para os destinos', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    sim.applySnapshot(snap([room('/a', 0), room('/b', 1)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    clock.now += 20_000;
    sim.fastForward(clock.now);
    const caio = sim.chars.get('caio')!;
    expect(caio.atSpot).toBe(caio.homeSpot);
    expect(caio.alpha).toBe(1);
    expect(sim.rooms.get('/b')!.phase).toBe('ready');
    expect(sim.rooms.get('/b')!.lightOn).toBe(true);
  });

  it('snapshots com falhas não quebram o mundo', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/inexistente', 'working'), agent('bia', '/a', 'working', { parentId: 'ninguem', kind: 'sub' })]), clock.now);
    run(sim, clock, 5);
    expect(sim.chars.size).toBe(2);
    // room vanishes and comes back during teardown: rebuilds
    sim.applySnapshot(snap([], [], 2), clock.now);
    run(sim, clock, 20);
    sim.applySnapshot(snap([room('/a', 0)], [agent('caio', '/a', 'working')], 3), clock.now);
    run(sim, clock, 5);
    const a = sim.rooms.get('/a');
    expect(a).toBeDefined();
    expect(['building', 'ready']).toContain(a!.phase);
  });

  it('carga inicial: ninguém começa parado em banco de corredor/banheiro e nenhuma sala fica vazia', () => {
    for (const since of [T0, T0 - 5 * 60_000]) {
      const sim = newSim();
      const clock = { now: T0 };
      const agents: AgentInfo[] = [];
      for (let i = 0; i < 12; i++) agents.push(agent(`ocioso-${String.fromCharCode(97 + i)}${'x'.repeat(i)}`, i % 2 ? '/b' : '/a', 'idle', { statusSince: since }));
      sim.applySnapshot(snap([room('/a', 0), room('/b', 1)], agents), clock.now);
      for (const ch of sim.chars.values()) {
        const at = ch.atSpot ? sim.spots.get(ch.atSpot) : undefined;
        expect(at, `${ch.id} sem lugar`).toBeDefined();
        expect(at!.kind).not.toBe('bench');
        // whoever just became idle starts at their own desk
        if (since === T0) expect(ch.atSpot).toBe(ch.homeSpot);
      }
      for (const id of ['/a', '/b']) expect([...sim.chars.values()].some((c) => c.roomId === id && c.atSpot === c.homeSpot)).toBe(true);
      // and nobody goes for a stroll in the first seconds
      run(sim, clock, 3);
      if (since === T0) for (const ch of sim.chars.values()) expect(ch.atSpot, ch.id).toBe(ch.homeSpot);
    }
  });

  it('sala lotada: quem sobra trabalha em pé DENTRO da sala (não fica rodando na recepção)', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const agents: AgentInfo[] = [];
    for (let i = 0; i < 26; i++) agents.push(agent(`ag-${i}-${'y'.repeat(i)}`, '/a', 'working'));
    sim.applySnapshot(snap([room('/a', 0)], agents), clock.now);
    run(sim, clock, 25);
    const r = sim.rooms.get('/a')!.layout.rect;
    const inside = (x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    const homeless = [...sim.chars.values()].filter((c) => !c.homeSpot);
    expect(homeless.length).toBeGreaterThan(0);
    const tiles = new Set<string>();
    for (const c of homeless) {
      expect(c.standTile, c.id).not.toBeNull();
      expect(inside(c.standTile!.x, c.standTile!.y)).toBe(true);
      expect(inside(c.tx, c.ty), `${c.id} fora da sala em ${c.tx},${c.ty}`).toBe(true);
      const key = `${c.standTile!.x},${c.standTile!.y}`;
      expect(tiles.has(key), `dois no mesmo tile ${key}`).toBe(false);
      tiles.add(key);
    }
    // stopped (not walking in circles) and working on the laptop
    const before = homeless.map((c) => `${c.tx},${c.ty}`);
    run(sim, clock, 15);
    expect(homeless.map((c) => `${c.tx},${c.ty}`)).toEqual(before);
    expect(homeless.every((c) => c.pose === 'read' && c.held === 'laptop')).toBe(true);
    // a place freed up: someone standing sits down
    const seated = [...sim.chars.values()].find((c) => c.homeSpot && c.atSpot === c.homeSpot)!;
    sim.applySnapshot(snap([room('/a', 0)], agents.filter((a) => a.id !== seated.id), 2), clock.now);
    run(sim, clock, 40, () => homeless.some((c) => !!c.homeSpot && c.atSpot === c.homeSpot));
    expect(homeless.some((c) => !!c.homeSpot && c.atSpot === c.homeSpot)).toBe(true);
  });

  it('delegar: conversa virado para a porta com 💬 (a mão levantada é só para "precisa de você")', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const main = agent('ana', '/a', 'working', { activity: { id: 'a1', kind: 'edit', icon: '✏️', text: 'Editing', at: T0 } });
    sim.applySnapshot(snap([room('/a', 0)], [main]), clock.now);
    run(sim, clock, 0.5);
    sim.applySnapshot(snap([room('/a', 0)], [{ ...main, activity: { id: 'a2', kind: 'delegate', icon: '👥', text: 'Delegando', at: T0 } }], 2), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.icon).toBe('chat');
    const poses = new Set<string>();
    run(sim, clock, 3, () => {
      poses.add(ana.pose);
      return false;
    });
    expect(poses.has('talk')).toBe(true);
    expect(poses.has('raise_hand')).toBe(false);
  });

  it('cada personagem tem ritmo e faixa próprios (quem sai junto não anda sobreposto)', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const agents = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'].map((id) => agent(id, '/a', 'working', { seed: id.charCodeAt(0) * 7919 + id.length }));
    sim.applySnapshot(snap([room('/a', 0)], agents), clock.now);
    const chars = [...sim.chars.values()];
    for (const c of chars) {
      expect(c.speedK).toBeGreaterThanOrEqual(0.92);
      expect(c.speedK).toBeLessThanOrEqual(1.08);
      expect(Math.abs(c.lane)).toBeLessThanOrEqual(4);
    }
    expect(new Set(chars.map((c) => c.speedK.toFixed(3))).size).toBeGreaterThan(1);
    expect(new Set(chars.map((c) => c.lane)).size).toBeGreaterThan(1);
  });

  it('personagem editado: seed ou peças novas no snapshot trocam a aparência de quem já está no escritório', () => {
    let calls = 0;
    const spyArt = {
      appearanceFromSeed: (seed: number, opts: { parts?: AppearanceParts } = {}) => {
        calls++;
        return { ...appearance, skin: `#${seed.toString(16).padStart(6, '0')}`, ...opts.parts };
      },
      roomTheme: () => theme,
    } as unknown as ArtModule;
    const sim = new Sim(spyArt, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }));
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working', { seed: 1 })]), clock.now);
    run(sim, clock, 0.2);
    expect(sim.chars.get('ana')!.appearance.skin).toBe('#000001');

    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working', { seed: 2, parts: { hairStyle: 'bob' } })], 2), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.appearance.skin).toBe('#000002');
    expect(ana.appearance.hairStyle).toBe('bob');

    const before = calls;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { seed: 2, parts: { hairStyle: 'bob' } })], 3), clock.now);
    expect(calls).toBe(before);
  });

  it('personagem editado: só as peças ou só o look mudando (mesma seed) também trocam a aparência', () => {
    let calls = 0;
    const spyArt = {
      appearanceFromSeed: (seed: number, opts: { look?: 'm' | 'f'; parts?: AppearanceParts } = {}) => {
        calls++;
        return { ...appearance, skin: `#${seed.toString(16).padStart(6, '0')}`, look: opts.look ?? appearance.look, ...opts.parts };
      },
      roomTheme: () => theme,
    } as unknown as ArtModule;
    const sim = new Sim(spyArt, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }));
    const clock = { now: T0 };
    let rev = 1;
    const apply = (extra: Partial<AgentInfo>): Character => {
      sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working', { seed: 1, look: 'f', ...extra })], rev++), clock.now);
      return sim.chars.get('ana')!;
    };

    expect(apply({}).appearance.hairStyle).toBe('short');

    // same seed, new pieces
    expect(apply({ parts: { hairStyle: 'buzz' } }).appearance.hairStyle).toBe('buzz');

    // same seed, different pieces
    expect(apply({ parts: { hairStyle: 'bob' } }).appearance.hairStyle).toBe('bob');

    // same seed, pieces removed: back to the fixture's
    expect(apply({ parts: undefined }).appearance.hairStyle).toBe('short');

    // same seed and same pieces, only a different look: regenerates
    apply({ parts: { hairStyle: 'bob' } });
    const before = calls;
    expect(apply({ look: 'm', parts: { hairStyle: 'bob' } }).appearance.look).toBe('m');
    expect(calls).toBe(before + 1);
  });
});

describe('salas sem buracos', () => {
  const inside = (r: { layout: { rect: { x: number; y: number; w: number; h: number } } }, c: { tx: number; ty: number }) =>
    c.tx >= r.layout.rect.x && c.tx < r.layout.rect.x + r.layout.rect.w && c.ty >= r.layout.rect.y && c.ty < r.layout.rect.y + r.layout.rect.h;

  it('carga inicial: as salas ocupam as vagas 0, 1, 2... na ordem do servidor, mesmo com buracos nos slots dele', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/c', 8), room('/a', 0), room('/b', 3)], [agent('ana', '/a', 'working'), agent('bia', '/b', 'working'), agent('caio', '/c', 'working')]), clock.now);
    expect(['/a', '/b', '/c'].map((id) => sim.rooms.get(id)!.slot)).toEqual([0, 1, 2]);
    expect(sim.building.cols).toBe(4);
  });

  it('terminal fechou: a sala mais distante se muda para a vaga, o pessoal vai andando e o prédio encolhe', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1), room('/c', 2)];
    const agents = [agent('ana', '/a', 'working'), agent('bia', '/b', 'working'), agent('caio', '/c', 'working'), agent('davi', '/c', 'idle')];
    sim.applySnapshot(snap(rooms, agents), clock.now);
    run(sim, clock, 0.5);
    const c = sim.rooms.get('/c')!;
    const caio = sim.chars.get('caio')!;
    const homeBefore = caio.homeSpot;
    expect(c.slot).toBe(2);
    expect(sim.building.cols).toBe(4);

    // the session of room /b closes: bia leaves and the room is torn down
    sim.applySnapshot(snap([room('/a', 0), room('/c', 2)], [agents[0], agent('bia', '/b', 'offline'), agents[2], agents[3]], 2), clock.now);
    run(sim, clock, 200, () => !sim.rooms.has('/b'));
    expect(sim.rooms.has('/b')).toBe(false);
    expect(c.slot).toBe(2);

    // the slot waits a bit and then room /c moves into it (rebuilt, dark)
    run(sim, clock, 3, () => c.slot === 1);
    expect(c.slot).toBe(1);
    expect(c.phase).toBe('building');
    const ghost = [...sim.rooms.values()].find((r) => r.ghost);
    expect(ghost?.slot).toBe(2);
    expect(ghost?.listed).toBe(false);
    // each one keeps their desk (now in the new room) and walks to it, without teleporting
    expect(caio.homeSpot).toBe(homeBefore);
    let maxStep = 0;
    let px = caio.x;
    let py = caio.y;
    run(sim, clock, 60, () => {
      maxStep = Math.max(maxStep, Math.hypot(caio.x - px, caio.y - py));
      px = caio.x;
      py = caio.y;
      return !sim.rooms.has(ghost!.id) && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length;
    });
    expect(maxStep).toBeLessThan(12);
    expect(caio.atSpot).toBe(caio.homeSpot);
    expect(inside(c, caio)).toBe(true);
    expect(c.phase).toBe('ready');
    expect(c.lightOn).toBe(true);
    // the old address emptied, went dark and was torn down; the building is back to one column of rooms
    expect(sim.rooms.has(ghost!.id)).toBe(false);
    run(sim, clock, 10, () => sim.building.cols === 3);
    expect(sim.building.cols).toBe(3);
    // davi (idle, maybe strolling) also has his place in the new room
    expect(c.layout.spots.some((p) => p.id === sim.chars.get('davi')!.homeSpot)).toBe(true);
  });

  it('quem está indo embora não se muda: a vaga fica até a sala dela sumir', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1), room('/c', 2)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('bia', '/b', 'working'), agent('caio', '/c', 'working')]), clock.now);
    run(sim, clock, 0.5);
    const c = sim.rooms.get('/c')!;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('bia', '/b', 'offline'), agent('caio', '/c', 'offline')], 2), clock.now);
    let moved = false;
    run(sim, clock, 240, () => {
      if (c.slot !== 2 || [...sim.rooms.values()].some((r) => r.ghost)) moved = true;
      return !sim.rooms.has('/b') && !sim.rooms.has('/c');
    });
    expect(moved).toBe(false);
    expect(sim.rooms.has('/c')).toBe(false);
    run(sim, clock, 5, () => sim.building.cols === 3);
    expect(sim.building.cols).toBe(3);
  });

  it('abre e fecha ao acaso (inclusive no meio de uma mudança): ninguém se teletransporta e no fim não sobra buraco', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const sim = newSim();
    const clock = { now: T0 };
    const ids = ['/a', '/b', '/c', '/d', '/e', '/f', '/g'];
    const open = new Map<string, number>();
    ids.slice(0, 5).forEach((id, i) => open.set(id, i));
    let nextSlot = 5;
    let rev = 1;
    const agentsOf = (id: string, status: AgentInfo['status']) => [agent(`${id}-1`, id, status), agent(`${id}-2`, id, status === 'offline' ? 'offline' : 'idle')];
    const closed = new Set<string>();
    const push = () => {
      const rs = [...open].map(([id, slot]) => room(id, slot));
      const as = [...open.keys()].flatMap((id) => agentsOf(id, 'working')).concat([...closed].flatMap((id) => agentsOf(id, 'offline')));
      sim.applySnapshot(snap(rs, as, ++rev), clock.now);
    };
    push();
    let maxStep = 0;
    // per character (whoever comes back with the same id is another character, who comes out of the elevator)
    const last = new WeakMap<object, { x: number; y: number }>();
    const track = () => {
      for (const ch of sim.chars.values()) {
        const p = last.get(ch);
        if (p && ch.visible && !ch.inside && clock.now >= ch.hiddenUntil) maxStep = Math.max(maxStep, Math.hypot(ch.x - p.x, ch.y - p.y));
        last.set(ch, { x: ch.x, y: ch.y });
      }
      return false;
    };
    for (let round = 0; round < 14; round++) {
      const roll = rnd();
      if (roll < 0.55 && open.size > 1) {
        const id = [...open.keys()][Math.floor(rnd() * open.size)];
        open.delete(id);
        closed.add(id);
      } else {
        const id = ids.find((x) => !open.has(x));
        if (id) {
          open.set(id, nextSlot++);
          closed.delete(id);
        }
      }
      push();
      run(sim, clock, 4 + rnd() * 40, track);
    }
    run(sim, clock, 400, () => {
      track();
      const rs = [...sim.rooms.values()];
      const compact = rs.every((r) => r.slot < rs.length);
      return compact && rs.every((r) => r.listed && r.phase === 'ready' && !r.ghost) && [...sim.chars.values()].every((c) => !c.leaving);
    });
    const slots = [...sim.rooms.values()].map((r) => r.slot).sort((a, b) => a - b);
    expect([...sim.rooms.keys()].sort()).toEqual([...open.keys()].sort());
    expect(slots).toEqual(slots.map((_, i) => i));
    expect([...sim.rooms.values()].some((r) => r.ghost)).toBe(false);
    run(sim, clock, 20, () => sim.building.cols === 2 + Math.ceil(open.size / 2));
    expect(sim.building.cols).toBe(2 + Math.ceil(open.size / 2));
    expect(maxStep).toBeLessThan(12);
  });

  it('sala que abre depois ocupa a primeira vaga livre', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0), room('/c', 2)], [agent('ana', '/a', 'working'), agent('caio', '/c', 'working')]), clock.now);
    expect(sim.rooms.get('/c')!.slot).toBe(1);
    run(sim, clock, 0.5);
    // the server sends the new room in a high slot; in the building it goes to slot 2
    sim.applySnapshot(snap([room('/a', 0), room('/c', 2), room('/d', 7)], [agent('ana', '/a', 'working'), agent('caio', '/c', 'working'), agent('duda', '/d', 'working')], 2), clock.now);
    expect(sim.rooms.get('/d')!.slot).toBe(2);
    expect(sim.rooms.get('/d')!.phase).toBe('building');
  });
});

describe('espera de shell', () => {
  const MIN = 60_000;
  const shell = (ageMs: number, extra: Partial<ShellJob> = {}): ShellJob => ({
    id: `b-${ageMs}`,
    label: 'Rodar a suíte completa',
    startedAt: T0 - ageMs,
    background: true,
    kind: 'shell',
    ...extra,
  });
  const done = (id: string, error = false): AgentInfo['activity'] => ({ id, kind: 'run', icon: error ? '❌' : '✅', text: 'Shell concluído', tool: SHELL_DONE_TOOL, error, at: T0 });

  it('status shell: fica na mesa com o balde de pipoca e não sai para passear', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'shell', { shells: [shell(20_000)] })]), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.mode).toBe('shell');
    expect(ana.shellCount).toBe(1);
    expect(ana.shellLabel).toBe('Rodar a suíte completa');
    ana.nextOutingAt = 1;
    run(sim, clock, 60, () => ana.atSpot !== ana.homeSpot);
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.pose).toBe('wait');
    expect(ana.held).toBe('popcorn');
    expect(ana.shellStage).toBe('popcorn');
  });

  it('a escalada segue a idade do shell mais antigo: giros, teia/bocejo e cochilo', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(4 * MIN), shell(30_000)] })]), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.shellCount).toBe(2);
    run(sim, clock, 0.2);
    expect(ana.shellStage).toBe('restless');
    expect(ana.held).toBe('none');
    const home = sim.spots.get(ana.homeSpot)!;
    const dirs = new Set<string>();
    run(sim, clock, 30, () => {
      dirs.add(ana.dir);
      return false;
    });
    // at least one full spin in the chair
    expect(dirs.size).toBe(4);
    expect(ana.dir).toBe(home.dir);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(12 * MIN + (clock.now - T0))] })], 2), clock.now);
    run(sim, clock, 0.1);
    expect(ana.shellStage).toBe('cobweb');
    let yawned = false;
    run(sim, clock, 40, () => {
      if (ana.chatEmoji === '🥱' && ana.pose === 'sleep') yawned = true;
      return yawned;
    });
    expect(yawned).toBe(true);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(26 * MIN + (clock.now - T0))] })], 3), clock.now);
    run(sim, clock, 0.1);
    expect(ana.shellStage).toBe('nap');
    expect(ana.pose).toBe('sleep');
  });

  it('passeando quando o shell começa: volta para a mesa (sai da cabine normalmente)', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'idle')]), clock.now);
    const ana = sim.chars.get('ana')!;
    ana.nextOutingAt = 1;
    run(sim, clock, 60, () => ana.atSpot !== ana.homeSpot && !!ana.step && ana.step.t !== 'exit');
    expect(ana.atSpot === ana.homeSpot).toBe(false);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(1000)] })], 2), clock.now);
    expect(ana.mode).toBe('shell');
    let ran = false;
    run(sim, clock, 60, () => {
      if (ana.pose === 'run') ran = true;
      return ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length;
    });
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ran).toBe(false);
    run(sim, clock, 0.1);
    expect(ana.pose).toBe('wait');
  });

  it('comando longo em primeiro plano: digitando nos primeiros 10 s, depois a mesma espera', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const fg = shell(0, { id: 'toolu_1', background: false });
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { shells: [fg] })]), clock.now);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 5);
    expect(ana.mode).toBe('work');
    expect(ana.pose).toBe('type');
    run(sim, clock, 7);
    expect(ana.mode).toBe('shell');
    expect(ana.pose).toBe('wait');
    expect(ana.atSpot).toBe(ana.homeSpot);
    // the command finished (tool_result): back to typing
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { shells: [] })], 2), clock.now);
    run(sim, clock, 0.2);
    expect(ana.mode).toBe('work');
    expect(ana.pose).toBe('type');
  });

  it('shell concluído: levanta, comemora com ⭐ e confete e volta a trabalhar', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const base = agent('ana', '/a', 'shell', { shells: [shell(2 * MIN)], activity: { id: 'a0', kind: 'run', icon: '💻', text: 'Rodando', at: T0 } });
    sim.applySnapshot(snap(rooms, [base]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    // the notification arrives and the agent is already back to work in the same snapshot
    sim.applySnapshot(snap(rooms, [{ ...base, status: 'working', shells: [], activity: done('a1') }], 2), clock.now);
    expect(ana.icon).toBe('star');
    expect(sim.effects.some((e) => e.kind === 'confetti' && e.charId === 'ana')).toBe(true);
    const poses = new Set<string>();
    run(sim, clock, 3, () => {
      poses.add(ana.pose);
      return false;
    });
    expect(poses.has('stretch')).toBe(true);
    run(sim, clock, 5, () => ana.atSpot === ana.homeSpot && ana.pose === 'type');
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.mode).toBe('work');
    expect(ana.pose).toBe('type');
  });

  it('fim de shell antigo não comemora na carga; um novo atrás de outra atividade comemora', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const old = done('old')!;
    const base = agent('ana', '/a', 'working', { recent: [old], activity: { id: 'a0', kind: 'edit', icon: '✏️', text: 'Editing', at: T0 } });
    sim.applySnapshot(snap(rooms, [base]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    expect(ana.icon).toBeNull();
    expect(sim.effects.length).toBe(0);
    const fresh = { ...done('new')!, at: T0 + 400 };
    const later = { id: 'a2', kind: 'read' as const, icon: '📖', text: 'Reading a saída', at: T0 + 450 };
    sim.applySnapshot(snap(rooms, [{ ...base, recent: [old, fresh, later], activity: later }], 2), clock.now);
    expect(ana.icon).toBe('star');
    expect(sim.effects.length).toBe(1);
    // the same snapshot again doesn't celebrate a second time
    sim.applySnapshot(snap(rooms, [{ ...base, recent: [old, fresh, later], activity: later }], 3), clock.now);
    expect(sim.effects.length).toBe(1);
  });

  it('erro atrás de erro: três em pouco tempo e as mãos vão à cabeça (na mesa), depois volta a digitar', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const err = (id: string) => ({ id, kind: 'error' as const, icon: '⚠️', text: 'Erro no Bash', at: T0, error: true });
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { activity: { id: 'a0', kind: 'run', icon: '💻', text: 'Rodando', at: T0 } })]), clock.now);
    run(sim, clock, 1);
    const ana = sim.chars.get('ana')!;
    expect(ana.pose).toBe('type');
    for (const [i, id] of ['e1', 'e2'].entries()) {
      sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { activity: err(id) })], 2 + i), clock.now);
      run(sim, clock, 0.5);
      expect(ana.icon).toBe('sweat');
      expect(ana.pose).toBe('type');
    }
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { activity: err('e3') })], 4), clock.now);
    run(sim, clock, 0.5);
    expect(ana.icon).toBe('storm');
    expect(ana.pose).toBe('facepalm');
    expect(ana.atSpot).toBe(ana.homeSpot);
    run(sim, clock, 5);
    expect(ana.pose).toBe('type');
  });

  it('hora do almoço: quem está à toa vai comer phở; à tarde, trà sữa; fora do horário, nada disso', () => {
    const held = (hour: number | null) => {
      const sim = newSim();
      sim.hourOverride = hour;
      const clock = { now: T0 };
      sim.applySnapshot(snap([room('/a', 0)], ['ana', 'bia', 'caio'].map((id) => agent(id, '/a', 'idle'))), clock.now);
      const seen = new Set<string>();
      for (let i = 0; i < 400 * 30; i++) {
        clock.now += 1000 / 30;
        sim.update(1 / 30, clock.now);
        for (const ch of sim.chars.values()) seen.add(ch.held);
      }
      return seen;
    };
    expect(held(12).has('noodles')).toBe(true);
    expect(held(15).has('bubbletea')).toBe(true);
    const night = held(22);
    expect(night.has('noodles') || night.has('bubbletea')).toBe(false);
  });

  it('xe bánh mì: de manhã o vendedor chega empurrando o carrinho; quem vai compra, volta e come na mesa; depois ele vai embora', () => {
    const sim = newSim();
    sim.hourOverride = 7.5;
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], ['ana', 'bia', 'caio'].map((id) => agent(id, '/a', 'idle'))), clock.now);
    expect(sim.banhmiNow()).toBe(0); // not parked yet
    run(sim, clock, 60, () => sim.banhmiUp);
    expect(sim.banhmiUp).toBe(true);
    expect(sim.banhmiCart()).toEqual({ x: BANHMI_CART.x, y: BANHMI_CART.y });
    run(sim, clock, 60, () => sim.banhmiNow() > 0);
    // at most two at the cart at a time
    expect(sim.banhmi.taken.filter(Boolean).length).toBeGreaterThan(0);
    expect(sim.banhmi.taken.length).toBe(2);
    let ate = false;
    run(sim, clock, 180, () => {
      for (const ch of sim.chars.values()) if ((ch.held === 'banhmi' || ch.held === 'xoi') && ch.atSpot && ch.atSpot === ch.homeSpot && !ch.outdoors) ate = true;
      return ate;
    });
    expect(ate).toBe(true);
    // closing time: whoever is out goes back in and the vendor pushes the cart off
    sim.hourOverride = 10;
    run(sim, clock, 120, () => sim.banhmiCart() === null);
    expect(sim.banhmiUp).toBe(false);
    expect(sim.banhmiCart()).toBeNull();
    expect(sim.banhmi.taken.every((t) => t === null)).toBe(true);
    // visiting another building: no cart at all
    const visit = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { visit: true });
    visit.hourOverride = 7.5;
    const c2 = { now: T0 };
    run(visit, c2, 30);
    expect(visit.banhmiCart()).toBeNull();
  });

  it('festa da pizza: o entregador sai do elevador, deixa as caixas, vai embora; quem está à toa come pizza', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], ['ana', 'bia', 'caio'].map((id) => agent(id, '/a', 'idle'))), clock.now);
    run(sim, clock, 1);
    expect(sim.pizzaParty(clock.now)).toBe(true);
    expect(sim.pizzaParty(clock.now)).toBe(false); // one delivery person at a time
    expect([...sim.people()].some((p) => p.id === 'npc:pizza')).toBe(true);
    const held = new Set<string>();
    let partyStarted = false;
    for (let i = 0; i < 120 * 30; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      if (clock.now < sim.pizzaUntil) partyStarted = true;
      for (const ch of sim.chars.values()) held.add(ch.held);
    }
    expect(partyStarted).toBe(true);
    expect(held.has('pizza')).toBe(true);
    expect(sim.extras.length).toBe(0); // the delivery person already left
  });

  it('cochilo longo: alguém vem acordar; quem acorda se espreguiça e fica um tempo sem cochilar', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const long = T0 - 60 * 60_000;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: long }), agent('bia', '/a', 'idle')]), clock.now);
    const ana = sim.chars.get('ana')!;
    let slept = false;
    let woke = false;
    for (let i = 0; i < 9 * 60 * 30 && !woke; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      if (ana.pose === 'sleep') slept = true;
      if (slept && ana.awakeUntil > clock.now) woke = true;
    }
    expect(slept).toBe(true);
    expect(woke).toBe(true);
    run(sim, clock, 10);
    expect(ana.pose).not.toBe('sleep');
  });

  it('virada de ano: contagem e, à meia-noite, festa em todas as salas com todo mundo comemorando', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 1);
    sim.newYearOverride = 'countdown';
    run(sim, clock, 0.2);
    expect(sim.newYear.phase).toBe('countdown');
    expect(sim.newYear.secondsLeft).toBeGreaterThan(0);
    sim.newYearOverride = 'party';
    run(sim, clock, 1);
    expect(sim.newYear.phase).toBe('party');
    expect(sim.roomFx.active.get('/a')?.kind).toBe('party');
    expect(['cheer', 'laugh']).toContain(sim.chars.get('ana')!.pose);
    sim.newYearOverride = null;
    run(sim, clock, 1);
    expect(sim.newYear.phase).toBeNull();
  });

  it('virada de ano pelo calendário: últimos 5 min de 31/12 e os 10 primeiros de 1/1', () => {
    const at = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m - 1, d, h, mi).getTime();
    for (const [now, phase] of [
      [at(2026, 12, 31, 23, 54), null],
      [at(2026, 12, 31, 23, 56), 'countdown'],
      [at(2027, 1, 1, 0, 5), 'party'],
      [at(2027, 1, 1, 0, 11), null],
      [at(2027, 2, 5, 23, 58), 'countdown'], // Tết eve 2027 (Feb 6)
    ] as const) {
      const sim = newSim();
      sim.update(1 / 30, now);
      expect(sim.newYear.phase, new Date(now).toString()).toBe(phase);
    }
  });

  it('disco: quem está na mesa dança, as luzes acendem com fade e tudo volta ao normal; de novo, desliga', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 1);
    const ana = sim.chars.get('ana')!;
    expect(sim.discoLevel(clock.now)).toBe(0);
    expect(sim.toggleDisco(clock.now, 5_000)).toBe(true);
    run(sim, clock, 1);
    expect(sim.discoLevel(clock.now)).toBe(1);
    expect(['cheer', 'laugh']).toContain(ana.pose);
    expect(ana.atSpot).toBe(ana.homeSpot);
    run(sim, clock, 6);
    expect(sim.discoLevel(clock.now)).toBe(0);
    expect(ana.pose).toBe('type');
    sim.toggleDisco(clock.now, 5_000);
    expect(sim.toggleDisco(clock.now + 100)).toBe(false);
  });

  it('festa pedida pela interface (conquista): confete na sala, a turma comemora e acaba sozinha', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'idle'), agent('bia', '/a', 'working')]), clock.now);
    run(sim, clock, 1);
    sim.celebrate('/a', '🏆 Cất cánh', 'bia');
    expect(sim.roomFx.active.get('/a')).toMatchObject({ kind: 'party', text: '🏆 Cất cánh', agentId: 'bia' });
    // the next snapshot (without a server effect) doesn't clear the party
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'idle'), agent('bia', '/a', 'working')], 2), clock.now);
    run(sim, clock, 1);
    expect(sim.roomFx.active.has('/a')).toBe(true);
    expect(sim.chars.get('bia')!.icon).toBe('star');
    run(sim, clock, 12);
    expect(sim.roomFx.active.has('/a')).toBe(false);
    sim.celebrate('/nada', 'x');
    expect(sim.roomFx.active.size).toBe(0);
  });

  it('shell falhou: nuvenzinha de chuva, cabeça baixa por ~4 s, sem confete', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const base = agent('ana', '/a', 'shell', { shells: [shell(2 * MIN), shell(MIN)], activity: { id: 'a0', kind: 'run', icon: '💻', text: 'Rodando', at: T0 } });
    sim.applySnapshot(snap(rooms, [base]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    sim.effects.length = 0;
    // one of the two failed; the other keeps running
    sim.applySnapshot(snap(rooms, [{ ...base, shells: [shell(MIN)], activity: done('a1', true) }], 2), clock.now);
    expect(ana.icon).toBe('storm');
    expect(sim.effects.length).toBe(0);
    run(sim, clock, 1);
    expect(ana.pose).toBe('sleep');
    expect(ana.atSpot).toBe(ana.homeSpot);
    run(sim, clock, 4);
    expect(ana.icon).toBeNull();
    expect(ana.mode).toBe('shell');
    expect(ana.shellCount).toBe(1);
    expect(ana.pose).toBe('wait');
  });
});

describe('cúp điện (sim/outage.ts)', () => {
  /** The first day from T0 on with a scheduled cut (local midnight). */
  const cutDay = (): { day: number; cut: { start: number; end: number } } => {
    for (let i = 0; i < 60; i++) {
      const d = new Date(T0);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const cut = scheduledCut(day);
      if (cut) return { day: day.getTime(), cut };
    }
    throw new Error('no cut in 60 days');
  };

  it('quá tải: many working at once trip the breaker, the idle one runs to the box, flips it and the power is back', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.hourOverride = 17;
    const workers = ['ana', 'bia', 'caio', 'davi', 'enzo'].map((id) => agent(id, '/a', 'working'));
    sim.applySnapshot(snap([room('/a', 0)], [...workers, agent('ivo', '/a', 'idle', { statusSince: T0 })]), clock.now);
    const ivo = sim.chars.get('ivo')!;
    ivo.nextOutingAt = Number.MAX_SAFE_INTEGER;
    run(sim, clock, 20, () => ivo.atSpot === ivo.homeSpot && !ivo.step && !ivo.queue.length);
    // right after the office opens: no overload (the cooldown counts from then)
    run(sim, clock, 30);
    expect(sim.outage).toBeNull();
    sim.lastOverloadAt = clock.now - 2 * OVERLOAD_COOLDOWN_MS;
    run(sim, clock, 180, () => !!sim.outage);
    expect(sim.outage?.cause).toBe('overload');
    run(sim, clock, 1);
    expect(sim.outageDark).toBeGreaterThan(0.9);
    // whoever works keeps typing on the battery
    expect(sim.chars.get('ana')!.pose).toBe('type');
    run(sim, clock, 25, () => ivo.tx === BREAKER_TILE.tx && ivo.ty === BREAKER_TILE.ty && ivo.pose === 'use');
    expect(sim.outage?.fixer).toBe('ivo');
    expect(ivo.pose).toBe('use');
    run(sim, clock, 3, () => !sim.outage);
    expect(sim.outage).toBeNull();
    expect(ivo.sayText).toContain('⚡');
    run(sim, clock, 3);
    expect(sim.outageDark).toBe(0);
    // and he goes back to his desk
    run(sim, clock, 30, () => ivo.atSpot === ivo.homeSpot);
    expect(ivo.atSpot).toBe(ivo.homeSpot);
    // the cooldown: no second overload right away
    run(sim, clock, 60);
    expect(sim.outage).toBeNull();
  });

  it('cúp điện theo lịch: the notice in the morning, the cut at the hour, the generator after a while, the power back at the end', () => {
    const { day, cut } = cutDay();
    const sim = newSim();
    const clock = { now: day + 12 * 3_600_000 };
    sim.hourOverride = 8;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: clock.now }), agent('bia', '/a', 'working')]), clock.now);
    const ana = sim.chars.get('ana')!;
    ana.nextOutingAt = Number.MAX_SAFE_INTEGER;
    const said: string[] = [];
    const say = sim.social.say.bind(sim.social);
    sim.social.say = (ch, text, now, ms) => (said.push(text), say(ch, text, now, ms));
    run(sim, clock, 30, () => ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length);
    run(sim, clock, 300, () => said.some((t) => t.includes('🔌')));
    expect(said.some((t) => t.includes('🔌'))).toBe(true);
    expect(sim.outageNotice).toBe(true);
    expect(sim.outage).toBeNull();
    sim.hourOverride = cut.start + 0.5 / 60;
    run(sim, clock, 2, () => !!sim.outage);
    expect(sim.outage?.cause).toBe('schedule');
    run(sim, clock, 1);
    expect(sim.outageDark).toBeGreaterThan(0.9);
    expect(sim.generatorRunning).toBe(false);
    run(sim, clock, GENERATOR_DELAY_MS / 1000 + 3);
    expect(sim.generatorRunning).toBe(true);
    expect(Math.abs(sim.outageDark - GENERATOR_DARK)).toBeLessThan(0.05);
    run(sim, clock, (cut.end - cut.start) * 3600, () => !sim.outage);
    expect(sim.outage).toBeNull();
    expect(sim.generatorRunning).toBe(false);
    // once a day: still in the window (the hour is pinned), it doesn't come back
    run(sim, clock, 5);
    expect(sim.outage).toBeNull();
  });

  it('mưa giông: on a rainy day the strike of the hour flashes and (sometimes) takes the power; never on a dry day', () => {
    const { day } = cutDay();
    let at: { h: number; minute: number } | null = null;
    for (let h = 0; h < 24 && !at; h++) {
      const s = stormStrike(new Date(day), h);
      if (s && s.cutMs) at = { h, minute: s.minute };
    }
    expect(at).not.toBeNull();
    if (!at) return;
    const sim = newSim();
    const clock = { now: day + 12 * 3_600_000 };
    sim.hourOverride = at.h + (at.minute + 0.5) / 60;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: clock.now })]), clock.now);
    run(sim, clock, 3);
    expect(sim.outage).toBeNull();
    sim.raining = true;
    run(sim, clock, 2, () => !!sim.outage);
    expect(sim.outage?.cause).toBe('storm');
    expect(clock.now - sim.lightningAt).toBeLessThan(2_000);
  });

  it('visit: no outages (the timing is not real), not even by debug', () => {
    const { day, cut } = cutDay();
    const visit = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { visit: true });
    const clock = { now: day + 12 * 3_600_000 };
    visit.hourOverride = cut.start + 0.5 / 60;
    visit.raining = true;
    visit.lastOverloadAt = -1e15;
    const workers = ['ana', 'bia', 'caio', 'davi', 'enzo', 'ivo'].map((id) => agent(id, '/a', 'working'));
    visit.applySnapshot(snap([room('/a', 0)], workers), clock.now);
    run(visit, clock, 60);
    expect(visit.outage).toBeNull();
    expect(visit.outageNow('overload', clock.now)).toBe(false);
    expect(visit.outageDark).toBe(0);
  });
});
