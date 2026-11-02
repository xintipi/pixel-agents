import { describe, expect, it } from 'vitest';
import { gridProblems } from '../art/handdrawn/grid';
import { emptySave, FISH, FISHING_KEY, JUNK, loadSave, record, rollFish, writeSave, type Cond } from './fish';
import { fishGrid } from './art';
import { Session, TRACK_H, ZONE_H, type FishingEvent } from './session';

const cond = (o: Partial<Cond> = {}): Cond => ({
  night: false,
  rain: false,
  ...o,
});

describe('o que a linha traz', () => {
  it('só sai peixe do horário e do tempo certos, com tamanho dentro da faixa', () => {
    for (const night of [false, true])
      for (const rain of [false, true])
        for (let i = 0; i < 4000; i++) {
          const { fish, size } = rollFish(Math.random(), cond({ night, rain }));
          if (fish.junk) {
            expect(JUNK).toContain(fish);
            continue;
          }
          expect(fish.time).not.toBe(night ? 'day' : 'night');
          expect(!fish.rain || rain).toBe(true);
          expect(size).toBeGreaterThanOrEqual(fish.size[0]);
          expect(size).toBeLessThanOrEqual(fish.size[1]);
        }
  });
  it('chuva e lançamento longo trazem mais peixe raro', () => {
    const raros = (dist: number, c: Cond) => {
      let n = 0;
      for (let i = 0; i < 30000; i++) {
        const f = rollFish(dist, c).fish;
        if (!f.junk && f.rarity >= 1) n++;
      }
      return n;
    };
    expect(raros(0.5, cond({ rain: true }))).toBeGreaterThan(raros(0.5, cond()) * 1.05);
    expect(raros(1, cond())).toBeGreaterThan(raros(0, cond()) * 1.1);
  });
  it('a raridade sem peixe para a hora e o tempo desce para a de baixo', () => {
    expect(rollFish(1, cond({ rain: true }), () => 0.999999).fish.name()).toBe('Sturgeon');
    expect(rollFish(1, cond({ night: true }), () => 0.999999).fish.name()).toBe('Rainbow fish');
    expect(rollFish(1, cond(), () => 0.999999).fish.rarity).toBe(2);
  });
  it('sorteio baixo dá lixo, e o baú é o mais raro deles; cerca de 12% das vezes', () => {
    expect(rollFish(0.5, cond(), () => 0).fish.name()).toBe('Treasure chest');
    let lixo = 0;
    for (let i = 0; i < 20000; i++) if (rollFish(0.5, cond()).fish.junk) lixo++;
    expect(lixo).toBeGreaterThan(2000);
    expect(lixo).toBeLessThan(2800);
  });
  it('ids únicos e dez peixes, e nenhum horário sem peixe comum', () => {
    expect(new Set([...FISH, ...JUNK].map((f) => f.id)).size).toBe(FISH.length + JUNK.length);
    expect(FISH).toHaveLength(10);
    expect(FISH.some((f) => f.rarity === 0 && !f.time && !f.rain)).toBe(true);
  });
  it('todo desenho é uma grade retangular que só usa cores da paleta', () => {
    for (const f of [...FISH, ...JUNK]) expect(gridProblems(fishGrid(f))).toEqual([]);
  });
});

describe('o caderno de peixes', () => {
  it('guarda, lê de volta e ignora o que não é peixe conhecido ou está estragado', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    const s = emptySave();
    expect(record(s, { fish: FISH[1], size: 30 })).toBe(true);
    expect(record(s, { fish: FISH[1], size: 22 })).toBe(false);
    expect(record(s, { fish: FISH[1], size: 41 })).toBe(false);
    expect(record(s, { fish: JUNK[0], size: 0 })).toBe(false);
    expect(s).toEqual({ best: { 1: 41 }, count: { 1: 3 } });
    writeSave(store, s);
    expect(loadSave(store)).toEqual(s);
    mem.set(FISHING_KEY, JSON.stringify({ best: { 1: 9, 77: 5 }, count: { 1: 2, 77: 1, 3: -4 } }));
    expect(loadSave(store)).toEqual({ best: { 1: 20 }, count: { 1: 2 } });
    mem.set(FISHING_KEY, '{nao e json');
    expect(loadSave(store)).toEqual(emptySave());
    expect(loadSave(null)).toEqual(emptySave());
  });
  it('armazenamento cheio ou bloqueado não derruba o jogo', () => {
    const quebrado = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cheio');
      },
    };
    expect(() => writeSave(quebrado, emptySave())).not.toThrow();
    expect(loadSave(quebrado)).toEqual(emptySave());
  });
});

describe('o laço de pesca', () => {
  const novo = (rnd: () => number = () => 0.5) => {
    const eventos: FishingEvent[] = [];
    const s = new Session(
      () => cond(),
      (e) => eventos.push(e),
      rnd,
    );
    return { s, eventos };
  };
  const passa = (s: Session, segundos: number) => {
    for (let t = 0; t < segundos; t += 0.02) s.update(0.02);
  };

  it('segurar carrega, soltar lança, depois de um tempo o peixe belisca', () => {
    const { s, eventos } = novo();
    s.press();
    expect(s.phase).toBe('charge');
    passa(s, 1);
    expect(s.power).toBeGreaterThan(0.1);
    s.release();
    expect(s.phase).toBe('wait');
    passa(s, s.waitFor + 0.1);
    expect(s.phase).toBe('bite');
    expect(eventos).toEqual(['cast', 'bite']);
  });
  it('puxar cedo demais ou deixar a beliscada passar volta ao início', () => {
    const cedo = novo();
    cedo.s.press();
    cedo.s.release();
    cedo.s.press();
    expect(cedo.s.phase).toBe('idle');
    expect(cedo.eventos).toEqual(['cast', 'early']);
    const tarde = novo();
    tarde.s.press();
    tarde.s.release();
    passa(tarde.s, tarde.s.waitFor + 0.1);
    passa(tarde.s, 1.3);
    expect(tarde.s.phase).toBe('idle');
    expect(tarde.eventos).toEqual(['cast', 'bite', 'missed']);
  });
  it('mantendo o peixe na faixa verde a barra enche e o peixe é seu', () => {
    const { s, eventos } = novo();
    s.press();
    s.release();
    passa(s, s.waitFor + 0.1);
    s.press();
    expect(s.phase).toBe('reel');
    for (let i = 0; i < 2000 && s.phase === 'reel'; i++) {
      // segura quando a faixa está abaixo do peixe
      const meio = s.reel.zy + ZONE_H / 2;
      if (meio > s.reel.fy + 4) s.press();
      else s.hold = false;
      s.update(0.02);
    }
    expect(s.phase).toBe('result');
    expect(s.caught).not.toBeNull();
    expect(eventos.at(-1)).toBe('caught');
  });
  it('sem segurar a faixa afunda, o peixe sai dela e escapa', () => {
    const { s, eventos } = novo();
    s.press();
    s.release();
    passa(s, s.waitFor + 0.1);
    s.press();
    s.release();
    passa(s, 30);
    expect(s.reel.zy).toBe(TRACK_H - ZONE_H);
    expect(s.phase).toBe('idle');
    expect(s.caught).toBeNull();
    expect(eventos.at(-1)).toBe('slipped');
  });
  it('o resultado só fecha depois de meio segundo', () => {
    const { s } = novo();
    s.phase = 'result';
    s.t = 0.2;
    s.press();
    expect(s.phase).toBe('result');
    s.t = 0.6;
    s.press();
    expect(s.phase).toBe('idle');
  });
});
