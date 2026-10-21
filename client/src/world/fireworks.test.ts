import { describe, expect, it } from 'vitest';
import { FIREWORK_RISE, FIREWORK_TUBES, fireworkBurst } from './fireworks';
import { SoundCues } from './sound-cues';
import type { SoundCue } from './api';
import type { Camera } from './camera';
import type { Sim } from './sim/sim';

const building = { x: 0, y: 0, w: 512, h: 464 };

describe('fogos da virada', () => {
  it('cada tubo sobe e abre; estouro fora do prédio, e a mesma hora dá o mesmo estouro', () => {
    for (let i = 0; i < FIREWORK_TUBES; i++) {
      const b = fireworkBurst(i, 1_800_000, building);
      expect(b.p).toBeGreaterThanOrEqual(0);
      expect(b.p).toBeLessThan(1);
      const inside = b.cx > building.x && b.cx < building.x + building.w && b.cy > building.y && b.cy < building.y + building.h;
      expect(inside).toBe(false);
      expect(fireworkBurst(i, 1_800_000, building)).toEqual(b);
    }
  });

  it('som: assobio na subida e estouro quando abre, só durante a festa e sem rajada no primeiro quadro', () => {
    const sim = { newYear: { phase: 'party' }, building: { cols: 2 }, elevators: [], chars: new Map(), spots: { get: () => undefined }, social: { activePingPong: () => null } } as unknown as Sim;
    const camera = { viewW: 1000, viewH: 800, zoom: 1, screenToWorld: (x: number, y: number) => ({ x: x - 200, y: y - 200 }) } as unknown as Camera;
    const cues = new SoundCues(sim, camera, () => 0.5);
    const emitted: SoundCue[] = [];
    const fw = (c: SoundCue) => c.kind.startsWith('firework') && emitted.push(c);
    const tick = (now: number) => (cues as unknown as { fireworks(n: number, v: object, e: (c: SoundCue) => void): void }).fireworks(now, { x0: -200, y0: -200, x1: 800, y1: 600 }, fw);
    tick(0);
    expect(emitted).toEqual([]);
    for (let now = 0; now < 10_000; now += 33) tick(now);
    expect(emitted.some((c) => c.kind === 'firework_launch')).toBe(true);
    expect(emitted.filter((c) => c.kind === 'firework_boom').length).toBeGreaterThan(5);
    // os estouros acontecem quando o desenho abre
    void FIREWORK_RISE;
    emitted.length = 0;
    (sim as unknown as { newYear: { phase: string | null } }).newYear.phase = null;
    for (let now = 10_000; now < 14_000; now += 33) tick(now);
    expect(emitted).toEqual([]);
  });
});
