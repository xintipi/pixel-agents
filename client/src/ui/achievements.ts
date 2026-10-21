// Office achievements (pure, testable in node): milestones like "100 requests handled", "10 in a row without error" or
// "5 agents working at the same time", counted from the live snapshots and stored in this browser. It also
// flags "big deliveries" (an agent closes a list of 3+ tasks) for the party in the room. What was already in the
// office when the page opened does not count: each agent starts from what it already had. Agents from the server's
// demo mode (ids "demo:") are left out.
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

/** Counters some achievements track (with a progress bar in the panel). */
export interface AchievementCounts {
  turns: number;
  tasks: number;
  tests: number;
  /** Requests handled in a row without any error in between (the record is in `bestClean`). */
  clean: number;
  bestClean: number;
}

export interface Achievement {
  id: AchievementId;
  icon: string;
  name: () => string;
  desc: () => string;
  /** A counter's goal (for progress in the panel). */
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

/** What is stored in the browser. */
export interface AchievementState {
  /** Achievement -> when it was unlocked (ms). */
  unlocked: Partial<Record<AchievementId, number>>;
  counts: AchievementCounts;
}

export const EMPTY_STATE: AchievementState = { unlocked: {}, counts: { turns: 0, tasks: 0, tests: 0, clean: 0, bestClean: 0 } };

export interface Unlock {
  id: AchievementId;
  /** Who unlocked it (for the party in their room), when there is someone responsible. */
  agentId?: string;
  roomId?: string;
}

export interface BigFinish {
  agentId: string;
  roomId: string;
  /** Tasks of the completed list. */
  tasks: number;
}

/** Errors in the same request for the "comeback" to count. */
const COMEBACK_ERRORS = 5;
const MARATHON_MS = 60 * 60_000;
const ORCHESTRA_AGENTS = 5;
const BIG_SPENDER_USD = 10;
/** Task list that, fully completed in one request, earns a party. */
const BIG_FINISH_TASKS = 3;

interface Seen {
  activities: Set<string>;
  tasks: Set<string>;
  /** Errors since the last completed request. */
  errors: number;
  /** Tasks completed since the last completed request. */
  tasksThisTurn: number;
}

const taskKey = (t: { id: string; title: string }) => `${t.id}|${t.title}`;

export class AchievementTracker {
  private seen = new Map<string, Seen>();

  constructor(public state: AchievementState = structuredClone(EMPTY_STATE)) {}

  /**
   * A live snapshot: returns the achievements unlocked now and the big deliveries. `now` is the server's
   * clock; the local hour (night owl, early bird) comes from `hour`.
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
    /** Who just handled a request in this snapshot (responsible for the counter goals). */
    let lastDone: AgentInfo | undefined;

    for (const a of real) {
      present.add(a.id);
      // states (not events): count already the first time the agent appears
      if (a.status === 'working' && a.statusSince !== undefined && now - a.statusSince >= MARATHON_MS) unlock('marathon', a);
      if (a.provider !== 'codex' && (a.stats.costUSD ?? 0) >= BIG_SPENDER_USD) unlock('big_spender', a);
      let seen = this.seen.get(a.id);
      const recent = a.recent ?? (a.activity ? [a.activity] : []);
      if (!seen) {
        // first time: what it already had does not count
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
      // keeps the sets from growing forever (the snapshot only carries the last ~30 activities)
      if (seen.activities.size > 200) seen.activities = new Set(recent.map((x) => x.id));
    }
    for (const id of this.seen.keys()) if (!present.has(id)) this.seen.delete(id);

    if (real.filter((a) => a.status === 'working').length >= ORCHESTRA_AGENTS) unlock('orchestra');
    // Counter goals: the one responsible is whoever just handled a request (for the party in their room).
    for (const ach of ACHIEVEMENTS) {
      if (ach.goal && s.counts[ach.goal.count] >= ach.goal.target) unlock(ach.id, lastDone);
    }
    return { unlocks, finishes };
  }
}

/** Validates what came from storage (field by field; the rest falls back to empty). */
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

/** Progress of an achievement with a goal: 0–1 and the text "37/100". */
export function achievementProgress(a: Achievement, state: AchievementState): { ratio: number; label: string } | null {
  if (!a.goal) return null;
  const have = Math.min(state.counts[a.goal.count], a.goal.target);
  return { ratio: have / a.goal.target, label: `${have}/${a.goal.target}` };
}
