// Settings (popover): office options, notices, demo mode and About (version). Habblaud World has its
// own window (ui/world/world-dialog.ts); from here only the theme hint in Appearance, which also goes to the building.
import { access, remoteLogout } from '../net/access';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText } from './dom';
import { ICONS } from './icons';
import { notificationState, type Notifier } from './notify';
import type { UiPrefs } from './prefs';
import { SoundSettingsGroup } from './settings-sound';
import type { SoundControl } from './sound';
import { AboutGroup } from './version';
import { officeThemeForWorld } from '../world/api';
import { clampVndRate, type CostAlert, type CostCurrency } from './cost';
import type { WorldThemeLink } from './world/world-dialog';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES, normalizeLocale, tr, type Locale } from '../../../shared/i18n';

type LanguageChoice = Locale;

/** Language chosen in Settings (no choice: the default, Vietnamese). */
function savedLanguage(): LanguageChoice {
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Saves the choice and reloads: texts are built once, when the page loads. */
function pickLanguage(v: LanguageChoice): void {
  if (v === savedLanguage()) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, v);
  } catch {
    return;
  }
  location.reload();
}

type BoolPref = { [K in keyof UiPrefs]: UiPrefs[K] extends boolean ? K : never }[keyof UiPrefs];

interface SwitchRefs {
  btn: HTMLButtonElement;
  hint: HTMLElement;
}

