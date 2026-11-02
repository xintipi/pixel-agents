import { describe, expect, it } from 'vitest';
import {
  BIRD_R,
  BIRD_X,
  FLAPPY_KEY,
  Flappy,
  GAP,
  GAP_MAX,
  GAP_MIN,
  GROUND_Y,
  H,
  loadBest,
  MAX_DT,
  MAX_SHIFT,
  nextGap,
  PIPE_W,
  RESTART_LOCK,
  saveBest,
  SPACING,
  W,
} from './flappy';

const run = (g: Flappy, seconds: number, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) g.update(step);
};

/** A store in memory that works like localStorage. */
const memory = () => {
  const mem = new Map<string, string>();
  return { mem, store: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } };
};

describe('o pássaro', () => {
  it('com movimento reduzido o pássaro fica parado antes de começar', () => {
    const g = new Flappy(0, Math.random, false);
    run(g, 1.3);
    expect(g.y).toBe(84);
  });
  it('antes de começar paira no lugar, sem cair', () => {
    const g = new Flappy();
    run(g, 2);
    expect(g.phase).toBe('ready');
    expect(g.y).toBeGreaterThan(70);
    expect(g.y).toBeLessThan(100);
  });
  it('o primeiro toque começa o jogo e o pássaro sobe; sem tocar, a gravidade o puxa para baixo', () => {
    const g = new Flappy();
    g.press();
    expect(g.phase).toBe('playing');
    const y0 = g.y;
    g.update(0.05);
    expect(g.y).toBeLessThan(y0);
    run(g, 0.4);
    expect(g.vy).toBeGreaterThan(0);
  });
  it('cada toque dá o mesmo impulso para cima, e a queda tem velocidade máxima', () => {
    const g = new Flappy();
    g.press();
    run(g, 0.3);
    g.press();
    const vy = g.vy;
    g.press();
    expect(g.vy).toBe(vy);
    expect(g.vy).toBeLessThan(0);
    const alto = new Flappy();
    alto.press();
    alto.y = 5;
    for (let i = 0; i < 400 && alto.phase === 'playing'; i++) alto.update(1 / 60);
    // morreu sem passar da velocidade máxima de queda
    expect(alto.vy).toBeLessThanOrEqual(320);
  });
  it('um quadro muito longo (aba escondida) vale no máximo MAX_DT: o pássaro não atravessa o cano', () => {
    const g = new Flappy(0, () => 0.5);
    g.press();
    const x0 = g.pipes[0].x;
    g.update(30);
    expect(x0 - g.pipes[0].x).toBeLessThanOrEqual(92 * MAX_DT + 1e-9);
    expect(g.phase).toBe('playing');
  });
});

describe('os canos', () => {
  it('a fresta é sempre alcançável: dentro do intervalo e perto da anterior', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = seed;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      let prev: number | null = null;
      for (let i = 0; i < 300; i++) {
        const c = nextGap(prev, rnd);
        expect(c).toBeGreaterThanOrEqual(GAP_MIN);
        expect(c).toBeLessThanOrEqual(GAP_MAX);
        if (prev !== null) expect(Math.abs(c - prev)).toBeLessThanOrEqual(MAX_SHIFT);
        prev = c;
      }
    }
    expect(nextGap(null, () => 0)).toBe(GAP_MIN);
    expect(nextGap(null, () => 0.999999)).toBe(GAP_MAX);
    expect(GAP_MIN - GAP / 2).toBeGreaterThanOrEqual(18);
    expect(GROUND_Y - (GAP_MAX + GAP / 2)).toBeGreaterThanOrEqual(18);
  });
  it('rolam para a esquerda, entram pela direita com o espaçamento certo e saem de cena', () => {
    const g = new Flappy(0, () => 0.5);
    g.press();
    // mantém o pássaro no meio da fresta para não morrer
    for (let i = 0; i < 60 * 12 && g.phase === 'playing'; i++) {
      const next = g.pipes.find((p) => p.x + PIPE_W > BIRD_X - BIRD_R);
      g.y = next ? next.gapY : 84;
      g.vy = 0;
      g.update(1 / 60);
    }
    expect(g.phase).toBe('playing');
    for (let i = 1; i < g.pipes.length; i++) expect(g.pipes[i].x - g.pipes[i - 1].x).toBeCloseTo(SPACING, 5);
    expect(g.pipes.every((p) => p.x + PIPE_W >= 0)).toBe(true);
    expect(g.pipes[g.pipes.length - 1].x).toBeGreaterThan(W - 1);
  });
  it('passar pelo cano soma um ponto, uma vez só por cano', () => {
    const g = new Flappy(0, () => 0.5);
    g.press();
    let guard = 0;
    while (g.score < 3 && guard++ < 60 * 20) {
      const next = g.pipes.find((p) => p.x + PIPE_W / 2 >= BIRD_X) ?? g.pipes[0];
      g.y = next.gapY;
      g.vy = 0;
      g.update(1 / 60);
    }
    expect(g.score).toBe(3);
    expect(g.phase).toBe('playing');
    const antes = g.score;
    g.update(1 / 60);
    expect(g.score).toBe(antes);
  });
});

