// World notices in the scene: each id in NOTICE_IDS has its own text (or nothing, if only of interest for debugging),
// and an id this version does not know becomes the generic one. The door ones (Phase 4) say where I am: at the door
// or kicked out.
import { describe, expect, it } from 'vitest';
import { NOTICE_IDS } from '../../../../shared/world/protocol';
import { noticeText } from './notice';

describe('noticeText', () => {
  it('cada id do protocolo tem um texto próprio ou nenhum; um id desconhecido leva o genérico', () => {
    const generic = noticeText('id_novo');
    expect(generic).toBeTruthy();
    const texts = NOTICE_IDS.map((id) => noticeText(id));
    // No text: `ignored`, `invalid` and `view_required` (debugging only).
    expect(texts.filter((t) => t === null)).toHaveLength(3);
    const shown = texts.filter((t): t is string => t !== null);
    expect(new Set([...shown, generic]).size).toBe(shown.length + 1);
  });

  it('a porta (Fase 4): not_found fala do prédio na porta e dentro; closed e blocked dizem que você voltou para a rua', () => {
    expect(noticeText('not_found')).not.toBe(noticeText('not_found', 'door'));
    expect(noticeText('not_found', 'door')).not.toBe(noticeText('not_found', 'inside'));
    for (const id of ['too_far', 'closed', 'blocked', 'full'] as const) expect(noticeText(id, 'door'), id).toBeTruthy();
    expect(noticeText('closed', 'inside')).not.toBe(noticeText('closed', 'door'));
    expect(noticeText('blocked', 'inside')).not.toBe(noticeText('blocked', 'door'));
  });
});
