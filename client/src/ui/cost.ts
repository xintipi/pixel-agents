// Agent cost in the UI: the currency it shows in (dollar, or Vietnamese dong at the chosen exchange rate) and the alert
// for whoever spends too fast. The value comes from Claude Code itself (AgentStats.costUSD, cost-state lines of the
// transcript); Codex does not record cost, so its agents are left out. Pure: testable in node.
import type { AgentInfo } from '../../../shared/types';
import { intlLocale, tr } from '../../../shared/i18n';

export type CostCurrency = 'usd' | 'vnd';
/** Spending alert: off or the amount (US$) spent within COST_WINDOW_MS that triggers it. */
export type CostAlert = 'off' | '1' | '2' | '5';

/** Default exchange rate (VND per US$), only for the approximate conversion; change it in Settings › Cost. */
export const DEFAULT_VND_RATE = 26_000;
export const VND_RATE_LIMITS = { min: 1_000, max: 100_000 };
/** Spending alert window. */
export const COST_WINDOW_MS = 10 * 60_000;

export interface CostDisplay {
  currency: CostCurrency;
  vndRate: number;
}

let display: CostDisplay = { currency: 'usd', vndRate: DEFAULT_VND_RATE };
const fmts = new Map<string, Intl.NumberFormat>();

function fmt(currency: 'USD' | 'VND'): Intl.NumberFormat {
  const key = `${intlLocale()}|${currency}`;
  let f = fmts.get(key);
  if (!f) {
    const digits = currency === 'VND' ? 0 : 2;
    f = new Intl.NumberFormat(intlLocale(), { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    fmts.set(key, f);
  }
  return f;
}

/** Currency and exchange rate used by formatCost (the UI calls it on load and on each preferences change). */
export function setCostDisplay(d: CostDisplay): void {
  display = { currency: d.currency, vndRate: clampVndRate(d.vndRate) };
}

export function clampVndRate(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_VND_RATE;
  return Math.round(Math.min(VND_RATE_LIMITS.max, Math.max(VND_RATE_LIMITS.min, n)));
}

/** Cost in dollars shown in the chosen currency: "US$ 1,23", or "≈ 32.000 ₫" (converted at the rate, rounded). */
export function formatCost(usd: number, d: CostDisplay = display): string {
  if (d.currency === 'vnd') {
    const vnd = Math.round((usd * clampVndRate(d.vndRate)) / 100) * 100;
    return `≈ ${fmt('VND').format(vnd)}`.replace(/[  ]/g, ' ');
  }
  return fmt('USD').format(usd).replace(/[  ]/g, ' ');
}

/** Alert amount in dollars (undefined: off). */
export function costAlertUsd(a: CostAlert): number | undefined {
  return a === 'off' ? undefined : Number(a);
}

export interface CostBurn {
  agentId: string;
  /** Spending (US$) within the window, since this agent's last alert. */
  spent: number;
}

/**
 * Who spent `threshold` dollars or more in the last COST_WINDOW_MS. Each agent alerts once per overrun: after
 * the alert, the count restarts from the value at that moment. The cost an agent already had when it appeared does not count
 * (opening the page does not alert about old spending), and a cost that goes backwards (new session on the same id) restarts.
 */
export class CostBurnWatch {
  private samples = new Map<string, { at: number; cost: number }[]>();

  observe(agents: readonly AgentInfo[], now: number, threshold: number | undefined): CostBurn[] {
    const out: CostBurn[] = [];
    const seen = new Set<string>();
    for (const a of agents) {
      const cost = a.stats.costUSD;
      if (cost === undefined || a.provider === 'codex') continue;
      seen.add(a.id);
      let list = this.samples.get(a.id);
      if (!list || (list.length && cost < list[list.length - 1].cost)) {
        this.samples.set(a.id, [{ at: now, cost }]);
        continue;
      }
      if (list[list.length - 1].cost !== cost) list.push({ at: now, cost });
      // The oldest sample that still covers the start of the window stays (it is the baseline for spending in the window).
      while (list.length > 1 && list[1].at <= now - COST_WINDOW_MS) list.shift();
      if (threshold === undefined) continue;
      const spent = cost - list[0].cost;
      if (spent >= threshold) {
        out.push({ agentId: a.id, spent });
        list = [{ at: now, cost }];
        this.samples.set(a.id, list);
      }
    }
    for (const id of this.samples.keys()) if (!seen.has(id)) this.samples.delete(id);
    return out;
  }
}

/** Spending alert text. */
export function costBurnText(name: string, spent: number): string {
  return tr('{0} spent {1} in the last 10 minutes.', [name, formatCost(spent)]);
}
