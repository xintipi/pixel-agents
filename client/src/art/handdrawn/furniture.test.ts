import { describe, expect, it } from 'vitest';
import { FURNITURE, type FurnitureKind } from '../api';
import { SEED_VARIATIONS, renderFurniture } from '../furniture';
import { handFurniture } from './furniture';
import { FURNITURE_DATA } from './furniture-data';

describe('mobília desenhada à mão', () => {
  it('cobre toda peça que não depende de semente, em cada variante e estado', () => {
    for (const kind of Object.keys(FURNITURE) as FurnitureKind[]) {
      if (SEED_VARIATIONS[kind]) continue;
      const def = FURNITURE[kind];
      for (const variant of def.variants ?? [undefined]) {
        for (let state = 0; state < (def.states ?? 1); state++) {
          expect(handFurniture(kind, variant, state), `${kind}|${variant ?? '-'}|${state}`).toBeDefined();
        }
      }
    }
  });
  it('as peças com semente continuam procedurais', () => {
    for (const kind of Object.keys(SEED_VARIATIONS)) expect(Object.keys(FURNITURE_DATA).some((k) => k.startsWith(`${kind}|`))).toBe(false);
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
