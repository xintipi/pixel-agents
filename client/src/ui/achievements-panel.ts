// Achievements in the UI: follows the live snapshots (ui/achievements.ts), stores progress in this browser,
// announces with a toast and a party in the unlocker's room, celebrates big deliveries and shows the panel with
// all achievements (trophy button in the top bar).
import type { Notice } from '../../../shared/types';
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENTS,
  AchievementTracker,
  achievementProgress,
  sanitizeAchievementState,
  type AchievementState,
} from './achievements';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setText } from './dom';
import { formatDateTime } from './format';
import { ICONS } from './icons';
import { tr } from '../../../shared/i18n';
import { workTreeStage } from '../art/worktree';

const STORAGE_KEY = 'habblaud:achievements';
const TREE_KEY = 'habblaud:worktree';

/** Monday of `at`'s week (local date, "2026-10-19"): the tree's tasks restart every week. */
export function weekOf(at: number): string {
  const d = new Date(at);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadWeek(key: string): { week: string; tasks: number } {
  try {
    const o = JSON.parse(localStorage.getItem(key) ?? 'null') as { week?: unknown; tasks?: unknown } | null;
    if (o && typeof o.week === 'string' && typeof o.tasks === 'number' && Number.isFinite(o.tasks)) return { week: o.week, tasks: Math.max(0, Math.floor(o.tasks)) };
  } catch {
    // storage blocked or corrupted: start from scratch
  }
  return { week: '', tasks: 0 };
}

/** Pixel trophy (same stroke as the other top-bar icons). */
const TROPHY_ICON =
  '<svg class="ui-px-icon" width="20" height="20" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M2 0h6v1h2v3H9v1H8v1H6v2h2v2H2V8h2V6H2V5H1V4H0V1h2zM1 2v1h1V2zm7 0v1h1V2z"/></svg>';

function load(key: string): AchievementState {
  try {
    const raw = localStorage.getItem(key);
    return sanitizeAchievementState(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeAchievementState(null);
  }
}

function save(key: string, state: AchievementState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage blocked (private tab): progress only lasts this session
  }
}

export class AchievementsPanel implements UiComponent {
  readonly button: HTMLButtonElement;
  readonly el: HTMLDialogElement;
  private readonly tracker: AchievementTracker;
  private readonly key: string;
  private readonly treeKey: string;
  private week: { week: string; tasks: number };
  /** Tree stage already shown (going up a stage triggers the pizza party). */
  private treeStage = -1;
  private readonly list: HTMLElement;
  private readonly summary: HTMLElement;
  private dirty = true;

  constructor(
    private readonly ctx: UiContext,
    toast: (n: Notice) => void,
  ) {
    // In ?mock=1 progress is separate: fake data does not count toward the real one.
    this.key = ctx.store.mock ? `${STORAGE_KEY}:mock` : STORAGE_KEY;
    this.tracker = new AchievementTracker(load(this.key));
    this.treeKey = ctx.store.mock ? `${TREE_KEY}:mock` : TREE_KEY;
    this.week = loadWeek(this.treeKey);
    this.syncTree(ctx.now());
    this.button = iconButton(TROPHY_ICON, tr('Achievements'), () => this.toggle());
    this.button.setAttribute('aria-haspopup', 'dialog');

    const close = iconButton(ICONS.close, tr('Close achievements'), () => this.el.close(), 'ui-icon-btn--sm');
    this.summary = h('p', { class: 'ui-ach__summary' });
    this.list = h('ul', { class: 'ui-ach__list' });
    this.el = h(
      'dialog',
      { class: 'ui-dialog ui-ach', attrs: { 'aria-labelledby': 'ui-ach-title' } },
      h('div', { class: 'ui-dialog__head' }, h('h2', { text: tr('Achievements'), attrs: { id: 'ui-ach-title' } }), close),
      h(
        'div',
        { class: 'ui-dialog__body' },
        this.summary,
        this.list,
        h('p', { class: 'ui-set__hint', text: tr('Counted from what happens while Habblaud is open in this browser, and saved here.') }),
      ),
    ) as HTMLDialogElement;
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.el.close();
    });

    ctx.store.on('snapshot', (snap) => {
      // live only: the timelapse is the past
      if (ctx.store.replaying) return;
      const before = this.tracker.state.counts.tasks;
      const { unlocks, finishes } = this.tracker.observe(snap.agents, snap.serverTime);
      this.week.tasks += this.tracker.state.counts.tasks - before;
      this.syncTree(snap.serverTime);
      for (const f of finishes) ctx.world.celebrate?.(f.roomId, tr('🎉 {0} tasks done!', [f.tasks]), f.agentId);
      for (const u of unlocks) {
        const a = ACHIEVEMENT_BY_ID.get(u.id)!;
        toast({ id: `ach:${u.id}`, level: 'success', text: tr('🏆 Achievement unlocked: {0} — {1}', [`${a.icon} ${a.name()}`, a.desc()]), agentId: u.agentId, at: snap.serverTime });
        if (u.roomId) ctx.world.celebrate?.(u.roomId, `🏆 ${a.name()}`, u.agentId);
      }
      save(this.key, this.tracker.state);
      this.dirty = true;
      if (this.el.open) this.render();
    });
  }

  /** Work tree at the reception: this week's tasks (a new week: restarts from the sprout). */
  private syncTree(now: number): void {
    const week = weekOf(now);
    if (this.week.week !== week) this.week = { week, tasks: 0 };
    try {
      localStorage.setItem(this.treeKey, JSON.stringify(this.week));
    } catch {
      // no storage: only lasts this session
    }
    const stage = workTreeStage(this.week.tasks);
    this.ctx.world.setWorkTree?.(stage);
    // the tree grew (not on page load): pizza for everyone
    if (this.treeStage >= 0 && stage > this.treeStage) this.ctx.world.pizzaParty?.();
    this.treeStage = stage;
  }

  toggle(): void {
    if (this.el.open) return this.el.close();
    this.dirty = true;
    this.render();
    this.el.showModal();
  }

  render(): void {
    if (!this.dirty || !this.el.open) return;
    this.dirty = false;
    const state = this.tracker.state;
    const got = ACHIEVEMENTS.filter((a) => state.unlocked[a.id] !== undefined).length;
    setText(this.summary, tr('{0} of {1} unlocked', [got, ACHIEVEMENTS.length]));
    this.list.replaceChildren(
      ...ACHIEVEMENTS.map((a) => {
        const at = state.unlocked[a.id];
        const progress = at === undefined ? achievementProgress(a, state) : null;
        return h(
          'li',
          { class: `ui-ach__item${at === undefined ? ' is-locked' : ''}` },
          h('span', { class: 'ui-ach__icon', text: a.icon, attrs: { 'aria-hidden': 'true' } }),
          h(
            'span',
            { class: 'ui-ach__text' },
            h('strong', { text: a.name() }),
            h('span', { text: a.desc() }),
            progress
              ? h('span', { class: 'ui-ach__bar', attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress.ratio * 100), 'aria-label': progress.label } }, h('span', { class: 'ui-ach__fill', attrs: { style: `width:${Math.round(progress.ratio * 100)}%` } }))
              : null,
          ),
          h('span', { class: 'ui-ach__when', text: at !== undefined ? formatDateTime(at) : progress ? progress.label : tr('Locked') }),
        );
      }),
    );
  }
}
