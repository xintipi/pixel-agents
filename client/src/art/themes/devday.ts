// Programmer's Day theme art (the 256th day of the year), Vietnamese dev style: a server rack with a little rubber
// debugging duck on top, and a stack of red plastic stools with a tray of trà đá — the sidewalk tea stall (tall);
// a cà phê phin dripping into a glass (small); a red shop-sign banner with a yellow `</>` (walls and elevators);
// and two costumes: a nón bảo hiểm (half-shell motorbike helmet) and a green-tinted visor with a headset.
import { ramp } from '../core/color';
import { THEME_COSTUMES, THEME_PROPS } from './registry';

const SLATE = ramp('#3b4654', 0.06);
const GREEN = ramp('#5fbf7f', 0.08);
const AMBER = ramp('#e7a33e', 0.08);
const DUCK = ramp('#f2c94c', 0.07);
const STOOL = ramp('#d0393f', 0.07);
const ALU = ramp('#b9c0c8', 0.07);
const TEA = ramp('#d39a4a', 0.07);
const SIGN = ramp('#c42f35', 0.06);
const GOLD = '#f2c94c';
const COFFEE = '#3a2318';
const STRING = '#8a6a3a';
const HELMET = ramp('#5d9a63', 0.07);

// Server rack: dark slate cabinet on little feet, rows of server units with green/amber LEDs and vents, and a small
// rubber debugging duck sitting on top.
THEME_PROPS.set('devday:rack', (b) => {
  b.shadow(20, 59, 10, 2, '#252c39', 0.24);
  b.rect(12, 31, 17, 27, SLATE.dk);
  b.rect(12, 31, 17, 2, SLATE.lt); // top
  b.vline(12, 33, 57, SLATE.base);
  b.vline(28, 33, 57, SLATE.dd);
  b.rect(13, 58, 2, 1, SLATE.dd); // feet
  b.rect(26, 58, 2, 1, SLATE.dd);
  const units: [number, number][] = [[34, 4], [39, 4], [44, 3], [48, 4], [53, 4]];
  units.forEach(([y, h], i) => {
    b.rect(14, y, 13, h, SLATE.base);
    b.hline(14, 26, y, SLATE.hi);
    b.hline(14, 26, y + h - 1, SLATE.dd);
    for (let x = 20; x <= 25; x += 2) b.vline(x, y + 1, y + h - 2, SLATE.dk);
    b.set(15, y + 1, i % 3 === 1 ? AMBER.hi : GREEN.hi);
    b.set(17, y + 1, i % 2 === 0 ? GREEN.lt : GREEN.dd);
    if (h > 3) b.set(15, y + 2, i % 2 === 0 ? AMBER.base : GREEN.base);
  });
  b.line(26, 41, 29, 44, '#4f8fd6'); // patch cable
  b.line(29, 44, 27, 47, '#4f8fd6');
  // rubber duck on top
  b.rect(15, 27, 7, 4, DUCK.base);
  b.hline(15, 21, 30, DUCK.dk);
  b.set(14, 27, DUCK.lt); // tail
  b.rect(19, 23, 4, 4, DUCK.base);
  b.set(19, 23, DUCK.hi);
  b.rect(23, 25, 2, 1, '#e8813a'); // beak
  b.set(21, 24, '#2a1f26'); // eye
});

// Sidewalk tea stall: a stack of red plastic stools with an aluminium tray, a jug of trà đá and two glasses on top.
THEME_PROPS.set('devday:stools', (b) => {
  b.shadow(20, 59, 11, 2, '#252c39', 0.24);
  // stack body: a trapezoid flaring towards the floor
  for (let y = 41; y <= 58; y++) {
    const half = 6 + Math.floor((y - 41) / 5);
    b.hline(20 - half, 20 + half, y, STOOL.base);
    b.set(20 - half, y, STOOL.lt);
    b.set(20 + half, y, STOOL.dk);
  }
  // rims of each stacked stool
  for (const y of [41, 44, 47, 50, 53]) {
    const half = 6 + Math.floor((y - 41) / 5);
    b.hline(20 - half, 20 + half, y, STOOL.hi);
    b.hline(20 - half, 20 + half, y + 1, STOOL.dk);
  }
  b.rect(18, 42, 5, 1, STOOL.dd); // handle slot on the top seat
  // arch between the legs of the bottom stool
  b.clearRect(15, 56, 11, 3);
  b.hline(15, 25, 55, STOOL.dd);
  // aluminium tray
  b.hline(11, 29, 39, ALU.hi);
  b.hline(10, 30, 40, ALU.dk);
  // plastic pitcher of iced tea: see-through, with ice cubes floating
  b.rect(12, 31, 6, 8, '#e9eef0');
  b.rect(12, 33, 6, 6, TEA.lt);
  b.vline(17, 33, 38, TEA.base);
  b.hline(12, 17, 33, TEA.hi);
  b.set(13, 34, '#ffffff');
  b.set(15, 35, '#f7f3e6');
  b.set(14, 37, '#f7f3e6');
  b.vline(18, 32, 36, '#cfd7da'); // handle
  b.set(11, 31, '#cfd7da'); // spout
  // three small glasses of trà đá with ice
  for (const x of [20, 24, 28]) {
    b.rect(x, 35, 3, 4, TEA.lt);
    b.hline(x, x + 2, 35, '#eef4f6');
    b.set(x + 1, 36, '#ffffff');
    b.vline(x + 2, 36, 38, TEA.base);
  }
});

