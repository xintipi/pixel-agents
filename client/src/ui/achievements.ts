// Conquistas do escritório (puro, testável em node): marcos como "100 pedidos atendidos", "10 seguidos sem erro" ou
// "5 agentes trabalhando ao mesmo tempo", contados a partir dos snapshots ao vivo e guardados neste navegador. Também
// aponta as "grandes entregas" (um agente fecha uma lista de 3+ tarefas) para a festa na sala. O que já estava no
// escritório quando a página abriu não conta: cada agente começa do que ele já tinha. Agentes do modo demonstração
// do servidor (ids "demo:") ficam de fora.
import type { AgentInfo } from '../../../shared/types';
import { tr } from '../../../shared/i18n';

export type AchievementId =
  | 'first_turn'
  | 'turns_100'
  | 'tasks_10'
  | 'tasks_100'
  | 'tests_50'
  | 'clean_10'
  | 'comeback'
  | 'night_owl'
  | 'early_bird'
  | 'orchestra'
  | 'marathon'
  | 'big_spender';

/** Contadores que algumas conquistas acompanham (com barra de progresso no painel). */
export interface AchievementCounts {
  turns: number;
  tasks: number;
  tests: number;
  /** Pedidos atendidos em sequência sem nenhum erro no meio (o recorde fica em `bestClean`). */
  clean: number;
  bestClean: number;
}

export interface Achievement {
  id: AchievementId;
  icon: string;
  name: () => string;
  desc: () => string;
  /** Meta de um contador (para o progresso no painel). */
  goal?: { count: keyof AchievementCounts; target: number };
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_turn', icon: '🚀', name: () => tr('Liftoff'), desc: () => tr('An agent finished its first request.'), goal: { count: 'turns', target: 1 } },
  { id: 'turns_100', icon: '💯', name: () => tr('Centurion'), desc: () => tr('100 requests finished.'), goal: { count: 'turns', target: 100 } },
  { id: 'tasks_10', icon: '✅', name: () => tr('Checklist'), desc: () => tr('10 tasks completed.'), goal: { count: 'tasks', target: 10 } },
  { id: 'tasks_100', icon: '📋', name: () => tr('Taskmaster'), desc: () => tr('100 tasks completed.'), goal: { count: 'tasks', target: 100 } },
  { id: 'tests_50', icon: '🧪', name: () => tr('Test pilot'), desc: () => tr('50 test runs.'), goal: { count: 'tests', target: 50 } },
  { id: 'clean_10', icon: '✨', name: () => tr('Flawless'), desc: () => tr('10 requests in a row without a single error.'), goal: { count: 'bestClean', target: 10 } },
  { id: 'comeback', icon: '💪', name: () => tr('Comeback'), desc: () => tr('Finished a request after 5 or more errors along the way.') },
  { id: 'night_owl', icon: '🦉', name: () => tr('Night owl'), desc: () => tr('A request finished between midnight and 5 a.m.') },
  { id: 'early_bird', icon: '🐦', name: () => tr('Early bird'), desc: () => tr('A request finished between 5 and 7 a.m.') },
  { id: 'orchestra', icon: '🎻', name: () => tr('Orchestra'), desc: () => tr('5 agents working at the same time.') },
  { id: 'marathon', icon: '🏃', name: () => tr('Marathon'), desc: () => tr('An agent worked for an hour straight.') },
  { id: 'big_spender', icon: '💸', name: () => tr('Big spender'), desc: () => tr('A single session went past US$ 10.') },
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<AchievementId, Achievement> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** O que fica guardado no navegador. */
export interface AchievementState {
  /** Conquista -> quando foi desbloqueada (ms). */
  unlocked: Partial<Record<AchievementId, number>>;
  counts: AchievementCounts;
}

export const EMPTY_STATE: AchievementState = { unlocked: {}, counts: { turns: 0, tasks: 0, tests: 0, clean: 0, bestClean: 0 } };

export interface Unlock {
  id: AchievementId;
  /** Quem desbloqueou (para a festa na sala dele), quando há um responsável. */
  agentId?: string;
  roomId?: string;
}

export interface BigFinish {
  agentId: string;
  roomId: string;
  /** Tarefas da lista concluída. */
  tasks: number;
}

/** Erros num mesmo pedido para valer a "virada". */
const COMEBACK_ERRORS = 5;
const MARATHON_MS = 60 * 60_000;
const ORCHESTRA_AGENTS = 5;
const BIG_SPENDER_USD = 10;
/** Lista de tarefas que, toda concluída num pedido, vale festa. */
const BIG_FINISH_TASKS = 3;

interface Seen {
  activities: Set<string>;
  tasks: Set<string>;
  /** Erros desde o último pedido concluído. */
  errors: number;
  /** Tarefas concluídas desde o último pedido concluído. */
  tasksThisTurn: number;
}

const taskKey = (t: { id: string; title: string }) => `${t.id}|${t.title}`;

export class AchievementTracker {
  private seen = new Map<string, Seen>();

  constructor(public state: AchievementState = structuredClone(EMPTY_STATE)) {}

