// Sound cues from the world: office life the sim points out, room parties and the weather beds.
import { describe, expect, it } from 'vitest';
import { SoundCues } from './sound-cues';
import type { SoundCue } from './api';
import type { Camera } from './camera';
import type { Sim } from './sim/sim';
import type { Weather } from './render/weather';

function setup(weather: Weather | null = null, night = 0) {
  const sim = {
    now: 0,
    sfx: [] as { kind: SoundCue['kind']; x: number; y: number; at: number }[],
    newYear: { phase: null },
    building: { cols: 2 },
    elevators: [],
    chars: new Map(),
    spots: { get: () => undefined },
    social: { gatherings: [] },
    roomFx: { active: new Map() },
    rooms: new Map(),
    pets: { robot: { dockTile: { tx: 1, ty: 1 }, state: 'charge', x: 100, y: 100 } },
  };
  // view from (-200,-200) to (800,600)
  const camera = { viewW: 1000, viewH: 800, zoom: 2, screenToWorld: (x: number, y: number) => ({ x: x - 200, y: y - 200 }) } as unknown as Camera;
  const cues = new SoundCues(sim as unknown as Sim, camera, () => 0.5);
  if (weather) cues.env = () => ({ weather, night });
  const out: SoundCue[] = [];
  const run = (from: number, to: number) => {
    for (let now = from; now < to; now += 50) {
      sim.now = now;
      cues.update(now, (c) => out.push(c));
    }
  };
  return { sim, cues, out, run };
}

describe('sons do mundo', () => {
  it('vida do escritório: só o que está na tela (a pizza também fora, mais baixo); sons velhos caem; a lista esvazia', () => {
    const { sim, out, run } = setup();
    sim.sfx.push({ kind: 'coffee', x: 600, y: 100, at: 0 }, { kind: 'meow', x: 5_000, y: 100, at: 0 }, { kind: 'pizza', x: 5_000, y: 100, at: 0 }, { kind: 'flush', x: 0, y: 0, at: -10_000 });
    run(0, 50);
    expect(out.map((c) => c.kind).sort()).toEqual(['coffee', 'pizza']);
    expect(out.find((c) => c.kind === 'pizza')!.gain).toBeLessThan(out.find((c) => c.kind === 'coffee')!.gain);
    expect(out.find((c) => c.kind === 'coffee')!.pan).toBeGreaterThan(0);
    expect(sim.sfx).toEqual([]);
  });

  it('festa numa sala na tela: uma buzina só, mesmo com a festa durando', () => {
    const { sim, out, run } = setup();
    sim.rooms.set('r1', { slot: 0 });
    sim.roomFx.active.set('r1', { kind: 'party', key: 1, start: 0 });
    run(0, 3_000);
    expect(out.filter((c) => c.kind === 'party').length).toBeLessThanOrEqual(1);
  });

  it('chuva: a cama segue enquanto chove, e um trovão de vez em quando', () => {
    const { out, run } = setup('rain');
    run(0, 80_000);
    expect(out.filter((c) => c.kind === 'rain').length).toBeGreaterThan(100);
    expect(out.some((c) => c.kind === 'thunder')).toBe(true);
    expect(out.some((c) => c.kind === 'bird' || c.kind === 'wind')).toBe(false);
  });

  it('sol: passarinhos de dia, nada à noite; vento e neve (mais baixa) usam a cama do vento', () => {
    const day = setup('clear', 0);
    day.run(0, 30_000);
    expect(day.out.some((c) => c.kind === 'bird')).toBe(true);
    const night = setup('clear', 1);
    night.run(0, 30_000);
    expect(night.out).toEqual([]);
    const wind = setup('wind');
    wind.run(0, 1_000);
    const snow = setup('snow');
    snow.run(0, 1_000);
    expect(wind.out[0].kind).toBe('wind');
    expect(snow.out[0].gain).toBeLessThan(wind.out[0].gain);
  });

  it('robô: zumbido só enquanto anda e está na tela', () => {
    const { sim, out, run } = setup();
    run(0, 1_000);
    expect(out).toEqual([]);
    sim.pets.robot.state = 'clean';
    run(1_000, 2_000);
    expect(out.some((c) => c.kind === 'robot_hum')).toBe(true);
    out.length = 0;
    sim.pets.robot.x = 9_000;
    run(2_000, 3_000);
    expect(out).toEqual([]);
  });
});
