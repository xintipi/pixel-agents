import { describe, expect, it } from 'vitest';
import { isTetSeason, officeThemeForWorld, seasonalThemeFor } from './api';

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
    // Sem preferência (opções antigas do mundo) vale o automático.
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
    // Mùng 1 Tết de 2026: 17 de fevereiro.
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

  it('o Habblaud World nunca recebe o Tết', () => {
    expect(officeThemeForWorld('tet')).toBe('none');
    for (const t of ['auto', 'none', 'christmas', 'halloween'] as const) expect(officeThemeForWorld(t)).toBe(t);
  });
});