export function switchRow(label: string, hintText: string, onToggle: () => void): SwitchRefs & { row: HTMLElement } {
  const id = `ui-sw-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const btn = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': id } }, h('span', { class: 'ui-switch__knob' }));
  btn.addEventListener('click', onToggle);
  const hint = h('span', { class: 'ui-set__hint', text: hintText });
  const row = h('div', { class: 'ui-set' }, h('div', { class: 'ui-set__text' }, h('span', { class: 'ui-set__label', text: label, attrs: { id } }), hint), btn);
  return { row, btn, hint };
}

export function segmented<T extends string>(label: string, options: readonly [T, string][], onPick: (v: T) => void): { row: HTMLElement; set(v: T): void } {
  const group = h('div', { class: 'ui-seg', role: 'radiogroup', attrs: { 'aria-label': label } });
  const buttons = options.map(([value, text]) => {
    const b = h('button', { class: 'ui-seg__opt', type: 'button', role: 'radio', text, attrs: { 'aria-checked': 'false' } });
    b.addEventListener('click', () => onPick(value));
    b.addEventListener('keydown', (e) => {
      // Arrows navigate between options (radiogroup pattern).
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex(([v]) => v === value);
      const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
      onPick(next[0]);
      buttons[options.indexOf(next)].focus();
    });
    group.append(b);
    return b;
  });
  const row = h('div', { class: 'ui-set ui-set--stack' }, h('span', { class: 'ui-set__label', text: label }), group);
  return {
    row,
    set(v: T) {
      options.forEach(([value], i) => {
        const on = value === v;
        setAttr(buttons[i], 'aria-checked', String(on));
        buttons[i].tabIndex = on ? 0 : -1;
      });
    },
  };
}

/** Dropdown with a label (for long lists, like the office themes): the same interface as `segmented`. */
export function selectRow<T extends string>(label: string, options: readonly [T, string][], onPick: (v: T) => void): { row: HTMLElement; set(v: T): void } {
  const select = h('select', { class: 'ui-set__select', attrs: { 'aria-label': label } }) as HTMLSelectElement;
  for (const [value, text] of options) select.append(h('option', { text, attrs: { value } }));
  select.addEventListener('change', () => onPick(select.value as T));
  const row = h('div', { class: 'ui-set ui-set--stack' }, h('span', { class: 'ui-set__label', text: label }), select);
  return {
    row,
    set(v: T) {
      if (select.value !== v) select.value = v;
    },
  };
}

export class SettingsPopover implements UiComponent {
  readonly el: HTMLElement;
  private switches = new Map<BoolPref | 'demo', SwitchRefs>();
  private bubbles: ReturnType<typeof segmented<UiPrefs['bubbles']>>;
  private liveliness: ReturnType<typeof segmented<UiPrefs['liveliness']>>;
  private daylight: ReturnType<typeof segmented<UiPrefs['daylight']>>;
  private theme: ReturnType<typeof selectRow<UiPrefs['theme']>>;
  private language: ReturnType<typeof segmented<LanguageChoice>>;
  private currency: ReturnType<typeof segmented<CostCurrency>>;
  private costAlert: ReturnType<typeof segmented<CostAlert>>;
  private rateRow: HTMLElement;
  private rateInput: HTMLInputElement;
  private soundGroup: SoundSettingsGroup;
  private demoGroup: HTMLElement;
  /** Only on the phone page (remote port with login): sign out of this device. */
  private remoteGroup: HTMLElement;
  private logoutBtn: HTMLButtonElement;
  private about: AboutGroup;
  private demoBusy = false;
  private anchor: HTMLElement | null = null;

  constructor(
    private ctx: UiContext,
    private notifier: Notifier,
    sound: SoundControl,
    /** The Habblaud World window: the theme hint in Appearance and sending the theme to the building. */
    private readonly world: WorldThemeLink,
  ) {
    const sw = (key: BoolPref | 'demo', label: string, hint: string, onToggle: () => void) => {
      const r = switchRow(label, hint, onToggle);
      this.switches.set(key, r);
      return r.row;
    };
    const flip = (key: BoolPref) => () => ctx.updatePrefs({ [key]: !ctx.prefs[key] } as Partial<UiPrefs>);

    this.bubbles = segmented<UiPrefs['bubbles']>(
      tr('Activity bubbles'),
      [
        ['all', tr('All')],
        ['important', tr('Important')],
        ['none', tr('None')],
      ],
      (v) => ctx.updatePrefs({ bubbles: v }),
    );
    this.liveliness = segmented<UiPrefs['liveliness']>(
      tr('Movement around the office'),
      [
        ['calm', tr('Calm')],
        ['normal', tr('Normal')],
        ['lively', tr('Lively')],
      ],
      (v) => ctx.updatePrefs({ liveliness: v }),
    );
    this.daylight = segmented<UiPrefs['daylight']>(
      tr('Day/night cycle'),
      [
        ['auto', tr('Automatic')],
        ['day', tr('Always day')],
        ['night', tr('Always night')],
      ],
      (v) => ctx.updatePrefs({ daylight: v }),
    );
    this.daylight.row.append(h('span', { class: 'ui-set__hint', text: tr('Automatic: the sky, lights and sun in the windows follow local time.') }));
    this.theme = selectRow<UiPrefs['theme']>(
      tr('Office theme'),
      [
        ['auto', tr('Automatic')],
        ['none', tr('None')],
        ['christmas', tr('Christmas')],
        ['halloween', tr('Halloween')],
        ['tet', tr('Tết')],
        ['midautumn', tr('Mid-Autumn')],
        ['valentine', tr('Valentine')],
        ['women', tr("Women's Day")],
        ['devday', tr("Programmer's Day")],
        ['national', tr('National Day')],
        ['children', tr("Children's Day")],
      ],
      (v) => {
        ctx.updatePrefs({ theme: v });
        // With the World on and the account approved, the theme also goes to the building (clicking again resends).
        void this.world.onThemePicked(officeThemeForWorld(v));
      },
    );
    this.theme.row.append(
      h('span', {
        class: 'ui-set__hint',
        text: tr('Automatic: Halloween in October and Christmas from November 1 to December 26; with the interface in Vietnamese, also Tết, Mid-Autumn, Valentine, Women\'s Day (8/3 and 20/10), Programmer\'s Day, National Day (30/4 and 2/9) and Children\'s Day around their dates. None: always the original look. Only Christmas and Halloween go to Habblaud World; with the others the building goes without a theme.'),
      }),
    );
    this.soundGroup = new SoundSettingsGroup(ctx, sound);

    // Language names always in their own language, so someone who does not understand the current one can find theirs.
    this.language = segmented<LanguageChoice>(
      tr('Interface language'),
      LOCALES.map((l): [LanguageChoice, string] => [l.id, l.name]),
      (v) => pickLanguage(v),
    );
    this.language.row.append(
      h('span', { class: 'ui-set__hint', text: tr('Activity texts come from the server: Vietnamese by default, English with HABBLAUD_LANG=en.') }),
    );

    this.currency = segmented<CostCurrency>(
      tr('Currency'),
      [['usd', tr('Dollar (US$)')], ['vnd', tr('Đồng (₫)')]],
      (v) => ctx.updatePrefs({ costCurrency: v }),
    );
    this.currency.row.append(h('span', { class: 'ui-set__hint', text: tr('The cost comes from Claude Code itself, in dollars; in đồng it\'s an approximate conversion using the rate below. Codex doesn\'t record cost.') }));
    this.rateInput = h('input', { class: 'ui-set__rate', type: 'number', attrs: { min: 1000, max: 100000, step: 100, inputmode: 'numeric', 'aria-labelledby': 'ui-set-rate' } }) as HTMLInputElement;
    this.rateInput.addEventListener('change', () => {
      const rate = clampVndRate(this.rateInput.value);
      this.rateInput.value = String(rate);
      ctx.updatePrefs({ vndRate: rate });
    });
    this.rateRow = h(
      'div',
      { class: 'ui-set' },
      h('div', { class: 'ui-set__text' }, h('span', { class: 'ui-set__label', text: tr('Exchange rate (₫ per US$)'), attrs: { id: 'ui-set-rate' } })),
      this.rateInput,
    );
    this.costAlert = segmented<CostAlert>(
      tr('Warn when an agent spends, within 10 minutes'),
      [['off', tr('Never')], ['1', 'US$ 1'], ['2', 'US$ 2'], ['5', 'US$ 5']],
      (v) => ctx.updatePrefs({ costAlert: v }),
    );

    this.demoGroup = h(
      'div',
      { class: 'ui-set-group' },
      h('h3', { text: tr('Data') }),
      sw('demo', tr('Demo mode'), tr('Adds fictional agents to the office, alongside the real ones.'), () => void this.toggleDemo()),
    );

    this.logoutBtn = h('button', { class: 'ui-btn', type: 'button', text: tr('Sign out'), on: { click: () => void this.logout() } }) as HTMLButtonElement;
    this.remoteGroup = h(
      'div',
      { class: 'ui-set-group', hidden: true },
      h('h3', { text: tr('Phone access') }),
      h(
        'div',
        { class: 'ui-set' },
        h(
          'div',
          { class: 'ui-set__text' },
          h('span', { class: 'ui-set__label', text: tr('Sign out of this device') }),
          h('span', { class: 'ui-set__hint', text: tr('Ends the login here (a copy of the cookie stops working too). To come back, sign in with your username and password.') }),
        ),
        this.logoutBtn,
      ),
    );

    this.theme.row.append(world.themeNote);
    this.about = new AboutGroup(ctx);

    const close = iconButton(ICONS.close, tr('Close settings'), () => this.hide(), 'ui-icon-btn--sm');
    this.el = h(
      'div',
      { class: 'ui-popover ui-settings', role: 'dialog', tabIndex: -1, attrs: { 'aria-label': tr('Settings'), id: 'ui-settings', popover: 'auto' } },
      h('div', { class: 'ui-popover__head' }, h('h2', { text: tr('Settings') }), close),
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Appearance') }), this.theme.row),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Office') }),
        sw('showNames', tr('Show names'), tr('A name tag above each character.'), flip('showNames')),
        this.bubbles.row,
        this.liveliness.row,
        this.daylight.row,
      ),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Alerts') }),
        sw('browserNotifications', tr('Browser notifications'), tr('Alerts you when someone needs you and the tab is in the background.'), () => void this.toggleNotifications()),
      ),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Cost') }),
        sw('rowCost', tr('Cost in the agent list'), tr('Next to the name, how much the session has cost so far.'), flip('rowCost')),
        this.currency.row,
        this.rateRow,
        this.costAlert.row,
      ),
      this.soundGroup.el,
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Language') }), this.language.row),
      this.demoGroup,
      this.remoteGroup,
      this.about.el,
    );
    this.el.addEventListener('toggle', () => {
      this.anchor?.setAttribute('aria-expanded', String(this.isOpen));
      this.syncRootClass();
      if (this.isOpen) this.render();
    });
  }

  get isOpen(): boolean {
    try {
      return this.el.matches(':popover-open');
    } catch {
      return this.el.classList.contains('is-open');
    }
  }

  toggle(anchor: HTMLElement): void {
    this.anchor = anchor;
    if (this.isOpen) return this.hide();
    const r = anchor.getBoundingClientRect();
    this.el.style.top = `${Math.round(r.bottom + 8)}px`;
    this.el.style.right = `${Math.max(8, Math.round(innerWidth - r.right - 4))}px`;
    if (typeof this.el.showPopover === 'function') this.el.showPopover();
    else this.el.classList.add('is-open');
    anchor.setAttribute('aria-expanded', 'true');
    this.syncRootClass();
    // Moves focus into the popover (without a focus ring on a specific control).
    this.el.focus();
  }

  /** Opens (if closed) and goes to the "About" section. */
  showAbout(anchor: HTMLElement): void {
    if (!this.isOpen) this.toggle(anchor);
    this.render();
    requestAnimationFrame(() => this.about.highlight());
  }

  hide(): void {
    if (typeof this.el.hidePopover === 'function' && this.isOpen) this.el.hidePopover();
    this.el.classList.remove('is-open');
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.syncRootClass();
  }

  /** With the popover open, notices collapse (they do not show behind or next to it). */
  private syncRootClass(): void {
    this.ctx.root.classList.toggle('has-popover', this.isOpen);
  }

  private async logout(): Promise<void> {
    this.logoutBtn.disabled = true;
    if (!(await remoteLogout())) {
      this.logoutBtn.disabled = false;
      this.ctx.announce(tr('Couldn\'t sign out: no response from the server.'));
    }
  }

  render(): void {
    const p = this.ctx.prefs;
    for (const [key, r] of this.switches) {
      const on = key === 'demo' ? !!this.ctx.store.liveSnapshot?.meta.demo : p[key];
      setAttr(r.btn, 'aria-checked', String(on));
      r.btn.disabled = key === 'demo' && this.demoBusy;
    }
    this.bubbles.set(p.bubbles);
    this.liveliness.set(p.liveliness);
    this.daylight.set(p.daylight);
    this.theme.set(p.theme);
    this.language.set(savedLanguage());
    this.currency.set(p.costCurrency);
    this.costAlert.set(p.costAlert);
    setHidden(this.rateRow, p.costCurrency !== 'vnd');
    if (document.activeElement !== this.rateInput) this.rateInput.value = String(p.vndRate);
    this.soundGroup.render();
    setHidden(this.demoGroup, this.ctx.store.mock || access().remote);
    setHidden(this.remoteGroup, !access().remote);
    this.about.render();

    const notif = this.switches.get('browserNotifications')!;
    const state = notificationState();
    const hint =
      state === 'unsupported'
        ? tr('This browser doesn\'t support notifications.')
        : state === 'denied'
          ? tr('Blocked by the browser: allow them in the site permissions.')
          : tr('Alerts you when someone needs you and the tab is in the background.');
    setText(notif.hint, hint);
    notif.btn.disabled = state === 'unsupported';
  }

  private async toggleNotifications(): Promise<void> {
    if (this.ctx.prefs.browserNotifications) {
      this.ctx.updatePrefs({ browserNotifications: false });
      return;
    }
    const state = await this.notifier.enableBrowserNotifications();
    this.ctx.updatePrefs({ browserNotifications: state === 'granted' });
    if (state === 'denied') this.ctx.announce(tr('Notifications blocked by the browser.'));
  }

  private async toggleDemo(): Promise<void> {
    if (this.demoBusy) return;
    this.demoBusy = true;
    this.render();
    const enable = !this.ctx.store.snapshot?.meta.demo;
    try {
      const ok = await this.ctx.store.setDemo(enable);
      this.ctx.announce(ok ? (enable ? tr('Demo mode on.') : tr('Demo mode off.')) : tr('Couldn\'t change demo mode.'));
    } catch {
      this.ctx.announce(tr('Couldn\'t reach the server.'));
    } finally {
      this.demoBusy = false;
      this.ctx.invalidate();
    }
  }
}
