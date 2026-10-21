// The core of the Visit scene, without DOM (testable): the building interior that came down from the world becomes the `Sim` office
// (shared/world/office-from-world.ts) and each `building.patch` is applied right away, with the building's `rev` checked
// (gap: ↑ `resync {building}`, at most one every 5 s). The only commands that leave here are `leave` and
// `resync {building}`, via the World scene stream (POST /api/world/cmd): no `move` (the position inside doesn't go to the
// world server) and no `view` (the viewer would take it as "back to the city").
import type { WorldSceneCommand, WorldSceneInside } from '../../../../shared/world/api';
import { applyBuildingPatch, checkBuildingRev, officeFromBuilding } from '../../../../shared/world/office-from-world';
import type { BuildingPatchMessage, WorldBuildingDetail } from '../../../../shared/world/protocol';
import type { OfficeSnapshot } from '../../../../shared/types';
import type { VisitLight } from '../sim/sim';
import { visitLightOf } from './model';

/** Minimum wait between two `resync {building}`. */
export const VISIT_RESYNC_GAP_MS = 5_000;

export interface VisitControllerDeps {
  /** Publishes the visit office (the visit world's `store.pushReplay`). */
  push(snap: OfficeSnapshot): void;
  /** Sends commands through the World scene stream (only `leave` and `resync {building}` leave here). */
  send(cmds: WorldSceneCommand[]): void;
  now(): number;
  /** Habblaud version (goes into the visit office's `meta.version`). */
  version: string;
  /** The interior changed (banner, panel, lights, theme). */
  changed?(): void;
}

export class VisitController {
  readonly id: string;
  rev: number;
  /** The interior as it is now (with patches applied). */
  detail: WorldBuildingDetail;
  snapshot: OfficeSnapshot;
  /** `leave` already sent: waiting for the `pos` (back to the street). */
  leaving = false;
  private resyncAt = -Infinity;

  constructor(
    inside: WorldSceneInside,
    private readonly deps: VisitControllerDeps,
  ) {
    this.id = inside.id;
    this.rev = inside.rev;
    this.detail = structuredClone(inside.detail);
    this.snapshot = officeFromBuilding(this.detail, deps.now(), { version: deps.version });
    deps.push(this.snapshot);
  }

  /** The building lights right now. */
  get light(): VisitLight {
    return visitLightOf(this.detail.building);
  }

  /**
   * The whole interior again (`building` from a `resync`, a repeated `enter` or a new stream's snapshot):
   * replaces everything, including the `rev`, but as a patch (whoever keeps the same status doesn't move).
   */
  replace(inside: Pick<WorldSceneInside, 'rev' | 'detail'>): void {
    const d = structuredClone(inside.detail);
    const r = applyBuildingPatch(this.snapshot, { rev: inside.rev, floors: d.floors, building: d.building }, this.deps.now());
    this.rev = inside.rev;
    this.detail = d;
    this.resyncAt = -Infinity;
    this.publish(r.snapshot);
  }

  /** A `building.patch`: applies the next one, ignores a repeated or old one and requests the building again on a gap. */
  patch(msg: Pick<BuildingPatchMessage, 'rev' | 'floors' | 'visitors' | 'building'>): 'apply' | 'stale' | 'resync' {
    const what = checkBuildingRev(this.rev, msg.rev);
    if (what === 'stale') return what;
    if (what === 'resync') {
      const now = this.deps.now();
      if (now - this.resyncAt >= VISIT_RESYNC_GAP_MS) {
        this.resyncAt = now;
        this.deps.send([{ t: 'resync', building: this.id }]);
      }
      return what;
    }
    // the current `building` decides whether agents show up when the patch only brings the floors
    const r = applyBuildingPatch(this.snapshot, msg, this.deps.now(), this.detail.building);
    this.rev = msg.rev;
    if (msg.floors) this.detail.floors = structuredClone(msg.floors);
    if (msg.building) this.detail.building = structuredClone(msg.building);
    if (typeof msg.visitors === 'number') this.detail.visitors = msg.visitors;
    this.publish(r.snapshot);
    return what;
  }

  /** Leave the building: `leave` (once); going back to the street is the `pos` the server replies with. */
  leave(): boolean {
    if (this.leaving) return false;
    this.leaving = true;
    this.deps.send([{ t: 'leave' }]);
    this.deps.changed?.();
    return true;
  }

  private publish(snap: OfficeSnapshot): void {
    if (snap !== this.snapshot) {
      this.snapshot = snap;
      this.deps.push(snap);
    }
    this.deps.changed?.();
  }
}
