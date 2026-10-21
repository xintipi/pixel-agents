// The building's World theme: the Settings › Appearance choice (world.json) resolved into what goes in the packet. The
// automatic one follows the office calendar (seasonalThemeFor, client/src/world/api.ts; a test checks they don't
// drift apart): Halloween from October 1 to 31, Christmas from November 1 to December 26 and, the rest of the year, none. The
// date is the server's local date (in Docker, UTC).
import type { WorldThemeChoice } from '../../shared/world/api';
import type { WorldTheme } from '../../shared/world/protocol';

export function resolveWorldTheme(choice: WorldThemeChoice | undefined, date: Date): WorldTheme {
  if (choice && choice !== 'auto') return choice;
  const month = date.getMonth();
  if (month === 9) return 'halloween';
  if (month === 10 || (month === 11 && date.getDate() <= 26)) return 'christmas';
  return 'none';
}
