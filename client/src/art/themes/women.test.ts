import '../themes';
import { describe, expect, it } from 'vitest';
import type { Dir, Pose } from '../api';
import { appearanceFromSeed } from '../character/appearance';
import { POSE_FRAMES, renderCharacter } from '../character/render';
import { renderSeasonalProp } from '../seasonal';
import { THEME_COSTUMES, THEME_PROPS } from './registry';
import { THEME_DECOR } from '../../world/render/themes/registry';
import '../../world/render/themes';

const PROPS = ['women:ganh', 'women:battrang', 'women:hoami', 'women:dongho'] as const;
const COSTUMES = ['women:nonla', 'women:khanvan'] as const;

describe('women theme art', () => {
  it('registers every prop and costume the decoration uses', () => {
    const kit = THEME_DECOR.get('women')!;
    for (const key of [...kit.tall, kit.small, kit.elevator, kit.wall!.prop]) expect(THEME_PROPS.has(key)).toBe(true);
    for (const key of kit.costumes) expect(THEME_COSTUMES.has(key)).toBe(true);
  });

  it('keeps every prop inside the sheet with a transparent margin', () => {
    for (const kind of PROPS) {
      const { buf } = renderSeasonalProp(kind);
      const bounds = buf.bounds()!;
      expect(buf.countOpaque()).toBeGreaterThan(40);
      expect(bounds.x).toBeGreaterThan(0);
      expect(bounds.y).toBeGreaterThan(0);
      expect(bounds.x + bounds.w).toBeLessThan(buf.w);
      expect(bounds.y + bounds.h).toBeLessThan(buf.h);
    }
  });

  it('draws the costumes in every pose and direction', () => {
    for (const seed of [7, 42]) {
      const appearance = appearanceFromSeed(seed);
      for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
        for (const pose of Object.keys(POSE_FRAMES) as Pose[]) {
          for (let frame = 0; frame < POSE_FRAMES[pose]; frame++) {
            const req = { appearance, dir, pose, frame };
            const plain = renderCharacter(req);
            for (const costume of COSTUMES) {
              const dressed = renderCharacter({ ...req, costume });
              expect(dressed.buf.data.some((byte, i) => byte !== plain.buf.data[i])).toBe(true);
              expect([dressed.ax, dressed.ay]).toEqual([plain.ax, plain.ay]);
            }
          }
        }
      }
    }
  });
});
