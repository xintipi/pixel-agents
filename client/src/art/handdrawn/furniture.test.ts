import { describe, expect, it } from 'vitest';
import { FURNITURE, type FurnitureKind } from '../api';
import { SEED_VARIATIONS, renderFurniture } from '../furniture';
import { handFurniture } from './furniture';
import { FURNITURE_DATA } from './furniture-data';

describe('mobília desenhada à mão', () => {
  it('cobre toda peça, em cada variante, estado e variação de detalhe', () => {
    for (const kind of Object.keys(FURNITURE) as FurnitureKind[]) {
      const def = FURNITURE[kind];
      for (const variant of def.variants ?? [undefined]) {
        for (let state = 0; state < (def.states ?? 1); state++) {
          for (let seed = 0; seed < (SEED_VARIATIONS[kind] ?? 1); seed++) {
            expect(handFurniture(kind, variant, state, seed), `${kind}|${variant ?? '-'}|${state}|${seed}`).toBeDefined();
          }
        }
      }
    }
  });
  it('as variações de detalhe são desenhos diferentes', () => {
    const a = handFurniture('desk', 'wood', 0, 0)!.base;
    const b = handFurniture('desk', 'wood', 0, 1)!.base;
    const same = a.buf.w === b.buf.w && a.buf.h === b.buf.h && a.buf.data.every((v, i) => v === b.buf.data[i]);
    expect(same).toBe(false);
  });
  it('cada camada tem grade retangular, cores na paleta e âncora inteira', () => {
    for (const [key, d] of Object.entries(FURNITURE_DATA)) {
      for (const s of [d.base, d.front]) {
        if (!s) continue;
        const w = s.rows[0].length;
        expect(s.rows.every((r) => r.length === w), key).toBe(true);
        for (const row of s.rows) for (const ch of row) if (ch !== '.') expect(s.palette[ch], `${key} '${ch}'`).toBeDefined();
        // the anchor is where the piece stands, which can lie outside the cropped drawing (a narrow wall item, say)
        expect(Number.isInteger(s.ax) && Number.isInteger(s.ay), key).toBe(true);
      }
    }
  });
  it('renderFurniture devolve o desenho à mão, com as regiões dinâmicas', () => {
    const arcade = renderFurniture('arcade');
    expect(arcade.base.rects?.screen).toBeDefined();
    const fromData = handFurniture('arcade', undefined, 0)!;
    expect(arcade.base.buf.w).toBe(fromData.base.buf.w);
    expect(arcade.base.ax).toBe(fromData.base.ax);
  });
});
