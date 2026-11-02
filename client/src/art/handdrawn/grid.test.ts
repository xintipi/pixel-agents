import { describe, expect, it } from 'vitest';
import { BENCH } from './bench';
import { BANHMI_CART } from './banhmi-cart';
import { BIKE } from './bike';
import { HUTIEU_CART } from './hutieu-cart';
import { TEA_TABLE } from './tea-table';
import { CAR } from './car';
import { SCOOTER_BACK } from './scooter-back';
import { SCOOTER_FRONT } from './scooter-front';
import { BIKE_LOAD_BUN } from './bike-load-bun';
import { BIKE_LOAD_SCRAP } from './bike-load-scrap';
import { FLOWERBED } from './flowerbed';
import { LAMP } from './lamp';
import { TEA_COOLER } from './tea-cooler';
import { gridProblems, gridSize, paintGrid, rotatePairs, type PixelGrid } from './grid';

describe('sprites desenhados à mão', () => {
  it('o banco e o poste são grades retangulares que só usam cores da paleta, no tamanho dos sprites que substituem', () => {
    expect(gridProblems(BENCH)).toEqual([]);
    expect(gridSize(BENCH)).toEqual({ w: 26, h: 14 });
    expect(gridProblems(LAMP)).toEqual([]);
    expect(gridSize(LAMP)).toEqual({ w: 10, h: 36 });
    for (const [grid, w, h] of [[FLOWERBED, 30, 14], [TEA_COOLER, 18, 22], [BIKE, 46, 36], [BIKE_LOAD_SCRAP, 20, 19], [BIKE_LOAD_BUN, 20, 19], [CAR, 60, 32], [SCOOTER_BACK, 30, 24], [SCOOTER_FRONT, 30, 24], [TEA_TABLE, 34, 22], [BANHMI_CART, 42, 36], [HUTIEU_CART, 56, 48]] as const) {
      expect(gridProblems(grid)).toEqual([]);
      expect(gridSize(grid)).toEqual({ w, h });
    }
  });
  it('o carro e a scooter vêm no vermelho da primeira cor da tabela do jogo, que é o que as outras cores substituem', () => {
    for (const c of ['#d9534a', '#a83a33', '#f08a80']) expect(Object.values(CAR.palette)).toContain(c);
    for (const g of [SCOOTER_BACK, SCOOTER_FRONT]) {
      const cores = Object.values(g.palette);
      expect(cores.some((c) => ['#c9302c', '#8f201d', '#e8665f'].includes(c))).toBe(true);
    }
  });
  it('a bicicleta traz as três cores de quadro que o jogo troca por variante', () => {
    const cores = Object.values(BIKE.palette);
    for (const c of ['#2f6a4e', '#5fae84', '#1f4a36']) expect(cores).toContain(c);
  });
  it('detecta linha torta e caractere fora da paleta', () => {
    const bad: PixelGrid = { palette: { a: '#000000' }, rows: ['aa', 'a', 'ab'] };
    expect(gridProblems(bad)).toEqual(['row 1 has 1 columns, expected 2', "row 2: 'b' is not in the palette"]);
  });
  it('espelha e recolore sem mexer na grade original', () => {
    const calls: [string, number, number, number, number][] = [];
    let style = '';
    const ctx = {
      set fillStyle(v: string) {
        style = v;
      },
      fillRect: (x: number, y: number, w: number, h: number) => calls.push([style, x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;
    const grid: PixelGrid = { palette: { a: '#111111', b: '#222222' }, rows: ['aab'] };
    paintGrid(ctx, grid, 0, 0, { flip: true, recolor: { '#222222': '#abcdef' } });
    expect(calls).toEqual([
      ['#abcdef', 0, 0, 1, 1],
      ['#111111', 1, 0, 2, 1],
    ]);
    expect(grid.rows).toEqual(['aab']);
  });
  it('gira os pares de cores do canteiro: cada cor vira a seguinte e dá a volta', () => {
    const pares = [['#a1', '#a2'], ['#b1', '#b2'], ['#c1', '#c2']];
    expect(rotatePairs(pares, 0)).toEqual({ '#a1': '#a1', '#a2': '#a2', '#b1': '#b1', '#b2': '#b2', '#c1': '#c1', '#c2': '#c2' });
    expect(rotatePairs(pares, 1)).toEqual({ '#a1': '#b1', '#a2': '#b2', '#b1': '#c1', '#b2': '#c2', '#c1': '#a1', '#c2': '#a2' });
  });
  it('pinta cada trecho de cor igual com um único fillRect e ignora o transparente', () => {
    const calls: [string, number, number, number, number][] = [];
    let style = '';
    const ctx = {
      set fillStyle(v: string) {
        style = v;
      },
      fillRect: (x: number, y: number, w: number, h: number) => calls.push([style, x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;
    paintGrid(ctx, { palette: { a: '#111111', b: '#222222' }, rows: ['aab.', '.bbb'] }, 10, 20);
    expect(calls).toEqual([
      ['#111111', 10, 20, 2, 1],
      ['#222222', 12, 20, 1, 1],
      ['#222222', 11, 21, 3, 1],
    ]);
  });
});
