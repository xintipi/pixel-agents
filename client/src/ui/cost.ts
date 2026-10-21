// Custo dos agentes na interface: a moeda em que aparece (dólar, ou real vietnamita pelo câmbio escolhido) e o aviso
// de quem gasta rápido demais. O valor vem do próprio Claude Code (AgentStats.costUSD, linhas cost-state do
// transcript); o Codex não grava custo, então os agentes dele ficam de fora. Puro: testável em node.
import type { AgentInfo } from '../../../shared/types';
import { intlLocale, tr } from '../../../shared/i18n';

export type CostCurrency = 'usd' | 'vnd';
/** Aviso de gasto: desligado ou o valor (US$) gasto em COST_WINDOW_MS que dispara. */
export type CostAlert = 'off' | '1' | '2' | '5';

/** Câmbio padrão (VND por US$), só para a conversão aproximada; muda em Configurações › Custo. */
export const DEFAULT_VND_RATE = 26_000;
export const VND_RATE_LIMITS = { min: 1_000, max: 100_000 };
/** Janela do aviso de gasto. */
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

/** Moeda e câmbio usados por formatCost (a UI chama ao carregar e a cada mudança das preferências). */
export function setCostDisplay(d: CostDisplay): void {
  display = { currency: d.currency, vndRate: clampVndRate(d.vndRate) };
}

export function clampVndRate(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_VND_RATE;
  return Math.round(Math.min(VND_RATE_LIMITS.max, Math.max(VND_RATE_LIMITS.min, n)));
}

/** Custo em dólares mostrado na moeda escolhida: "US$ 1,23", ou "≈ 32.000 ₫" (conversão pelo câmbio, arredondada). */
export function formatCost(usd: number, d: CostDisplay = display): string {
  if (d.currency === 'vnd') {
    const vnd = Math.round((usd * clampVndRate(d.vndRate)) / 100) * 100;
    return `≈ ${fmt('VND').format(vnd)}`.replace(/[  ]/g, ' ');
  }
  return fmt('USD').format(usd).replace(/[  ]/g, ' ');
}

/** Valor do aviso em dólares (undefined: desligado). */
export function costAlertUsd(a: CostAlert): number | undefined {
  return a === 'off' ? undefined : Number(a);
}

export interface CostBurn {
  agentId: string;
  /** Gasto (US$) dentro da janela, desde o último aviso deste agente. */
  spent: number;
}

/**
 * Quem gastou `threshold` dólares ou mais nos últimos COST_WINDOW_MS. Cada agente avisa uma vez por estouro: depois
 * do aviso, a conta recomeça do valor daquele momento. O custo que um agente já tinha quando apareceu não conta
 * (abrir a página não avisa de gastos antigos), e um custo que volta para trás (sessão nova no mesmo id) recomeça.
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
      // A amostra mais antiga que ainda cobre o começo da janela fica (é a base do gasto na janela).
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

/** Texto do aviso de gasto. */
export function costBurnText(name: string, spent: number): string {
  return tr('{0} spent {1} in the last 10 minutes.', [name, formatCost(spent)]);
}
