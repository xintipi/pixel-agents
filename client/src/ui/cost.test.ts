import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../../shared/types';
import { clampVndRate, COST_WINDOW_MS, costAlertUsd, CostBurnWatch, DEFAULT_VND_RATE, formatCost } from './cost';

const agent = (id: string, costUSD: number | undefined, provider?: 'codex'): AgentInfo =>
  ({ id, name: id, provider, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, costUSD, subagents: 0 } }) as unknown as AgentInfo;

describe('custo na interface', () => {
  it('formata em dólar ou em đồng pelo câmbio (aproximado, de 100 em 100)', () => {
    expect(formatCost(1.234, { currency: 'usd', vndRate: DEFAULT_VND_RATE })).toBe('$1.23');
    const vnd = formatCost(1.234, { currency: 'vnd', vndRate: 25_000 });
    expect(vnd.startsWith('≈ ')).toBe(true);
    expect(vnd.replace(/\D/g, '')).toBe('30900');
  });

  it('câmbio fora da faixa ou inválido volta para o permitido', () => {
    expect(clampVndRate(10)).toBe(1_000);
    expect(clampVndRate(1e9)).toBe(100_000);
    expect(clampVndRate('abc')).toBe(DEFAULT_VND_RATE);
    expect(clampVndRate('25432.6')).toBe(25_433);
  });

  it('aviso desligado não tem valor', () => {
    expect(costAlertUsd('off')).toBeUndefined();
    expect(costAlertUsd('2')).toBe(2);
  });
});

describe('aviso de gasto', () => {
  it('avisa quando o gasto na janela passa do valor, uma vez por estouro', () => {
    const w = new CostBurnWatch();
    const t0 = 1_000_000;
    // The old cost of those already in the office does not count.
    expect(w.observe([agent('a', 40)], t0, 2)).toEqual([]);
    expect(w.observe([agent('a', 41)], t0 + 60_000, 2)).toEqual([]);
    expect(w.observe([agent('a', 42.5)], t0 + 120_000, 2)).toEqual([{ agentId: 'a', spent: 2.5 }]);
    // After the alert the count restarts.
    expect(w.observe([agent('a', 43)], t0 + 180_000, 2)).toEqual([]);
    expect(w.observe([agent('a', 44.6)], t0 + 240_000, 2)).toEqual([{ agentId: 'a', spent: expect.closeTo(2.1, 5) }]);
  });

  it('gasto lento, espalhado por mais que a janela, não avisa', () => {
    const w = new CostBurnWatch();
    let cost = 10;
    w.observe([agent('a', cost)], 0, 2);
    for (let t = 1; t <= 30; t++) {
      cost += 0.5;
      expect(w.observe([agent('a', cost)], t * (COST_WINDOW_MS / 3), 2)).toEqual([]);
    }
  });

  it('desligado, Codex, sem custo e custo que volta para trás não avisam', () => {
    const w = new CostBurnWatch();
    w.observe([agent('a', 1), agent('c', 1, 'codex'), agent('n', undefined)], 0, undefined);
    expect(w.observe([agent('a', 9), agent('c', 9, 'codex')], 1000, undefined)).toEqual([]);
    expect(w.observe([agent('a', 0.5)], 2000, 2)).toEqual([]);
    expect(w.observe([agent('a', 3)], 3000, 2)).toEqual([{ agentId: 'a', spent: 2.5 }]);
  });

  it('esquece quem saiu do escritório', () => {
    const w = new CostBurnWatch();
    w.observe([agent('a', 1)], 0, 2);
    w.observe([], 1000, 2);
    // Came back with a higher cost: as if it had just appeared.
    expect(w.observe([agent('a', 9)], 2000, 2)).toEqual([]);
  });
});