// Cà phê phin: an aluminium drip filter on a glass of black coffee, a drop falling between them.
THEME_PROPS.set('devday:phin', (b) => {
  b.shadow(20, 59, 7, 2, '#252c39', 0.2);
  // glass
  b.rect(15, 50, 10, 9, '#d9e4e8');
  b.rect(16, 53, 8, 5, COFFEE);
  b.hline(16, 23, 53, '#6b4430'); // crema line
  b.vline(15, 50, 58, '#eef4f6');
  b.vline(24, 50, 58, '#a9b6bd');
  b.hline(15, 24, 58, '#a9b6bd');
  b.set(20, 51, COFFEE); // drip
  // filter plate and cup
  b.hline(12, 27, 49, ALU.dk);
  b.hline(13, 26, 48, ALU.base);
  b.rect(15, 43, 10, 5, ALU.base);
  b.vline(15, 43, 47, ALU.hi);
  b.vline(16, 43, 47, ALU.lt);
  b.vline(24, 43, 47, ALU.dk);
  // lid with knob
  b.hline(14, 25, 42, ALU.lt);
  b.hline(16, 23, 41, ALU.hi);
  b.rect(19, 39, 2, 2, ALU.dk);
  // steam
  for (const [x, y] of [[23, 38], [24, 37], [23, 36]]) b.set(x, y, '#e8eef0');
});

// Red shop-sign banner hung on two strings, with a yellow border and a yellow "</>".
THEME_PROPS.set('devday:sign', (b) => {
  b.set(20, 31, AMBER.base); // nail
  b.line(20, 32, 12, 37, STRING);
  b.line(20, 32, 28, 37, STRING);
  b.rect(10, 38, 21, 11, SIGN.base);
  // thin gold border
  b.hline(10, 30, 38, GOLD);
  b.hline(10, 30, 48, '#d9a13a');
  b.vline(10, 38, 48, GOLD);
  b.vline(30, 38, 48, '#d9a13a');
  // "<"
  b.set(16, 40, GOLD);
  b.set(15, 41, GOLD);
  b.set(14, 42, GOLD);
  b.set(13, 43, GOLD);
  b.set(14, 44, GOLD);
  b.set(15, 45, GOLD);
  b.set(16, 46, GOLD);
  // "/"
  b.line(21, 40, 19, 46, GOLD);
  // ">"
  b.set(24, 40, GOLD);
  b.set(25, 41, GOLD);
  b.set(26, 42, GOLD);
  b.set(27, 43, GOLD);
  b.set(26, 44, GOLD);
  b.set(25, 45, GOLD);
  b.set(24, 46, GOLD);
  // tassels
  for (const x of [11, 29]) {
    b.vline(x, 49, 51, GOLD);
    b.set(x, 52, '#d9822b');
  }
});

// Nón bảo hiểm: a green half-shell motorbike helmet with a light rim and a chin strap.
THEME_COSTUMES.set('devday:helmet', (b, x, y) => {
  b.rect(x + 3, y - 3, 8, 1, HELMET.lt);
  b.rect(x + 1, y - 2, 12, 2, HELMET.base);
  b.rect(x, y, 14, 3, HELMET.base);
  b.hline(x + 4, x + 7, y - 2, HELMET.hi); // shine
  b.hline(x + 2, x + 4, y - 1, HELMET.lt);
  b.hline(x + 9, x + 12, y + 1, HELMET.dk);
  b.hline(x - 1, x + 14, y + 3, '#e9e4d6'); // rim
  b.set(x + 7, y - 1, GOLD); // little logo
  // chin strap down the sides
  b.vline(x, y + 4, y + 10, '#3a3a40');
  b.vline(x + 13, y + 4, y + 10, '#3a3a40');
});

// Green-tinted visor (eyeshade) with a headset: band across the top, ear cups and a mic on one side.
THEME_COSTUMES.set('devday:visor', (b, x, y) => {
  b.hline(x + 2, x + 11, y - 1, SLATE.base); // headband
  b.vline(x + 1, y, y + 3, SLATE.base);
  b.vline(x + 12, y, y + 3, SLATE.base);
  b.rect(x - 1, y + 4, 2, 4, SLATE.dk); // ear cups
  b.rect(x + 13, y + 4, 2, 4, SLATE.dk);
  b.set(x - 1, y + 5, GREEN.hi);
  b.line(x, y + 8, x + 3, y + 10, SLATE.lt); // mic boom
  b.set(x + 4, y + 10, AMBER.base);
  b.hline(x + 1, x + 12, y + 3, GREEN.dk);
  b.hline(x + 1, x + 12, y + 4, GREEN.lt);
  b.hline(x + 3, x + 6, y + 4, GREEN.hi);
});