  /**
   * Um snapshot ao vivo: devolve as conquistas desbloqueadas agora e as grandes entregas. `now` é o relógio do
   * servidor; a hora local (coruja, madrugador) vem de `hour`.
   */
  observe(agents: readonly AgentInfo[], now: number, hour = new Date(now).getHours()): { unlocks: Unlock[]; finishes: BigFinish[] } {
    const unlocks: Unlock[] = [];
    const finishes: BigFinish[] = [];
    const s = this.state;
    const unlock = (id: AchievementId, a?: AgentInfo) => {
      if (s.unlocked[id] !== undefined) return;
      s.unlocked[id] = now;
      unlocks.push({ id, agentId: a?.id, roomId: a?.roomId });
    };
    const real = agents.filter((a) => !a.id.startsWith('demo:'));
    const present = new Set<string>();
    /** Quem acabou de atender um pedido neste snapshot (responsável pelas metas de contador). */
    let lastDone: AgentInfo | undefined;

    for (const a of real) {
      present.add(a.id);
      // estados (não eventos): valem já na primeira vez que o agente aparece
      if (a.status === 'working' && a.statusSince !== undefined && now - a.statusSince >= MARATHON_MS) unlock('marathon', a);
      if (a.provider !== 'codex' && (a.stats.costUSD ?? 0) >= BIG_SPENDER_USD) unlock('big_spender', a);
      let seen = this.seen.get(a.id);
      const recent = a.recent ?? (a.activity ? [a.activity] : []);
      if (!seen) {
        // primeira vez: o que ele já tinha não conta
        seen = { activities: new Set(recent.map((x) => x.id)), tasks: new Set(a.tasks.filter((t) => t.status === 'completed').map(taskKey)), errors: 0, tasksThisTurn: 0 };
        this.seen.set(a.id, seen);
        continue;
      }
      for (const t of a.tasks) {
        if (t.status !== 'completed' || seen.tasks.has(taskKey(t))) continue;
        seen.tasks.add(taskKey(t));
        seen.tasksThisTurn++;
        s.counts.tasks++;
      }
      for (const act of recent) {
        if (seen.activities.has(act.id)) continue;
        seen.activities.add(act.id);
        if (act.kind === 'test') s.counts.tests++;
        if (act.kind === 'error' || act.error) {
          seen.errors++;
          s.counts.clean = 0;
        }
        if (act.kind !== 'done' || a.kind !== 'main') continue;
        s.counts.turns++;
        lastDone = a;
        if (seen.errors === 0) {
          s.counts.clean++;
          s.counts.bestClean = Math.max(s.counts.bestClean, s.counts.clean);
        }
        if (seen.errors >= COMEBACK_ERRORS) unlock('comeback', a);
        if (hour < 5) unlock('night_owl', a);
        else if (hour < 7) unlock('early_bird', a);
        const list = a.tasks.length;
        if (list >= BIG_FINISH_TASKS && seen.tasksThisTurn >= 2 && a.tasks.every((t) => t.status === 'completed')) {
          finishes.push({ agentId: a.id, roomId: a.roomId, tasks: list });
        }
        seen.errors = 0;
        seen.tasksThisTurn = 0;
      }
      // não deixa os conjuntos crescerem sem fim (o snapshot só traz as ~30 últimas atividades)
      if (seen.activities.size > 200) seen.activities = new Set(recent.map((x) => x.id));
    }
    for (const id of this.seen.keys()) if (!present.has(id)) this.seen.delete(id);

    if (real.filter((a) => a.status === 'working').length >= ORCHESTRA_AGENTS) unlock('orchestra');
    // As metas de contador: o responsável é quem acabou de atender um pedido (para a festa na sala dele).
    for (const ach of ACHIEVEMENTS) {
      if (ach.goal && s.counts[ach.goal.count] >= ach.goal.target) unlock(ach.id, lastDone);
    }
    return { unlocks, finishes };
  }
}

/** Valida o que veio do armazenamento (campo a campo; o resto cai no vazio). */
export function sanitizeAchievementState(raw: unknown): AchievementState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const unlocked: AchievementState['unlocked'] = {};
  const u = o.unlocked && typeof o.unlocked === 'object' ? (o.unlocked as Record<string, unknown>) : {};
  for (const a of ACHIEVEMENTS) {
    const at = u[a.id];
    if (typeof at === 'number' && Number.isFinite(at)) unlocked[a.id] = at;
  }
  const c = o.counts && typeof o.counts === 'object' ? (o.counts as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return { unlocked, counts: { turns: n(c.turns), tasks: n(c.tasks), tests: n(c.tests), clean: n(c.clean), bestClean: n(c.bestClean) } };
}

/** Progresso de uma conquista com meta: 0–1 e o texto "37/100". */
export function achievementProgress(a: Achievement, state: AchievementState): { ratio: number; label: string } | null {
  if (!a.goal) return null;
  const have = Math.min(state.counts[a.goal.count], a.goal.target);
  return { ratio: have / a.goal.target, label: `${have}/${a.goal.target}` };
}
