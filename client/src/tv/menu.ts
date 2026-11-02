// The lounge TV's game menu: clicking the TV lists what it can play, and each game loads only when chosen (dynamic import).
// To add a game, add a line to TV_GAMES. The pond across the street opens its own game directly, so it isn't here.
import { tr } from '../../../shared/i18n';
import { h, iconButton } from '../ui/dom';
import { ICONS } from '../ui/icons';
import type { TvVisit } from '../world/api';

interface TvGame {
  id: string;
  icon: string;
  title(): string;
  blurb(): string;
  open(root: HTMLElement, visit: TvVisit): Promise<void>;
}

export const TV_GAMES: readonly TvGame[] = [
  {
    id: 'flappy',
    icon: '🐦',
    title: () => tr('Flappy'),
    blurb: () => tr('Flap through the gaps between the pipes. Space, click or tap.'),
    open: (root, visit) => import('../flappy/game').then((m) => m.openFlappy({ root, ...visit })),
  },
];

export function openTvMenu(root: HTMLElement, visit: TvVisit): void {
  if (root.querySelector('.ui-tv')) return;
  const close = iconButton(ICONS.close, tr('Close'), () => dialog.close(), 'ui-icon-btn--sm');
  const list = h(
    'ul',
    { class: 'ui-tv__games' },
    ...TV_GAMES.map((g, i) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            class: 'ui-tv__game',
            type: 'button',
            attrs: { autofocus: i === 0 },
            on: {
              click: () => {
                dialog.close();
                void g.open(root, visit);
              },
            },
          },
          h('span', { class: 'ui-tv__icon', text: g.icon, attrs: { 'aria-hidden': 'true' } }),
          h('strong', { text: g.title() }),
          h('span', { text: g.blurb() }),
        ),
      ),
    ),
  );
  const dialog = h(
    'dialog',
    { class: 'ui-dialog ui-tv', attrs: { 'aria-labelledby': 'ui-tv-title' } },
    h('div', { class: 'ui-dialog__head' }, h('h2', { text: tr('Pick a game'), attrs: { id: 'ui-tv-title' } }), close),
    list,
  ) as HTMLDialogElement;
  dialog.addEventListener('click', (e) => {
    // the backdrop closes; the dialog's own padding doesn't
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  root.append(dialog);
  dialog.showModal();
}
