import { describe, expect, it } from 'vitest';
import { isMidAutumnSeason, isTetSeason, officeThemeForWorld, seasonalThemeFor, specialDayTheme } from './api';

describe('tema do escritório', () => {
  const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour);

  it('automático segue o calendário (hora local)', () => {
    expect(seasonalThemeFor('auto', at(9, 30, 23))).toBe('none');
    expect(seasonalThemeFor('auto', at(10, 1, 0))).toBe('halloween');
    expect(seasonalThemeFor('auto', at(10, 31, 23))).toBe('halloween');
    expect(seasonalThemeFor('auto', at(11, 1, 0))).toBe('christmas');
    expect(seasonalThemeFor('auto', at(12, 26, 23))).toBe('christmas');
    expect(seasonalThemeFor('auto', at(12, 27, 0))).toBe('none');
    expect(seasonalThemeFor('auto', at(1, 1))).toBe('none');
    expect(seasonalThemeFor('auto', at(7, 15))).toBe('none');
    // No preference (old world options) means automatic.
    expect(seasonalThemeFor(undefined, at(10, 13))).toBe('halloween');
  });

  it('escolha fixa vale o ano todo', () => {
    for (const date of [at(1, 1), at(10, 13), at(12, 1)]) {
      expect(seasonalThemeFor('none', date)).toBe('none');
      expect(seasonalThemeFor('christmas', date)).toBe('christmas');
      expect(seasonalThemeFor('halloween', date)).toBe('halloween');
      expect(seasonalThemeFor('tet', date)).toBe('tet');
    }
  });

  it('Tết: de 23 tháng Chạp a mùng 7, no automático só com a interface em vietnamita', () => {
    // Mùng 1 Tết 2026: February 17.
    expect(isTetSeason(at(2, 9, 23))).toBe(false);
    expect(isTetSeason(at(2, 10, 0))).toBe(true);
    expect(isTetSeason(at(2, 17))).toBe(true);
    expect(isTetSeason(at(2, 23, 23))).toBe(true);
    expect(isTetSeason(at(2, 24, 0))).toBe(false);
    expect(isTetSeason(new Date(2028, 0, 26))).toBe(true);
    expect(isTetSeason(new Date(2099, 0, 26))).toBe(false);
    expect(seasonalThemeFor('auto', at(2, 17), true)).toBe('tet');
    expect(seasonalThemeFor('auto', at(2, 17))).toBe('none');
    expect(seasonalThemeFor('auto', at(10, 13), true)).toBe('halloween');
    expect(seasonalThemeFor('auto', at(7, 15), true)).toBe('none');
  });

  it('Trung thu: a semana antes da lua cheia e dois dias depois; com a interface em vietnamita, antes do Halloween', () => {
    // rằm tháng 8 de 2026: 25 de setembro; de 2025: 6 de outubro
    expect(isMidAutumnSeason(at(9, 17, 23))).toBe(false);
    expect(isMidAutumnSeason(at(9, 18))).toBe(true);
    expect(isMidAutumnSeason(at(9, 27))).toBe(true);
    expect(isMidAutumnSeason(at(9, 28))).toBe(false);
    expect(seasonalThemeFor('auto', at(9, 25), true)).toBe('midautumn');
    expect(seasonalThemeFor('auto', at(9, 25))).toBe('none');
    expect(seasonalThemeFor('auto', new Date(2025, 9, 5), true)).toBe('midautumn');
    expect(seasonalThemeFor('auto', new Date(2025, 9, 5))).toBe('halloween');
    expect(seasonalThemeFor('midautumn', at(1, 1))).toBe('midautumn');
  });

  it('dias especiais (interface em vietnamita): Valentine, Mulher, Programador, Quốc khánh e Thiếu nhi', () => {
    const on = (m: number, d: number, y = 2026) => specialDayTheme(new Date(y, m - 1, d, 12));
    expect([on(2, 11), on(2, 12), on(2, 15), on(2, 16)]).toEqual([null, 'valentine', 'valentine', null]);
    expect([on(3, 8), on(10, 20), on(10, 22)]).toEqual(['women', 'women', null]);
    expect(on(9, 13)).toBe('devday'); // 256º dia de 2026
    expect(on(9, 12, 2028)).toBe('devday'); // ano bissexto
    expect([on(4, 30), on(5, 1), on(9, 2)]).toEqual(['national', 'national', 'national']);
    expect([on(6, 1), on(5, 30), on(6, 3)]).toEqual(['children', 'children', null]);
    expect(on(7, 15)).toBeNull();
    // no automático só com a interface em vietnamita; Trung thu ganha de todos
    expect(seasonalThemeFor('auto', new Date(2026, 1, 14), true)).toBe('valentine');
    expect(seasonalThemeFor('auto', new Date(2026, 1, 14))).toBe('none');
    expect(seasonalThemeFor('auto', new Date(2026, 9, 20), true)).toBe('women');
    expect(seasonalThemeFor('auto', new Date(2026, 9, 20))).toBe('halloween');
    for (const t of ['valentine', 'women', 'devday', 'national', 'children'] as const) expect(officeThemeForWorld(t)).toBe('none');
  });

  it('o Habblaud World nunca recebe o Tết', () => {
    expect(officeThemeForWorld('tet')).toBe('none');
    expect(officeThemeForWorld('midautumn')).toBe('none');
    for (const t of ['auto', 'none', 'christmas', 'halloween'] as const) expect(officeThemeForWorld(t)).toBe(t);
  });
});
