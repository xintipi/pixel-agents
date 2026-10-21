import { describe, expect, it } from 'vitest';
import { weatherFor } from './weather';

describe('tempo lá fora', () => {
  it('um por dia: o mesmo o dia todo, e a mistura do ano é mais sol que chuva e vento', () => {
    expect(weatherFor(new Date(2026, 9, 21, 8))).toBe(weatherFor(new Date(2026, 9, 21, 22)));
    const count = { clear: 0, rain: 0, wind: 0, snow: 0 };
    for (let d = 0; d < 365; d++) count[weatherFor(new Date(2026, 0, 1 + d, 12))]++;
    expect(count.clear).toBeGreaterThan(count.rain);
    expect(count.rain).toBeGreaterThan(30);
    expect(count.wind).toBeGreaterThan(30);
    expect(count.snow).toBeGreaterThan(5);
  });

  it('neve só no inverno (dezembro a fevereiro)', () => {
    for (let d = 0; d < 365; d++) {
      const date = new Date(2026, 0, 1 + d, 12);
      if (weatherFor(date) === 'snow') expect([11, 0, 1]).toContain(date.getMonth());
    }
  });
});
