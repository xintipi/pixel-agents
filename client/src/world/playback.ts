// Timelapse in the world: during the replay the simulation runs on its own clock, sped up by a moderate
// animation factor (walking 1 h of recording in 6 s wouldn't fit in real steps), while the
// snapshots arrive on the recording clock, much faster. For the thresholds that compare the snapshot
// with "now" (nap after 10 min idle, shell wait stages, long-running foreground
// command), ages are preserved: the snapshot times are shifted to the world clock
// at the moment it is applied (rebaseSnapshot).
import type { OfficeSnapshot } from '../../../shared/types';

/**
 * World animation factor for a playback speed: ~square root of the speed, between 1 and 16
 * (60× -> 6, 180× -> 10, 600× -> 16). Beyond that the characters would just teleport.
 */
export function animScale(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.min(16, Math.max(1, Math.round(Math.sqrt(speed) * 0.75)));
}

/**
 * Shifts to the world clock the snapshot times the world compares with "now":
 * `statusSince` and the shells' start. Activities stay as they are (the world only compares them to each other).
 */
export function rebaseSnapshot(snap: OfficeSnapshot, delta: number): OfficeSnapshot {
  if (!delta) return snap;
  return {
    ...snap,
    serverTime: snap.serverTime + delta,
    agents: snap.agents.map((a) => {
      const out = { ...a, statusSince: a.statusSince + delta };
      if (a.shells) out.shells = a.shells.map((j) => ({ ...j, startedAt: j.startedAt + delta }));
      return out;
    }),
  };
}
