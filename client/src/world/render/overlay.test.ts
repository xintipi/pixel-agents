// Pure rules of the world text layer (bubbles and framing).
import { describe, expect, it } from 'vitest';
import { OVERVIEW_PAD, overviewFrame } from '../camera';
import { CROSSWALK, STREET_H, STREET_Y } from '../layout/exterior';
import { rationBubbles, waitBubbleText } from './overlay';

describe('balões', () => {
  it('espera: só o motivo, sem o prefixo redundante', () => {
    expect(waitBubbleText('approve a permission')).toBe('Approve a permission');
    expect(waitBubbleText('Needs you: choose an option')).toBe('Choose an option');
    expect(waitBubbleText(undefined)).toBe('Answer in terminal');
    expect(waitBubbleText('   ')).toBe('Answer in terminal');
  });

  it('visão geral: no máximo 1 balão com texto por área e 4 na tela (mais recentes primeiro)', () => {
    const items = [
      { room: 'a', prio: 50, changedAt: 10 },
      { room: 'a', prio: 50, changedAt: 30 },
      { room: 'a', prio: 50, changedAt: 20 },
      { room: 'b', prio: 30, changedAt: 99 },
      { room: 'c', prio: 50, changedAt: 1 },
      { room: 'd', prio: 50, changedAt: 2 },
      { room: 'e', prio: 50, changedAt: 3 },
    ];
    const keep = rationBubbles(items, 1, 4);
    expect(keep.size).toBe(4);
    expect(keep.has(1)).toBe(true); // the most recent of area "a"
    expect(keep.has(0) || keep.has(2)).toBe(false);
    expect(keep.has(3)).toBe(false); // lower priority loses to the other areas
  });
});

describe('visão geral', () => {
  const building = { x: 0, y: 0, w: 4 * 16 * 16, h: 29 * 16 };

  it('enquadra o prédio e a rua inteira na área livre (fora dos painéis), com folga para as placas acima', () => {
    const free = overviewFrame(building, 1440, 900, { top: 0, right: 0, bottom: 0, left: 0 });
    const ui = overviewFrame(building, 1440, 900, { top: 64, right: 0, bottom: 200, left: 320 });
    expect(ui.zoom).toBeLessThan(free.zoom);
    // the framing (signs + building + sidewalk, street and far sidewalk) fits between the top and bottom bars
    const h = (building.h + OVERVIEW_PAD.top + OVERVIEW_PAD.south) * ui.zoom;
    expect(h).toBeLessThanOrEqual(900 - 64 - 200 - 30);
    const w = (building.w + OVERVIEW_PAD.west + OVERVIEW_PAD.east) * ui.zoom;
    expect(w).toBeLessThanOrEqual(1440 - 320 - 30);
    // the far curb of the street is inside the frame: the center sits well below the building's middle
    expect(ui.cy + ((900 - 64 - 200 - 44) / 2) / ui.zoom).toBeGreaterThanOrEqual(STREET_Y + STREET_H + 16);
    // the entrance's stone path and the crossing (west of the building) too
    expect(ui.cx - ((1440 - 320 - 32) / 2) / ui.zoom).toBeLessThanOrEqual(CROSSWALK.x);
    expect(ui.dy).toBeGreaterThan(0);
  });
});
