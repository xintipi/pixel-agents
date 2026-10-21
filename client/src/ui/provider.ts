// Which tool each thing belongs to (Claude Code or Codex) and the texts that change with it. Pure (no DOM): tested in
// ui/provider.test.ts. In the protocol, an absent `provider` means Claude Code (shared/types.ts); here everything defaults to that.
//
// Codex visual identity (no one's logo): the account chip is "outlined" (dark background, border and letter in the
// account color, stepped corners) and, where there is room, a "Codex" text badge next to the name.
import type { AccountInfo, OfficeSnapshot, Provider } from '../../../shared/types';
import { shortcutHint } from './model';
import { tr } from '../../../shared/i18n';

/** Name of each tool as it appears in texts. */
export const PROVIDER_NAME: Record<Provider, string> = { claude: 'Claude Code', codex: 'Codex' };

/** Tool of an agent, account, session or request (absent = Claude Code). */
export function providerOf(x: { provider?: Provider } | null | undefined): Provider {
  return x?.provider ?? 'claude';
}

export function isCodex(x: { provider?: Provider } | null | undefined): boolean {
  return x?.provider === 'codex';
}

/**
 * Does the account id look like a Codex folder (".codex", ".codex-trabalho", ".codex~2", "demo:.codex")? Only for when the
 * account is no longer in the snapshot (e.g. history, "My day"): with the account at hand, its `provider` wins.
 */
export function looksLikeCodexId(id: string): boolean {
  return /(?:^|[:/\\])\.?codex(?:[-_.~]|$)/i.test(id);
}

/** The account's tool: the snapshot's; without it, the caller's hint or the shape of the id. */
export function accountProvider(account: Pick<AccountInfo, 'provider'> | undefined, fallbackId = '', hint?: Provider): Provider {
  if (account) return providerOf(account);
  return hint ?? (looksLikeCodexId(fallbackId) ? 'codex' : 'claude');
}

/**
 * Chip letter of an account not in the snapshot: the first letter after the folder prefix
 * (".claude-conta2" -> "C", ".codex-trabalho" -> "T"). The default Codex folder (".codex") becomes "X"; Claude Code's,
 * "?" (as before). Never returns "." or empty.
 */
export function fallbackShort(id: string, provider: Provider = accountProvider(undefined, id)): string {
  const rest = id
    .replace(/^.*:/, '')
    .replace(/~\d+$/, '')
    .replace(/^\.?(?:claude|codex)(?=[-_.]|$)[-_.]?/i, '');
  const letter = /[\p{L}\p{N}]/u.exec(rest)?.[0];
  if (letter) return letter.toUpperCase();
  return provider === 'codex' ? 'X' : '?';
}

/** The "Codex" badge next to the account name (does not repeat when the name already says "Codex"). */
export function showsProviderTag(provider: Provider, accountName = ''): boolean {
  return provider === 'codex' && !/codex/i.test(accountName);
}

/** Account chip label (tooltip and screen readers): "Account C (dev@x.com)", "Codex · Team plan". */
export function accountChipLabel(account: Pick<AccountInfo, 'name' | 'email' | 'plan' | 'provider'> | undefined, fallbackId: string, provider: Provider): string {
  if (!account) return fallbackId ? `${fallbackId}${provider === 'codex' ? ' · Codex' : ''}` : tr('Unknown account');
  if (provider !== 'codex') return `${account.name}${account.email ? ` (${account.email})` : ''}`;
  const tag = showsProviderTag(provider, account.name) ? ' · Codex' : '';
  return `${account.name}${tag}${account.plan ? tr(' · {0} plan', [account.plan]) : ''}`;
}

/**
 * Empty office text. The shortcuts ("shortcuts c or d") are only for Claude Code accounts, which come from shell
 * aliases (a Codex account's letter is not a shortcut); Codex only comes in when there is a Codex account.
 */
export function emptyOfficeHint(accounts: readonly Pick<AccountInfo, 'short' | 'provider'>[]): string {
  const keys = shortcutHint(accounts.filter((a) => !isCodex(a)));
  if (!accounts.some(isCodex)) return tr('Open Claude Code in any project{0} and watch your agent arrive.', [keys ? ` (${keys})` : '']);
  return tr('Open Claude Code{0} or Codex in any project and watch your agent arrive.', [keys ? ` (${keys})` : '']);
}

/** Some Codex permission request waiting: the deadline is short and the card counts the seconds (1 s clock). */
export function hasCodexPermission(snap: Pick<OfficeSnapshot, 'agents'> | null): boolean {
  return !!snap?.agents.some((a) => a.permission && isCodex(a.permission) && a.status !== 'offline' && a.status !== 'done');
}

/** How to see Codex live and approve from the office (a Codex agent's drawer and help). */
export const CODEX_LIVE_HINT = tr('To see Codex live and approve from the office: `npm run codex:install`, then approve the hooks in `/hooks` in Codex.');

/** Codex approval policies (`approval_policy`), when the server sends them instead of the permission mode. */
const CODEX_APPROVALS: Record<string, string> = {
  untrusted: tr('Asks before almost everything'),
  'on-request': tr('Asks when needed'),
  'on-failure': tr('Asks when a command fails'),
  never: tr('Never asks'),
};

/** A Codex agent's approval in Portuguese (unknown value passes through as-is). */
export function codexApprovalLabel(policy: string | undefined): string {
  if (!policy) return '—';
  return CODEX_APPROVALS[policy] ?? policy;
}
