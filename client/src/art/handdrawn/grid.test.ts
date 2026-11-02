import { describe, expect, it } from 'vitest';
import { BENCH } from './bench';
import { BANHTRANG_STAND } from './banhtrang-stand';
import { BUSH } from './bush';
import { PINE } from './pine';
import { REPAIR_BASIN } from './repair-basin';
import { REPAIR_COMPRESSOR } from './repair-compressor';
import { REPAIR_RACK } from './repair-rack';
import { REPAIR_SIGN } from './repair-sign';
import { REPAIR_STOOL } from './repair-stool';
import { TRASH_CART } from './trash-cart';
import { TREE } from './tree';
import { BUS } from './bus';
import { BUS_SHELTER } from './bus-shelter';
import { BUS_SIGN } from './bus-sign';
import { HEDGE } from './hedge';
import { PARASOL } from './parasol';
import { PET_CAT } from './pet-cat';
import { PET_DOG } from './pet-dog';
import { ROCK } from './rock';
import { TOTEM } from './totem';
import { CARGO_FLOWERS } from './cargo-flowers';
import { CARGO_FOAM } from './cargo-foam';
import { CARGO_PEACH } from './cargo-peach';
import { CARGO_PLANT } from './cargo-plant';
import { CARGO_WATER } from './cargo-water';
import { CROSSING_SIGN } from './crossing-sign';
import { DANCE_SPEAKER } from './dance-speaker';
import { TEA_STACK } from './tea-stack';
import { TEA_STOOL } from './tea-stool';
import { CARGO_FLOWERS_2 } from './cargo-flowers-2';
import { CARGO_PEACH_2 } from './cargo-peach-2';
import { CARGO_PEACH_3 } from './cargo-peach-3';
import { CARGO_PLANT_2 } from './cargo-plant-2';
import { CARGO_PLANT_3 } from './cargo-plant-3';
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
    for (const [grid, w, h] of [[FLOWERBED, 30, 14], [TEA_COOLER, 18, 22], [BIKE, 46, 36], [BIKE_LOAD_SCRAP, 20, 19], [BIKE_LOAD_BUN, 20, 19], [CAR, 60, 32], [SCOOTER_BACK, 30, 24], [SCOOTER_FRONT, 30, 24], [TEA_TABLE, 34, 22], [BANHMI_CART, 42, 36], [HUTIEU_CART, 56, 48], [TRASH_CART, 44, 36], [BANHTRANG_STAND, 32, 26], [REPAIR_RACK, 30, 30], [REPAIR_SIGN, 18, 18], [REPAIR_COMPRESSOR, 20, 16], [REPAIR_STOOL, 12, 8], [REPAIR_BASIN, 18, 9], [TREE, 36, 48], [PINE, 28, 48], [BUSH, 22, 16], [BUS, 88, 46], [BUS_SHELTER, 64, 50], [BUS_SIGN, 22, 58], [PARASOL, 32, 34], [HEDGE, 34, 16], [ROCK, 16, 12], [TOTEM, 14, 34], [PET_DOG, 128, 184], [PET_CAT, 128, 184], [CARGO_WATER, 24, 30], [CARGO_FOAM, 24, 30], [CARGO_PLANT, 24, 30], [CARGO_FLOWERS, 24, 30], [CARGO_PEACH, 24, 30], [TEA_STOOL, 12, 10], [TEA_STACK, 26, 30], [DANCE_SPEAKER, 18, 30], [CROSSING_SIGN, 18, 38], [CARGO_FLOWERS_2, 24, 30], [CARGO_PEACH_2, 24, 30], [CARGO_PEACH_3, 24, 30], [CARGO_PLANT_2, 24, 30], [CARGO_PLANT_3, 24, 30]] as const) {
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
  it('a árvore traz os quatro tons e o contorno que o jogo troca por variante, estação e flor', () => {
    const cores = Object.values(TREE.palette);
    for (const c of ['#2f6a43', '#3f8550', '#5aa45d', '#86c873', '#25463a']) expect(cores).toContain(c);
  });
  it('o guarda-sol traz as três cores do pano que o jogo troca por variante', () => {
    const cores = Object.values(PARASOL.palette);
    for (const c of ['#e8574a', '#f6efe2', '#a83a33']) expect(cores).toContain(c);
  });
  it('o buquê traz as cinco cores de flor que o jogo gira por semente, e o banquinho o vermelho que vira azul', () => {
    const flores = Object.values(CARGO_FLOWERS.palette);
    for (const c of ['#e8454a', '#f08ab8', '#ffffff', '#c92d3a', '#f2c94c']) expect(flores).toContain(c);
    const banco = Object.values(TEA_STOOL.palette);
    for (const c of ['#d8383e', '#9e2328', '#f06a6a']) expect(banco).toContain(c);
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
