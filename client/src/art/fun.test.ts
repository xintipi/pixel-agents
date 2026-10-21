import { describe, expect, it } from 'vitest';
import { renderDock, renderPizzaBox, renderRobot } from './fun';

describe('coisinhas do escritório (arte)', () => {
  it('robô (as três luzes, dois quadros), base e pizza cabem na folha com margem', () => {
    const sprites = [renderDock(), renderPizzaBox()];
    for (const led of ['green', 'orange', 'blue'] as const) for (const f of [0, 1]) sprites.push(renderRobot(f, led));
    for (const { buf } of sprites) {
      const b = buf.bounds()!;
      expect(buf.countOpaque()).toBeGreaterThan(20);
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThan(buf.w);
    }
    // the orange light blinks
    const a = renderRobot(0, 'orange').buf.data;
    const b = renderRobot(1, 'orange').buf.data;
    expect(a.some((v, i) => v !== b[i])).toBe(true);
  });
});
