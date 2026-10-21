import { describe, expect, it } from 'vitest';
import type { Activity, AgentInfo, TaskItem } from '../../../shared/types';
import { ACHIEVEMENTS, AchievementTracker, achievementProgress, sanitizeAchievementState } from './achievements';

let seq = 0;
const act = (kind: Activity['kind'], extra: Partial<Activity> = {}): Activity => ({ id: `a${++seq}`, kind, icon: '', text: kind, at: seq, ...extra });
const task = (id: string, status: TaskItem['status']): TaskItem => ({ id, title: `t${id}`, status }) as TaskItem;
const agent = (id: string, o: Partial<AgentInfo> = {}): AgentInfo =>
  ({
    id,
    name: id,
    kind: 'main',
    roomId: `room-${id}`,
    status: 'working',
    statusSince: 0,
    recent: [],
    tasks: [],
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    ...o,
  }) as unknown as AgentInfo;

describe('conquistas', () => {
  it('o que o agente já tinha quando apareceu não conta; o que acontece depois, sim', () => {
    const t = new AchievementTracker();
    const old = [act('done'), act('done'), act('test')];
    expect(t.observe([agent('x', { recent: old })], 1000, 12).unlocks).toEqual([]);
    expect(t.state.counts.turns).toBe(0);
    const r = t.observe([agent('x', { recent: [...old, act('test'), act('done')] })], 2000, 12);
    expect(t.state.counts).toMatchObject({ turns: 1, tests: 1, clean: 1 });
    expect(r.unlocks.map((u) => u.id)).toEqual(['first_turn']);
    expect(r.unlocks[0]).toMatchObject({ agentId: 'x', roomId: 'room-x' });
    // again, nothing new
    expect(t.observe([agent('x', { recent: [...old, act('test')] })], 3000, 12).unlocks).toEqual([]);
  });

  it('cada conquista desbloqueia uma vez só, e fica guardada no estado', () => {
    const t = new AchievementTracker();
    t.observe([agent('x')], 0, 12);
    t.observe([agent('x', { recent: [act('done')] })], 10, 12);
    const r = t.observe([agent('x', { recent: [act('done')] })], 20, 12);
    expect(r.unlocks).toEqual([]);
    expect(t.state.unlocked.first_turn).toBe(10);
  });

  it('virada: 5 erros no mesmo pedido e depois a conclusão; um erro zera a sequência limpa', () => {
    const t = new AchievementTracker();
    t.observe([agent('x')], 0, 12);
    const errors = Array.from({ length: 5 }, () => act('error', { error: true }));
    t.observe([agent('x', { recent: errors })], 10, 12);
    expect(t.state.counts.clean).toBe(0);
    const r = t.observe([agent('x', { recent: [...errors, act('done')] })], 20, 12);
    expect(r.unlocks.map((u) => u.id)).toContain('comeback');
    expect(t.state.counts.clean).toBe(0);
  });

  it('coruja de madrugada e madrugador cedinho', () => {
    const night = new AchievementTracker();
    night.observe([agent('x')], 0, 3);
    expect(night.observe([agent('x', { recent: [act('done')] })], 10, 3).unlocks.map((u) => u.id)).toContain('night_owl');
    const early = new AchievementTracker();
    early.observe([agent('x')], 0, 6);
    expect(early.observe([agent('x', { recent: [act('done')] })], 10, 6).unlocks.map((u) => u.id)).toContain('early_bird');
  });

  it('orquestra (5 trabalhando), maratona (1 h seguida) e gastão (sessão acima de US$ 10, só Claude Code)', () => {
    const t = new AchievementTracker();
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => agent(id));
    expect(t.observe(five, 1000, 12).unlocks.map((u) => u.id)).toEqual(['orchestra']);
    const m = new AchievementTracker();
    m.observe([agent('x', { statusSince: 0 })], 1000, 12);
    expect(m.observe([agent('x', { statusSince: 0 })], 3_600_000, 12).unlocks.map((u) => u.id)).toContain('marathon');
    const codex = new AchievementTracker();
    codex.observe([agent('c', { provider: 'codex', stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0, costUSD: 50 } } as Partial<AgentInfo>)], 0, 12);
    expect(codex.state.unlocked.big_spender).toBeUndefined();
    const claude = new AchievementTracker();
    claude.observe([agent('x', { stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0, costUSD: 12 } })], 0, 12);
    expect(claude.state.unlocked.big_spender).toBe(0);
  });

  it('grande entrega: a lista de 3+ tarefas fechada no pedido vira festa na sala', () => {
    const t = new AchievementTracker();
    t.observe([agent('x', { tasks: [task('1', 'completed'), task('2', 'in_progress'), task('3', 'pending')] })], 0, 12);
    const all = [task('1', 'completed'), task('2', 'completed'), task('3', 'completed')];
    const r = t.observe([agent('x', { tasks: all, recent: [act('done')] })], 10, 12);
    expect(r.finishes).toEqual([{ agentId: 'x', roomId: 'room-x', tasks: 3 }]);
    expect(t.state.counts.tasks).toBe(2);
    // the same list on the next request does not celebrate again
    expect(t.observe([agent('x', { tasks: all, recent: [act('done')] })], 20, 12).finishes).toEqual([]);
  });

  it('agentes do demo do servidor ficam de fora', () => {
    const t = new AchievementTracker();
    t.observe([agent('demo:a')], 0, 12);
    t.observe([agent('demo:a', { recent: [act('done')] })], 10, 12);
    expect(t.state.counts.turns).toBe(0);
  });

  it('estado guardado: valida campo a campo; progresso com meta', () => {
    const s = sanitizeAchievementState({ unlocked: { first_turn: 5, nada: 1, tasks_10: 'ontem' }, counts: { turns: 37.9, tasks: -1 } });
    expect(s.unlocked).toEqual({ first_turn: 5 });
    expect(s.counts).toEqual({ turns: 37, tasks: 0, tests: 0, clean: 0, bestClean: 0 });
    const centurion = ACHIEVEMENTS.find((a) => a.id === 'turns_100')!;
    expect(achievementProgress(centurion, s)).toEqual({ ratio: 0.37, label: '37/100' });
    expect(achievementProgress(ACHIEVEMENTS.find((a) => a.id === 'comeback')!, s)).toBeNull();
    expect(sanitizeAchievementState('lixo')).toEqual({ unlocked: {}, counts: { turns: 0, tasks: 0, tests: 0, clean: 0, bestClean: 0 } });
  });
});
