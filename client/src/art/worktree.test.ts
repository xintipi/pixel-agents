import { describe, expect, it } from 'vitest';
import { renderWorkTree, workTreeStage } from './worktree';
import { weekOf } from '../ui/achievements-panel';

describe('árvore do trabalho', () => {
  it('estágio pelas tarefas da semana: broto, muda, arvoreta, árvore, florida', () => {
    expect([0, 4, 5, 14, 15, 29, 30, 59, 60, 500].map(workTreeStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('cada estágio cabe na folha, com margem, e cresce', () => {
    let lastTop = Infinity;
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const { buf } = renderWorkTree(stage);
      const b = buf.bounds()!;
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThan(buf.w);
      expect(b.y).toBeLessThanOrEqual(lastTop);
      lastTop = b.y;
    }
  });

  it('a semana começa na segunda-feira (data local)', () => {
    expect(weekOf(new Date(2026, 9, 21, 9).getTime())).toBe('2026-10-19'); // Wednesday
    expect(weekOf(new Date(2026, 9, 19, 0, 5).getTime())).toBe('2026-10-19'); // Monday
    expect(weekOf(new Date(2026, 9, 25, 23).getTime())).toBe('2026-10-19'); // Sunday
    expect(weekOf(new Date(2026, 9, 26, 1).getTime())).toBe('2026-10-26');
  });
});
