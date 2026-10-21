import { describe, expect, it } from 'vitest';
import { KonamiDetector } from './konami';

const type = (k: KonamiDetector, text: string) => [...text].map((c) => k.push(c));

describe('código da disco', () => {
  it('reconhece "disco" inteiro, só na última letra', () => {
    const k = new KonamiDetector();
    expect(type(k, 'disco')).toEqual([false, false, false, false, true]);
    // uppercase counts (Caps Lock)
    expect(type(k, 'DISCO').at(-1)).toBe(true);
  });

  it('no meio de outras teclas; um erro recomeça, e "d" repetido não estraga', () => {
    const k = new KonamiDetector();
    expect(type(k, 'xxdisco').at(-1)).toBe(true);
    expect(type(k, 'ddisco').at(-1)).toBe(true);
    expect(type(k, 'disxco').some(Boolean)).toBe(false);
    expect(type(k, 'disc').some(Boolean)).toBe(false);
  });
});

describe('atalho da disco', () => {
  const ev = (key: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('Shift + D liga; D sozinho, Ctrl+Shift+D e Alt+D não', async () => {
    const { isDiscoShortcut } = await import('./konami');
    expect(isDiscoShortcut(ev('D', { shiftKey: true }))).toBe(true);
    expect(isDiscoShortcut(ev('d'))).toBe(false);
    expect(isDiscoShortcut(ev('D', { shiftKey: true, ctrlKey: true }))).toBe(false);
    expect(isDiscoShortcut(ev('d', { altKey: true }))).toBe(false);
  });
});
