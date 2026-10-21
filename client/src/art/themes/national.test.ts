import { describe, expect, it } from 'vitest';
import '../themes';
import type { Dir, Pose } from '../api';
import { appearanceFromSeed } from '../character/appearance';
import { POSE_FRAMES, renderCharacter } from '../character/render';
import { renderSeasonalProp } from '../seasonal';

const PROPS = ['national:flagpole', 'national:lotus', 'national:small', 'national:flags'] as const;
const COSTUMES = ['national:nonla', 'national:headband'] as const;

describe('tema Quốc khánh (national)', () => {
  it('desenha os enfeites dentro da folha, com margem transparente', () => {
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
  it('os acessórios mudam o desenho em todas as poses e direções', () => {
    for (const seed of [42, 7]) {
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
