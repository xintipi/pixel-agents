// Little office things in pixel art (procedural, same style as the furniture: ramps and outline at the end): the robot
// vacuum and its dock, the break-room aquarium (without the fish, which swim on top, drawn every frame)
// and the open pizza box from the party.
import { ramp } from './core/color';
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

const BODY = ramp('#5d6476', 0.08);
const TOP = ramp('#3b4150', 0.08);

/** Robot vacuum seen from above, a low disc: green light (cleaning) or orange blinking (low battery). */
export function renderRobot(frame: number, led: 'green' | 'orange' | 'blue'): BufSprite {
  const b = new PixelBuf(20, 12);
  b.shadow(10, 10, 8, 2, '#252c39', 0.28);
  b.ellipse(10, 7, 8, 3.6, BODY.dk);
  b.ellipse(10, 6, 8, 3.4, BODY.base);
  b.ellipse(10, 5.5, 6, 2.4, TOP.base);
  b.ellipse(8, 5, 2.5, 1, TOP.lt);
  b.hline(4, 15, 8, BODY.dd);
  // little brush spinning at the front
  const brush = frame % 2 === 0 ? [[3, 8], [4, 9]] : [[3, 9], [4, 8]];
  for (const [x, y] of brush) b.set(x, y, '#c9ced8');
  const on = led !== 'orange' || frame % 2 === 0;
  b.set(13, 5, on ? (led === 'green' ? '#5ff08a' : led === 'blue' ? '#6cc8ff' : '#ffae3c') : TOP.dk);
  b.outline();
  return { buf: b, ax: 10, ay: 10 };
}

/** Charging dock against the wall: a low box with a blue light. */
export function renderDock(): BufSprite {
  const b = new PixelBuf(16, 10);
  b.rect(3, 3, 10, 5, '#4a5060');
  b.rect(3, 3, 10, 2, '#5d6476');
  b.rect(5, 8, 6, 1, '#2f3440');
  b.set(8, 4, '#6cc8ff');
  b.outline();
  return { buf: b, ax: 8, ay: 9 };
}

const WOOD = ramp('#8a5a3b', 0.08);

/** Aquarium on a wooden cabinet: glass, blue water, sand, a rock and little plants. The fish come later. 30×34. */
export function renderAquarium(): BufSprite {
  const b = new PixelBuf(32, 36);
  b.shadow(16, 33, 13, 2, '#252c39', 0.22);
  // cabinet
  b.rect(3, 22, 26, 11, WOOD.base);
  b.rect(3, 22, 26, 2, WOOD.lt);
  b.vline(16, 24, 32, WOOD.dk);
  b.set(13, 28, '#e3c07a');
  b.set(19, 28, '#e3c07a');
  // tank
  b.rect(3, 4, 26, 18, '#2f6f9a');
  b.rect(4, 5, 24, 16, '#4f9fd0');
  b.rect(4, 5, 24, 3, '#7cc2ea');
  b.rect(4, 18, 24, 3, '#e8d6a3'); // sand
  b.hline(4, 27, 18, '#d4bf86');
  b.rect(19, 15, 5, 3, '#7c8494'); // rock
  b.rect(20, 14, 3, 1, '#9aa2b2');
  for (const [x, h] of [[7, 9], [9, 6], [25, 7]]) {
    for (let i = 0; i < h; i++) b.set(x + (i % 2), 17 - i, i % 3 === 0 ? '#7fd17a' : '#4fae58');
  }
  // lid and the reflection on the glass
  b.rect(2, 3, 28, 2, '#3b4150');
  b.vline(6, 9, 13, '#c9e9fb');
  b.outline();
  return { buf: b, ax: 16, ay: 33 };
}

/** Water area of the aquarium (relative to the anchor), for the fish and the food. */
export const AQUARIUM_WATER = { x: -12, y: -28, w: 24, h: 13 };

/** Open pizza box on the table: lid tilted back, pepperoni pizza. 16×10. */
export function renderPizzaBox(): BufSprite {
  const b = new PixelBuf(18, 13);
  b.rect(3, 2, 12, 4, '#d9b37a'); // lid
  b.rect(4, 3, 10, 2, '#c99e62');
  b.rect(2, 6, 14, 5, '#e2c088'); // bottom
  b.ellipse(9, 8.5, 5.5, 2.2, '#e7a33e');
  b.ellipse(9, 8.5, 4.5, 1.6, '#f3cf5c');
  for (const [x, y] of [[6, 8], [9, 7], [12, 9], [8, 9], [11, 8]]) b.set(x, y, '#c4402f');
  b.outline();
  return { buf: b, ax: 9, ay: 11 };
}