describe('a fresta é mesmo alcançável', () => {
  it('um piloto simples (bate asa quando está abaixo da fresta) passa de 30 canos em 50 sorteios sem morrer', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let st = seed * 7919;
      const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647;
      const g = new Flappy(0, rnd);
      g.press();
      for (let i = 0; i < 60 * 120 && g.phase === 'playing' && g.score < 30; i++) {
        const next = g.pipes.find((p) => p.x + PIPE_W > BIRD_X - BIRD_R);
        if (next && g.y > next.gapY + 16 && g.vy > -30) g.press();
        g.update(1 / 60);
      }
      expect({ seed, phase: g.phase, score: g.score }).toEqual({ seed, phase: 'playing', score: 30 });
    }
  });
});

describe('as colisões', () => {
  it('bater no cano, no chão ou no teto mata; no meio da fresta não', () => {
    const livre = new Flappy(0, () => 0.5);
    livre.press();
    const cano = livre.pipes[0];
    cano.x = BIRD_X - PIPE_W / 2;
    livre.y = cano.gapY;
    expect(livre.hits()).toBe(false);
    livre.y = cano.gapY - GAP / 2 + BIRD_R - 1;
    expect(livre.hits()).toBe(true);
    livre.y = cano.gapY + GAP / 2 - BIRD_R + 1;
    expect(livre.hits()).toBe(true);
    // longe do cano, a altura da fresta não importa
    cano.x = BIRD_X + 50;
    livre.y = 20;
    expect(livre.hits()).toBe(false);
    livre.y = GROUND_Y - BIRD_R;
    expect(livre.hits()).toBe(true);
    livre.y = BIRD_R;
    expect(livre.hits()).toBe(true);
    expect(H).toBeGreaterThan(GROUND_Y);
  });
  it('sem tocar o pássaro cai no chão e morre, e o corpo fica no chão', () => {
    const g = new Flappy();
    g.press();
    run(g, 5);
    expect(g.phase).toBe('dead');
    run(g, 1);
    expect(g.y).toBe(GROUND_Y - BIRD_R);
  });
});

describe('a morte e o recomeço', () => {
  const morto = (best = 0) => {
    const g = new Flappy(best, () => 0.5);
    g.press();
    run(g, 5);
    return g;
  };
  it('o toque logo depois de morrer é ignorado; passada a trava, volta para o início', () => {
    const g = morto();
    expect(g.phase).toBe('dead');
    g.t = RESTART_LOCK - 0.1;
    g.press();
    expect(g.phase).toBe('dead');
    g.t = RESTART_LOCK + 0.01;
    g.press();
    expect(g.phase).toBe('ready');
    expect(g.score).toBe(0);
    expect(g.pipes).toEqual([]);
  });
  it('o recorde só sobe, e a pontuação menor não o apaga', () => {
    const g = new Flappy(7, () => 0.5);
    g.press();
    g.score = 3;
    g.y = 0;
    g.update(1 / 60);
    expect(g.phase).toBe('dead');
    expect(g.best).toBe(7);
    expect(g.newBest).toBe(false);
    const h = new Flappy(2, () => 0.5);
    h.press();
    h.score = 5;
    h.y = 0;
    h.update(1 / 60);
    expect(h.best).toBe(5);
    expect(h.newBest).toBe(true);
  });
});

describe('o recorde guardado', () => {
  it('guarda, lê de volta e só aceita um número maior', () => {
    const { mem, store } = memory();
    expect(loadBest(store)).toBe(0);
    saveBest(store, 12);
    expect(loadBest(store)).toBe(12);
    saveBest(store, 5);
    expect(loadBest(store)).toBe(12);
    saveBest(store, 20);
    expect(mem.get(FLAPPY_KEY)).toBe('20');
  });
  it('conteúdo estragado, absurdo ou armazenamento bloqueado não derruba o jogo', () => {
    for (const lixo of ['{nao e json', '"abc"', '-4', '2.5', '99999999', 'null', '[1]']) {
      const { store, mem } = memory();
      mem.set(FLAPPY_KEY, lixo);
      expect(loadBest(store)).toBe(0);
    }
    const quebrado = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cheio');
      },
    };
    expect(loadBest(quebrado)).toBe(0);
    expect(() => saveBest(quebrado, 9)).not.toThrow();
    expect(loadBest(null)).toBe(0);
    expect(() => saveBest(null, 9)).not.toThrow();
  });
});
