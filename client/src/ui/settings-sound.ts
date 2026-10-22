// "Sounds" group in settings: master switch, master volume and categories; the background lofi apart.
import { SOUND_CATEGORIES, type SoundCategory, type SoundKind } from '../audio/scheduler';
import type { UiContext } from './context';
import { h, setAttr, setText } from './dom';
import type { SoundControl } from './sound';
import { tr } from '../../../shared/i18n';

const CATEGORY_UI: Readonly<Record<SoundCategory, { label: string; hint: string; sample: SoundKind }>> = {
  alerts: { label: tr('Alerts'), hint: tr('A bell when someone needs you; a click when a task finishes.'), sample: 'chime' },
  keys: { label: tr('Keyboard'), hint: tr('Soft typing from whoever is working in the rooms in view.'), sample: 'keys' },
  elevator: { label: tr('Elevator'), hint: tr('"Ding" when someone arrives or leaves.'), sample: 'elevator' },
  social: { label: tr('Hangouts'), hint: tr('Ping-pong and arcade games in the lounge.'), sample: 'pingpong' },
  life: { label: tr('Office life'), hint: tr('The dog and the cat, the robot vacuum, the bathroom, the coffee machine, the pizza doorbell, yawns and parties.'), sample: 'meow' },
  weather: { label: tr('Weather'), hint: tr('Rain, wind, distant thunder, birds and the horns of the traffic outside, louder the more of the outside is in view.'), sample: 'bird' },
};

export class SoundSettingsGroup {
  readonly el: HTMLElement;
  private master: HTMLButtonElement;
  private volume: HTMLInputElement;
  private volumeOut: HTMLElement;
  private chips = new Map<SoundCategory, HTMLButtonElement>();
  private details: HTMLElement;
  private music: HTMLButtonElement;
  private musicVolume: HTMLInputElement;
  private musicVolumeOut: HTMLElement;
  private musicDetails: HTMLElement;

  constructor(
    private ctx: UiContext,
    private sound: SoundControl,
  ) {
    const id = 'ui-snd-master';
    this.master = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': id } }, h('span', { class: 'ui-switch__knob' }));
    this.master.addEventListener('click', () => {
      const on = !ctx.prefs.sound;
      ctx.updatePrefs({ sound: on });
      if (on) this.sound.preview('pop');
    });

    this.volume = h('input', { class: 'ui-snd__range', type: 'range', attrs: { min: 0, max: 100, step: 5, 'aria-label': tr('Sound volume') } });
    this.volume.addEventListener('input', () => {
      ctx.updatePrefs({ sounds: { ...ctx.prefs.sounds, volume: Number(this.volume.value) / 100 } });
      setText(this.volumeOut, `${this.volume.value}%`);
    });
    // preview on releasing the control (not on every drag step)
    this.volume.addEventListener('change', () => this.sound.preview('pop'));
    this.volumeOut = h('span', { class: 'ui-snd__value', attrs: { 'aria-hidden': 'true' } });

    const chipRow = h('div', { class: 'ui-snd__chips', role: 'group', attrs: { 'aria-label': tr('Sound categories') } });
    for (const cat of SOUND_CATEGORIES) {
      const ui = CATEGORY_UI[cat];
      const b = h('button', { class: 'ui-snd__chip', type: 'button', text: ui.label, title: ui.hint, attrs: { 'aria-pressed': 'true' } });
      b.addEventListener('click', () => {
        const on = !ctx.prefs.sounds[cat];
        ctx.updatePrefs({ sounds: { ...ctx.prefs.sounds, [cat]: on } });
        if (on) this.sound.preview(ui.sample);
      });
      this.chips.set(cat, b);
      chipRow.append(b);
    }

    this.details = h(
      'div',
      { class: 'ui-snd__details' },
      h('div', { class: 'ui-set ui-snd__vol' }, h('span', { class: 'ui-set__label', text: tr('Volume') }), this.volume, this.volumeOut),
      h('div', { class: 'ui-set ui-set--stack' }, h('span', { class: 'ui-set__label', text: tr('Play') }), chipRow, h('span', { class: 'ui-set__hint', text: tr('Alerts: bell, click and achievements · Keyboard: typing in the rooms in view · Elevator: arrivals and departures · Groups: ping-pong and arcade · Office life: pets, robot, bathroom, coffee, pizza and parties · Weather: rain, wind, thunder and birds.') })),
    );

    // background lofi: its own switch and volume (the click is the gesture that lets the browser play it)
    const musicId = 'ui-snd-music';
    this.music = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': musicId } }, h('span', { class: 'ui-switch__knob' }));
    this.music.addEventListener('click', () => {
      ctx.updatePrefs({ music: !ctx.prefs.music });
      this.sound.sync();
      if (ctx.prefs.music) this.sound.music.start();
    });
    this.musicVolume = h('input', { class: 'ui-snd__range', type: 'range', attrs: { min: 0, max: 100, step: 5, 'aria-label': tr('Music volume') } });
    this.musicVolume.addEventListener('input', () => {
      ctx.updatePrefs({ musicVolume: Number(this.musicVolume.value) / 100 });
      setText(this.musicVolumeOut, `${this.musicVolume.value}%`);
    });
    this.musicVolumeOut = h('span', { class: 'ui-snd__value', attrs: { 'aria-hidden': 'true' } });
    this.musicDetails = h('div', { class: 'ui-snd__details' }, h('div', { class: 'ui-set ui-snd__vol' }, h('span', { class: 'ui-set__label', text: tr('Volume') }), this.musicVolume, this.musicVolumeOut));

    this.el = h(
      'div',
      { class: 'ui-set-group ui-snd' },
      h('h3', { text: tr('Sounds') }),
      h(
        'div',
        { class: 'ui-set' },
        h(
          'div',
          { class: 'ui-set__text' },
          h('span', { class: 'ui-set__label', text: tr('Office sounds'), attrs: { id } }),
          h('span', { class: 'ui-set__hint', text: tr('Synthesized in the browser, and quiet. With the tab hidden, only the "needs you" bell.') }),
        ),
        this.master,
      ),
      this.details,
      h(
        'div',
        { class: 'ui-set' },
        h(
          'div',
          { class: 'ui-set__text' },
          h('span', { class: 'ui-set__label', text: tr('Lofi music'), attrs: { id: musicId } }),
          h('span', { class: 'ui-set__hint', text: tr('Soft lofi in the background, also with the tab hidden. Quiet during the disco. Tracks by OMF-Games (CC0).') }),
        ),
        this.music,
      ),
      this.musicDetails,
    );
  }

  render(): void {
    const p = this.ctx.prefs;
    setAttr(this.master, 'aria-checked', String(p.sound));
    const pct = String(Math.round(p.sounds.volume * 100));
    if (document.activeElement !== this.volume && this.volume.value !== pct) this.volume.value = pct;
    setText(this.volumeOut, `${this.volume.value}%`);
    this.volume.disabled = !p.sound;
    for (const [cat, b] of this.chips) {
      setAttr(b, 'aria-pressed', String(p.sounds[cat]));
      b.disabled = !p.sound;
    }
    this.details.classList.toggle('is-off', !p.sound);
    setAttr(this.music, 'aria-checked', String(p.music));
    const mpct = String(Math.round(p.musicVolume * 100));
    if (document.activeElement !== this.musicVolume && this.musicVolume.value !== mpct) this.musicVolume.value = mpct;
    setText(this.musicVolumeOut, `${this.musicVolume.value}%`);
    this.musicVolume.disabled = !p.music;
    this.musicDetails.classList.toggle('is-off', !p.music);
  }
}
