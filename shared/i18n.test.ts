import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, getLocale, intlLocale, LOCALES, normalizeLocale, serverLocale, setLocale, tr } from './i18n';
import { VI } from './locales/vi';

const placeholders = (s: string) => new Set(s.match(/\{\w+\}/g) ?? []);

describe('i18n', () => {
  afterEach(() => setLocale('en'));

  it('tests run in English (the source language), whatever the machine language', () => {
    expect(getLocale()).toBe('en');
  });

  it('only Vietnamese and English, Vietnamese by default', () => {
    expect(LOCALES.map((l) => l.id)).toEqual(['vi', 'en']);
    expect(DEFAULT_LOCALE).toBe('vi');
  });

  it('recognizes browser and system language formats', () => {
    expect(normalizeLocale('vi')).toBe('vi');
    expect(normalizeLocale('vi-VN')).toBe('vi');
    expect(normalizeLocale('vi_VN.UTF-8')).toBe('vi');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('en_GB.UTF-8')).toBe('en');
    // The languages that were removed fall back to the default.
    expect(normalizeLocale('pt-BR')).toBeUndefined();
    expect(normalizeLocale('fr')).toBeUndefined();
    expect(normalizeLocale('es_AR.UTF-8')).toBeUndefined();
    expect(normalizeLocale('')).toBeUndefined();
    expect(normalizeLocale(null)).toBeUndefined();
  });

  it('in English returns the text itself, with the placeholders filled', () => {
    expect(tr('Reading {0}', ['app.ts'])).toBe('Reading app.ts');
    expect(tr('Text nobody translated')).toBe('Text nobody translated');
    expect(intlLocale()).toBe('en-US');
  });

  it('in Vietnamese translates, and an untranslated text stays in English', () => {
    setLocale('vi');
    expect(tr('Reading {0}', ['app.ts'])).toBe('Đang đọc app.ts');
    expect(tr('Text nobody translated')).toBe('Text nobody translated');
    expect(intlLocale()).toBe('vi-VN');
  });

  it('placeholders without an argument stay as they are (named ones are filled by the caller)', () => {
    expect(tr('I won {a} to {b}! 🏆')).toBe('I won {a} to {b}! 🏆');
    expect(tr('{0} and {1}', ['one'])).toBe('one and {1}');
  });

  it('server: HABBLAUD_LANG picks the language; otherwise Vietnamese, whatever the system language', () => {
    expect(serverLocale({ HABBLAUD_LANG: 'en' })).toBe('en');
    expect(serverLocale({ HABBLAUD_LANG: 'vi_VN.UTF-8' })).toBe('vi');
    expect(serverLocale({ LANG: 'en_US.UTF-8' })).toBe('vi');
    expect(serverLocale({ HABBLAUD_LANG: 'pt-BR' })).toBe('vi');
    expect(serverLocale({})).toBe('vi');
  });

  it('no translation is empty, loses or invents placeholders', () => {
    for (const [en, t] of Object.entries(VI)) {
      expect(t.trim(), en).not.toBe('');
      const original = placeholders(en);
      for (const p of placeholders(t)) expect(original.has(p), `${en} -> ${t}`).toBe(true);
      for (const p of original) expect(placeholders(t).has(p), `${en} -> ${t}`).toBe(true);
    }
  });
});
