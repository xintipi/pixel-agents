import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { VI } from '../locales/vi';
import { introLabel, introOptions, isIntroId } from './intro';
import { INTRO_IDS, TRAIT_IDS } from './protocol';
import { isTraitId, parsePlayerTraits, TRAITS, traitsClash } from './traits';

afterEach(() => setLocale('en'));

/** Os textos em PT do contrato da Fase 1 (seção 3). */
const INTRO_PT: Record<string, string> = {
  night_owl: 'I code late at night',
  early_bird: 'I get up early to code',
  coffee: 'Powered by coffee',
  tea: 'Team tea',
  tabs: 'Team tabs',
  spaces: 'Team spaces',
  dark_mode: 'Dark mode, always',
  light_mode: 'Light mode, no fear',
  vim: 'Vim till the end',
  tests_first: 'I test before I write',
  ship_fast: 'I ship fast',
  refactor: 'Refactoring is my hobby',
  pixel_art: 'Pixel art fan',
  music: 'I code with music on',
  silence: 'I code in silence',
  cats: 'Cat person',
  dogs: 'Dog person',
  open_source: 'Open source all the way',
  learning: 'Always learning',
  hello: 'Hi, nice to meet you!',
};

describe('frases de apresentação', () => {
  it('os 20 ids com o texto do contrato, traduzidos nos 3 idiomas', () => {
    expect(Object.keys(INTRO_PT)).toEqual([...INTRO_IDS]);
    for (const id of INTRO_IDS) {
      expect(introLabel(id)).toBe(INTRO_PT[id]);
      expect(VI[INTRO_PT[id]], `${id}`).toBeTruthy();
    }
    expect(introOptions().map((o) => o.id)).toEqual([...INTRO_IDS]);
  });

  it('o rótulo segue o idioma ativo na hora', () => {
    setLocale('vi');
    expect(introLabel('coffee')).toBe(VI['Powered by coffee']);
    setLocale('en');
    expect(introLabel('coffee')).toBe('Powered by coffee');
  });

  it('id desconhecido (servidor mais novo) vira o próprio id, sem quebrar', () => {
    expect(introLabel('emacs' as never)).toBe('emacs');
  });

  it('isIntroId', () => {
    expect(isIntroId('vim')).toBe(true);
    expect(isIntroId('emacs')).toBe(false);
    expect(isIntroId(1)).toBe(false);
  });
});

describe('traços', () => {
  it('TRAITS na ordem de TRAIT_IDS (o sorteio de personaFor depende dela)', () => {
    expect(Object.keys(TRAITS)).toEqual([...TRAIT_IDS]);
    for (const id of TRAIT_IDS) expect(TRAITS[id].id).toBe(id);
  });

  it('pares que não combinam, nos dois sentidos', () => {
    expect(traitsClash('timidez', 'piadas')).toBe(true);
    expect(traitsClash('piadas', 'timidez')).toBe(true);
    expect(traitsClash('calma', 'competicao')).toBe(true);
    expect(traitsClash('games', 'leitura')).toBe(false);
  });

  it('escolha do jogador: 2 ou 3, conhecidos, sem repetir e sem conflito', () => {
    expect(parsePlayerTraits(['games', 'cafeina'])).toEqual(['games', 'cafeina']);
    expect(parsePlayerTraits(['games', 'cafeina', 'leitura'])).toEqual(['games', 'cafeina', 'leitura']);
    expect(parsePlayerTraits(['games'])).toBeNull();
    expect(parsePlayerTraits(['games', 'cafeina', 'leitura', 'calma'])).toBeNull();
    expect(parsePlayerTraits(['games', 'games'])).toBeNull();
    expect(parsePlayerTraits(['timidez', 'piadas'])).toBeNull();
    expect(parsePlayerTraits(['games', 'xadrez'])).toBeNull();
    expect(parsePlayerTraits('games')).toBeNull();
    expect(isTraitId('sonecas')).toBe(true);
    expect(isTraitId('soneca')).toBe(false);
  });
});
