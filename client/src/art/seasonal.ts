// Procedural pixel-art decorations. Same scale as the office furniture.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type SeasonalProp = 'tree' | 'gift' | 'pumpkin' | 'ghost' | 'wreath' | 'bat' | 'mai' | 'dao' | 'kumquat' | 'lantern';

export function renderSeasonalProp(kind: SeasonalProp): BufSprite {
  const b = new PixelBuf(40, 64);
  const rect = (x: number, y: number, w: number, h: number, c: string) => b.rect(x, y, w, h, c);
  if (kind === 'tree') {
    b.shadow(20, 59, 17, 3, '#252c39', 0.22);
    rect(17, 49, 6, 9, '#80573d');
    for (let row = 0; row < 4; row++) {
      const y = 13 + row * 8;
      const half = 6 + row * 3;
      rect(20 - half, y, half * 2 + 1, 9, '#245644');
      rect(22 - half, y, half * 2 - 4, 6, '#387956');
      rect(22 - half, y + 1, half - 1, 3, '#4d9361');
    }
    b.vline(20, 5, 13, '#ffe0a0');
    b.hline(16, 24, 9, '#ffe0a0');
    rect(18, 7, 5, 5, '#ffc45d');
    for (const [x, y] of [[16, 20], [24, 24], [13, 31], [25, 36], [9, 42], [20, 43], [31, 44]]) {
      rect(x, y, 3, 3, '#e05250');
      b.set(x, y, '#ffb27b');
    }
    for (const [x, y] of [[21, 17], [15, 26], [23, 30], [15, 38], [26, 42], [11, 47]]) {
      rect(x, y, 2, 2, '#ffe8b2');
    }
    rect(3, 52, 10, 8, '#a82d42');
    rect(6, 51, 2, 9, '#e5c17b');
    rect(3, 54, 10, 1, '#e5c17b');
    rect(26, 51, 10, 9, '#e6b357');
    rect(30, 50, 2, 10, '#b33549');
    rect(26, 54, 10, 1, '#b33549');
  } else if (kind === 'gift') {
    b.shadow(20, 59, 9, 2, '#252c39', 0.2);
    rect(11, 49, 17, 11, '#bf3849');
    rect(11, 49, 17, 3, '#e35a58');
    rect(18, 49, 3, 11, '#efd1a0');
    rect(11, 54, 17, 2, '#efd1a0');
    rect(14, 46, 5, 3, '#e8b860');
    rect(21, 46, 5, 3, '#e8b860');
  } else if (kind === 'pumpkin') {
    b.shadow(20, 59, 11, 2, '#252c39', 0.2);
    rect(18, 41, 3, 6, '#557342');
    rect(11, 46, 18, 14, '#c56832');
    rect(8, 49, 24, 8, '#e18b39');
    rect(13, 46, 4, 13, '#f0a647');
    rect(23, 47, 3, 12, '#f0a647');
    rect(12, 50, 4, 3, '#523347');
    rect(24, 50, 4, 3, '#523347');
    rect(17, 56, 7, 2, '#523347');
    b.set(13, 51, '#ffd680');
    b.set(25, 51, '#ffd680');
    b.hline(18, 22, 56, '#ffd680');
  } else if (kind === 'ghost') {
    rect(15, 39, 10, 3, '#e0dae9');
    rect(12, 42, 16, 15, '#e0dae9');
    rect(14, 41, 11, 15, '#fff4ed');
    rect(10, 47, 4, 4, '#e0dae9');
    rect(26, 47, 4, 4, '#e0dae9');
    for (const x of [12, 18, 24]) rect(x, 56, 4, 3, '#e0dae9');
    rect(16, 46, 2, 3, '#574563');
    rect(23, 46, 2, 3, '#574563');
    rect(19, 51, 3, 2, '#574563');
  } else if (kind === 'wreath') {
    rect(12, 39, 16, 4, '#347653');
    rect(10, 43, 5, 10, '#245644');
    rect(25, 43, 5, 10, '#347653');
    rect(13, 53, 15, 4, '#245644');
    for (const [x, y] of [[14, 41], [26, 47], [12, 50], [23, 54]]) rect(x, y, 2, 2, '#e45c58');
    rect(15, 55, 4, 4, '#c93945');
    rect(21, 55, 4, 4, '#c93945');
    rect(19, 54, 2, 4, '#f07368');
  } else if (kind === 'mai' || kind === 'dao') {
    // Tết: flowering branches in a ceramic vase (yellow mai in the south, pink đào in the north).
    const [petal, light, heart] = kind === 'mai' ? ['#f2c23a', '#ffe27a', '#d9822b'] : ['#e886a6', '#ffc2d4', '#c2456d'];
    b.shadow(20, 59, 11, 2, '#252c39', 0.22);
    rect(13, 49, 15, 10, '#2f5f8f');
    rect(12, 48, 17, 3, '#3f78ad');
    rect(15, 53, 11, 2, '#e9d9a8');
    b.vline(20, 22, 48, '#6b4430');
    b.vline(21, 30, 48, '#5a3826');
    b.line(20, 38, 11, 27, '#6b4430');
    b.line(21, 34, 30, 22, '#6b4430');
    b.line(20, 30, 14, 16, '#6b4430');
    b.line(21, 28, 26, 13, '#5a3826');
    for (const [x, y] of [[10, 26], [13, 21], [15, 16], [18, 12], [22, 15], [26, 12], [29, 20], [31, 23], [24, 27], [16, 30], [12, 33], [27, 32], [19, 22], [8, 31], [33, 28], [23, 36]]) {
      rect(x - 1, y, 3, 1, petal);
      rect(x, y - 1, 1, 3, petal);
      b.set(x, y, heart);
      b.set(x - 1, y - 1, light);
    }
  } else if (kind === 'kumquat') {
    // Tết: a quất (kumquat) tree with little fruits, in a red pot.
    b.shadow(20, 59, 9, 2, '#252c39', 0.2);
    rect(14, 50, 13, 9, '#b8323b');
    rect(13, 49, 15, 2, '#d64848');
    rect(18, 52, 5, 4, '#f0c85a');
    rect(19, 44, 3, 6, '#6b4430');
    b.ellipse(20, 36, 10, 10, '#2f6b3f');
    b.ellipse(19, 34, 7, 7, '#3f8a4f');
    for (const [x, y] of [[13, 33], [17, 28], [24, 30], [26, 37], [15, 40], [21, 38], [11, 38], [23, 43], [20, 33]]) {
      rect(x, y, 2, 2, '#f39a2b');
      b.set(x, y, '#ffd27a');
    }
  } else if (kind === 'lantern') {
    // Tết: hanging red lantern with a golden fringe.
    b.vline(20, 36, 41, '#8a6a3a');
    rect(16, 41, 9, 2, '#e3b24c');
    rect(13, 43, 15, 10, '#c9303c');
    rect(12, 45, 17, 6, '#c9303c');
    rect(15, 44, 4, 8, '#e24b4f');
    b.vline(20, 43, 52, '#a8222f');
    rect(16, 53, 9, 2, '#e3b24c');
    for (const x of [17, 19, 21, 23]) b.vline(x, 55, 59, '#f0c85a');
  } else {
    rect(18, 51, 5, 6, '#47344f');
    rect(10, 50, 9, 4, '#47344f');
    rect(22, 50, 9, 4, '#47344f');
    rect(7, 48, 4, 4, '#47344f');
    rect(30, 48, 4, 4, '#47344f');
    rect(13, 53, 3, 3, '#47344f');
    rect(25, 53, 3, 3, '#47344f');
    b.set(19, 52, '#f5b95f');
    b.set(21, 52, '#f5b95f');
  }
  b.outline();
  return { buf: b, ax: 20, ay: 60 };
}
