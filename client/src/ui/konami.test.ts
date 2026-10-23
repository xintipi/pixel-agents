import { describe, expect, it } from 'vitest';
import { KonamiDetector, OUTAGE_WORD } from './konami';

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

describe('cúp điện ("cupdien")', () => {
  it('recognizes the word on its last letter, with its progress along the way', () => {
    const k = new KonamiDetector(OUTAGE_WORD);
    expect(type(k, 'cupdie').some(Boolean)).toBe(false);
    expect(k.progress).toBe(6);
    expect(k.push('n')).toBe(true);
    expect(k.progress).toBe(0);
    expect(type(k, 'xcupdien').at(-1)).toBe(true);
    expect(type(k, 'disco').some(Boolean)).toBe(false);
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
