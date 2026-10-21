// What the Visit scene shows, without DOM (testable): the top banner, the side panel (rooms and agents, read-only), an
// agent's card and the building lights. Everything comes from the `WorldBuildingDetail` that came down from the world: fictional
// room names, name, role, tool and status of each agent, and no timing ("how long ago" doesn't exist in the visit).
import { tr } from '../../../../shared/i18n';
import { floorLabel } from '../../../../shared/world/floor-labels';
import { hidesAgents, WORLD_TOOL_ACCOUNTS, worldId } from '../../../../shared/world/office-from-world';
import type { WorldAgent, WorldBuildingDetail, WorldBuildingPublic } from '../../../../shared/world/protocol';
import { floorsLabel } from '../city/cards';
import type { VisitLight } from '../sim/sim';

/** The building lights in the visit: dark (paused, away), discreet (empty rooms lit) or live. */
export function visitLightOf(b: Pick<WorldBuildingPublic, 'state' | 'discreet'>): VisitLight {
  if (b.state === 'away') return 'away';
  return b.discreet === true ? 'discreet' : 'live';
}

/** "1 agent", "6 agents". */
export function agentsLabel(n: number): string {
  return n === 1 ? tr('1 agent') : tr('{0} agents', [n]);
}

/** "1 visitor now", "3 visitors now". */
export function visitorsLabel(n: number): string {
  return n === 1 ? tr('1 visitor now') : tr('{0} visitors now', [n]);
}

/** Agents that show up (in discreet and dark mode, none, even if one comes in the packet by mistake). */
function shownAgents(d: WorldBuildingDetail): number {
  if (hidesAgents(d.building)) return 0;
  return d.floors.reduce((n, f) => n + (Array.isArray(f.agents) ? f.agents.length : 0), 0);
}

export interface VisitBanner {
  /** "Helena's building" (or "Your building, as others see it"). */
  title: string;
  /** "3 floors · 6 agents · discreet mode". */
  details: string[];
  /** State badge: null when live. */
  mode: 'discreet' | 'away' | null;
}

/** The top banner: whose it is, how many floors and agents, and whether it's discreet or dark. */
export function visitBanner(d: WorldBuildingDetail, mine: boolean): VisitBanner {
  const b = d.building;
  const light = visitLightOf(b);
  const details = [floorsLabel(d.floors.length)];
  if (light === 'live') details.push(agentsLabel(shownAgents(d)));
  else details.push(light === 'away' ? tr('lights off') : tr('discreet mode'));
  return {
    title: mine ? tr('Your building, as others see it') : tr('{0}\'s building', [b.owner.name]),
    details,
    mode: light === 'live' ? null : light,
  };
}

export type VisitStatus = 'working' | 'waiting' | 'idle' | 'shell';

export interface VisitAgentRow {
  /** Agent id in the visit office (`world:` + world id): the same as the drawn character's. */
  id: string;
  name: string;
  role: string;
  tool: string;
  status: VisitStatus;
  statusText: string;
}

export interface VisitRoomRow {
  id: string;
  name: string;
  agents: VisitAgentRow[];
}

export interface VisitPanel {
  rooms: VisitRoomRow[];
  /** Why the rooms are empty (discreet, dark), or null. */
  empty: string | null;
}

const STATUS: readonly VisitStatus[] = ['working', 'waiting', 'idle', 'shell'];

/** "working", "waiting for the owner", "idle", "watching the terminal". */
export function statusText(s: VisitStatus): string {
  switch (s) {
    case 'working':
      return tr('working');
    case 'waiting':
      return tr('waiting for the owner');
    case 'shell':
      return tr('watching the terminal');
    default:
      return tr('idle');
  }
}

/** A panel row (name, role, tool and status: nothing else exists in the visit). */
export function agentRow(a: WorldAgent): VisitAgentRow {
  const status: VisitStatus = STATUS.includes(a.status) ? a.status : 'idle';
  const provider = a.provider === 'codex' ? 'codex' : 'claude';
  return {
    id: worldId(a.id),
    name: typeof a.name === 'string' && a.name ? a.name : tr('Agent'),
    role: a.kind === 'sub' ? tr('Subagent') : tr('Main agent'),
    tool: WORLD_TOOL_ACCOUNTS[provider].name,
    status,
    statusText: statusText(status),
  };
}

/** The side panel: each room (the translated fictional name) with its agents. */
export function visitPanel(d: WorldBuildingDetail): VisitPanel {
  const hidden = hidesAgents(d.building);
  const rooms = d.floors.map((f) => ({
    id: f.id,
    name: floorLabel(typeof f.label === 'string' ? f.label : ''),
    agents: hidden || !Array.isArray(f.agents) ? [] : f.agents.map(agentRow),
  }));
  const light = visitLightOf(d.building);
  const empty =
    light === 'away'
      ? tr('Lights off: the owner paused or doesn\'t have Habblaud open. The rooms are dark and empty.')
      : light === 'discreet'
        ? tr('Discreet mode: the owner doesn\'t show the agents. The rooms look empty, with the lights on.')
        : null;
  return { rooms, empty };
}

/** The panel agent by the visit office id (`world:...`), for the card. */
export function findAgent(d: WorldBuildingDetail, id: string): (VisitAgentRow & { room: string }) | null {
  if (hidesAgents(d.building)) return null;
  for (const f of d.floors) {
    for (const a of Array.isArray(f.agents) ? f.agents : []) {
      if (worldId(a.id) === id) return { ...agentRow(a), room: floorLabel(f.label) };
    }
  }
  return null;
}
