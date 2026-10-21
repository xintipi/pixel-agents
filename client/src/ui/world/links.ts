// Habblaud World external links (terms and privacy), used by the Settings section, the "Your
// building" card, the "See what was sent" window and the invite card.
import { h } from '../dom';

export const WORLD_TERMS_URL = 'https://habblaud.com/world/termos';
export const WORLD_PRIVACY_URL = 'https://habblaud.com/world/privacidade';

/** External link (terms, privacy), always in another tab. */
export function extLink(text: string, href: string): HTMLAnchorElement {
  return h('a', { class: 'ui-link-btn', text, attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });
}
