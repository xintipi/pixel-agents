// Sounds synthesized with WebAudio (no audio files): short, quiet and soft in timbre.
import type { SoundKind } from './scheduler';

export interface VoiceOpts {
  /** Final gain (already including the master volume). */
  gain: number;
  /** -1 .. 1 (left .. right). */
  pan?: number;
  /** Keyboard: keys in the burst. */
  count?: number;
  rng: () => number;
  /** Short white noise (keys). */
  noise: AudioBuffer | null;
}

/** Percussive envelope: short attack and exponential decay. */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(ac: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number, toFreq?: number): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + Math.min(decay, 0.08));
  env(g, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Creates a white-noise buffer (the basis for the keys). */
export function makeNoise(ac: AudioContext): AudioBuffer | null {
  try {
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  } catch {
    return null;
  }
}

/** Plays `kind` at `t` (AudioContext time) on output `dest`. */
export function playVoice(ac: AudioContext, dest: AudioNode, kind: SoundKind, t: number, o: VoiceOpts): void {
  let out: AudioNode = dest;
  if (o.pan && typeof ac.createStereoPanner === 'function') {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    p.connect(dest);
    out = p;
  }
  const g = o.gain;
  switch (kind) {
    case 'chime':
      // soft bell: two partials and a third note right after, with a long decay
      tone(ac, out, 'sine', 880, t, 0.16 * g, 0.012, 1.1);
      tone(ac, out, 'sine', 1318.5, t, 0.08 * g, 0.012, 1.1);
      tone(ac, out, 'sine', 1174.7, t + 0.14, 0.1 * g, 0.012, 1.1);
      return;
    case 'pop':
      // "pop": short downward sweep
      tone(ac, out, 'triangle', 740, t, 0.14 * g, 0.008, 0.15, 330);
      return;
    case 'elevator':
      // elevator "ding": a round note with the bell shimmer fading first
      tone(ac, out, 'sine', 784, t, 0.11 * g, 0.004, 1.5);
      tone(ac, out, 'sine', 1568, t, 0.025 * g, 0.004, 0.7);
      tone(ac, out, 'sine', 2164, t, 0.012 * g, 0.004, 0.25);
      return;
    case 'keys':
      keys(ac, out, t, o);
      return;
    case 'pingpong':
      // paddle hit: high "tok" with falling pitch
      tone(ac, out, 'sine', 1250, t, 0.09 * g, 0.002, 0.06, 880);
      return;
    case 'table':
      // bounce on the table: lower and shorter
      tone(ac, out, 'sine', 760, t, 0.06 * g, 0.002, 0.045, 520);
      return;
    case 'firework_launch': {
      // rising whistle: thin sine sweeping up, fading at the top
      const o2 = ac.createOscillator();
      const gw = ac.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(420, t);
      o2.frequency.exponentialRampToValueAtTime(1700, t + 0.6);
      gw.gain.setValueAtTime(0.0001, t);
      gw.gain.exponentialRampToValueAtTime(0.035 * g, t + 0.05);
      gw.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      o2.connect(gw).connect(out);
      o2.start(t);
      o2.stop(t + 0.66);
      return;
    }
    case 'firework_boom':
      boom(ac, out, t, o);
      return;
    case 'fanfare':
      // achievement: a quick rising arpeggio and a bright chord on top
      [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, out, 'triangle', f, t + i * 0.09, 0.09 * g, 0.006, 0.22));
      [1046.5, 1318.5, 1568].forEach((f) => tone(ac, out, 'sine', f, t + 0.27, 0.05 * g, 0.01, 1.1));
      return;
    case 'bark':
      bark(ac, out, t, o);
      return;
    case 'meow':
      meow(ac, out, t, o);
      return;
    case 'robot_start':
      // the robot leaves the dock: two short rising beeps
      tone(ac, out, 'square', 1320, t, 0.055 * g, 0.003, 0.07);
      tone(ac, out, 'square', 1760, t + 0.1, 0.055 * g, 0.003, 0.09);
      return;
    case 'robot_dock':
      // back on the dock: two falling beeps
      tone(ac, out, 'square', 1760, t, 0.055 * g, 0.003, 0.07);
      tone(ac, out, 'square', 1175, t + 0.1, 0.055 * g, 0.003, 0.12);
      return;
    case 'door':
      // stall door: a soft wooden knock and the latch click
      tone(ac, out, 'sine', 150, t, 0.12 * g, 0.003, 0.12, 90);
      noiseBurst(ac, out, t + 0.05, o, { type: 'highpass', freq: 3500, peak: 0.04 * g, decay: 0.02 });
      return;
    case 'flush':
      // flush: water rushing through a closing filter, swelling and draining
      noiseBed(ac, out, t, o, { type: 'bandpass', from: 1400, to: 380, q: 0.8, peak: 0.09 * g, attack: 0.25, hold: 0.6, release: 0.9 });
      return;
    case 'tap':
      // tap running over hands, with a few bubbly drops
      noiseBed(ac, out, t, o, { type: 'bandpass', from: 3200, to: 2600, q: 1.2, peak: 0.035 * g, attack: 0.08, hold: 1.2, release: 0.4 });
      for (let i = 0; i < 5; i++) {
        const f = 900 + o.rng() * 900;
        tone(ac, out, 'sine', f, t + 0.15 + o.rng() * 1.2, 0.025 * g, 0.002, 0.05, f * 1.6);
      }
      return;
    case 'coffee':
      // espresso machine: steam hiss and a low gurgle of the pump
      noiseBed(ac, out, t, o, { type: 'highpass', from: 2400, to: 3000, q: 0.7, peak: 0.04 * g, attack: 0.15, hold: 1.1, release: 0.4 });
      for (let i = 0; i < 6; i++) tone(ac, out, 'sine', 140 + o.rng() * 60, t + 0.2 + i * 0.2, 0.05 * g, 0.01, 0.12);
      return;
    case 'pizza':
      // delivery: a "ding-dong" doorbell
      tone(ac, out, 'sine', 659.25, t, 0.12 * g, 0.005, 0.9);
      tone(ac, out, 'sine', 1318.5, t, 0.02 * g, 0.005, 0.4);
      tone(ac, out, 'sine', 523.25, t + 0.42, 0.12 * g, 0.005, 1.2);
      tone(ac, out, 'sine', 1046.5, t + 0.42, 0.02 * g, 0.005, 0.5);
      return;
    case 'yawn':
      yawn(ac, out, t, o);
      return;
    case 'party':
      // party horn (a buzzy blow that trembles) and a couple of confetti poppers
      partyHorn(ac, out, t, o);
      for (let i = 0; i < 2; i++) {
        tone(ac, out, 'triangle', 900, t + 0.45 + i * 0.18, 0.08 * g, 0.002, 0.08, 300);
        noiseBurst(ac, out, t + 0.45 + i * 0.18, o, { type: 'highpass', freq: 2500, peak: 0.06 * g, decay: 0.05 });
      }
      return;
    case 'thunder':
      thunder(ac, out, t, o);
      return;
    case 'bird':
      // a bird or two chirping: quick upward whistles
      for (let i = 0, n = 2 + Math.floor(o.rng() * 3); i < n; i++) {
        const f = 2600 + o.rng() * 1400;
        tone(ac, out, 'sine', f, t + i * (0.09 + o.rng() * 0.06), 0.05 * g, 0.004, 0.06, f * 1.35);
      }
      return;
    case 'trash_bell':
      // the garbage cart's hand bell: two bright metallic "keng"s, a few inharmonic partials ringing out
      for (const at of [0, 0.22]) {
        tone(ac, out, 'triangle', 1180, t + at, 0.07 * g, 0.002, 0.45);
        tone(ac, out, 'sine', 2950, t + at, 0.03 * g, 0.002, 0.3);
        tone(ac, out, 'sine', 4310, t + at, 0.015 * g, 0.002, 0.18);
      }
      return;
    case 'horn_bike': {
      // scooter horn: two quick buzzy "tin tin" beeps, a pair of detuned notes through a low-pass
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      lp.connect(out);
      const n = o.rng() < 0.3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        tone(ac, lp, 'square', 415, t + i * 0.15, 0.035 * g, 0.004, 0.09);
        tone(ac, lp, 'square', 498, t + i * 0.15, 0.03 * g, 0.004, 0.09);
      }
      return;
    }
    case 'horn_car': {
      // car horn: a longer two-tone blare
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.connect(out);
      tone(ac, lp, 'sawtooth', 349, t, 0.04 * g, 0.01, 0.38);
      tone(ac, lp, 'sawtooth', 440, t, 0.035 * g, 0.01, 0.38);
      return;
    }
    case 'power_off':
      // the breaker trips: a dry "tạch" and the hum of the building dying out
      noiseBurst(ac, out, t, o, { type: 'highpass', freq: 2200, peak: 0.12 * g, decay: 0.025 });
      tone(ac, out, 'square', 1800, t, 0.05 * g, 0.001, 0.02, 600);
      tone(ac, out, 'sawtooth', 100, t + 0.01, 0.05 * g, 0.01, 0.6, 40);
      return;
    case 'power_on':
      // the power comes back: a click and the hum of the lights and the machines swelling up
      noiseBurst(ac, out, t, o, { type: 'highpass', freq: 2600, peak: 0.08 * g, decay: 0.02 });
      powerHum(ac, out, t + 0.05, g);
      return;
    case 'crash':
      crash(ac, out, t, o);
      return;
    case 'siren': {
      // the ambulance's two-tone "ò e ò e": two notes taking turns, a soft square through a low-pass
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2000;
      lp.connect(out);
      for (let i = 0; i < 4; i++) {
        const f = i % 2 ? 640 : 860;
        tone(ac, lp, 'square', f, t + i * 0.45, 0.022 * g, 0.03, 0.4);
        tone(ac, lp, 'sine', f, t + i * 0.45, 0.03 * g, 0.03, 0.4);
      }
      return;
    }
    case 'robot_hum':
    case 'rain':
    case 'wind':
    case 'generator':
      // beds: played as loops by the board (startBed)
      return;
    case 'arcade': {
      // arcade: three-note square-wave arpeggio, filtered so it doesn't hurt
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(out);
      const scale = [1046.5, 1318.5, 1568, 1760, 2093];
      for (let i = 0; i < 3; i++) {
        const f = scale[Math.floor(o.rng() * scale.length)];
        tone(ac, lp, 'square', f, t + i * 0.055, 0.03 * g, 0.003, 0.05);
      }
      return;
    }
  }
}

/** Burst of keys: filtered-noise clicks at irregular intervals, like real typing. */
function keys(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  if (!o.noise) return;
  const n = Math.max(1, Math.min(8, o.count ?? 4));
  let at = t;
  for (let i = 0; i < n; i++) {
    const src = ac.createBufferSource();
    src.buffer = o.noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900 + o.rng() * 1500;
    bp.Q.value = 1.4;
    const g = ac.createGain();
    env(g, at, 0.08 * o.gain * (0.6 + o.rng() * 0.4), 0.0015, 0.022 + o.rng() * 0.012);
    src.connect(bp).connect(g).connect(out);
    src.start(at, o.rng() * 0.02, 0.04);
    at += 0.06 + o.rng() * 0.08 + (o.rng() < 0.15 ? 0.12 : 0);
  }
}

/** Firework burst: a low thump, a muffled noise blast and then the crackling of the sparks. */
function boom(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const g = o.gain;
  // thump
  tone(ac, out, 'sine', 90, t, 0.22 * g, 0.004, 0.45, 38);
  if (!o.noise) return;
  // blast: looped noise through a low-pass that closes
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  src.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.6);
  const gb = ac.createGain();
  env(gb, t, 0.2 * g, 0.004, 0.7);
  src.connect(lp).connect(gb).connect(out);
  src.start(t);
  src.stop(t + 0.75);
  // crackling: tiny bright clicks scattered right after
  const n = 7 + Math.floor(o.rng() * 6);
  for (let i = 0; i < n; i++) {
    const at = t + 0.15 + o.rng() * 0.7;
    const c = ac.createBufferSource();
    c.buffer = o.noise;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000 + o.rng() * 3000;
    const gc = ac.createGain();
    env(gc, at, 0.05 * g * (0.4 + o.rng() * 0.6), 0.001, 0.02);
    c.connect(hp).connect(gc).connect(out);
    c.start(at, o.rng() * 0.03, 0.03);
  }
}

/** A short burst of filtered noise (clicks, latches, poppers). */
function noiseBurst(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts, f: { type: BiquadFilterType; freq: number; peak: number; decay: number }): void {
  if (!o.noise) return;
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  const flt = ac.createBiquadFilter();
  flt.type = f.type;
  flt.frequency.value = f.freq;
  const g = ac.createGain();
  env(g, t, f.peak, 0.002, f.decay);
  src.connect(flt).connect(g).connect(out);
  src.start(t, o.rng() * 0.02, 0.04);
}

/** Longer noise (water, steam): looped noise through a filter that glides, with a swell, a hold and a release. */
function noiseBed(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  o: VoiceOpts,
  f: { type: BiquadFilterType; from: number; to: number; q: number; peak: number; attack: number; hold: number; release: number },
): void {
  if (!o.noise) return;
  const end = t + f.attack + f.hold + f.release;
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  src.loop = true;
  const flt = ac.createBiquadFilter();
  flt.type = f.type;
  flt.Q.value = f.q;
  flt.frequency.setValueAtTime(f.from, t);
  flt.frequency.exponentialRampToValueAtTime(f.to, end);
  const g = ac.createGain();
  const peak = Math.max(0.0002, f.peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + f.attack);
  g.gain.setValueAtTime(peak, t + f.attack + f.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(flt).connect(g).connect(out);
  src.start(t);
  src.stop(end + 0.05);
}

/** Corgi "woof": a short buzzy tone dropping in pitch through a mouth-like filter; once or twice. */
function bark(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const n = o.count ?? (o.rng() < 0.5 ? 1 : 2);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.Q.value = 2;
  lp.connect(out);
  for (let i = 0; i < n; i++) {
    const at = t + i * 0.22;
    const base = 380 + o.rng() * 60;
    tone(ac, lp, 'sawtooth', base, at, 0.1 * o.gain, 0.01, 0.13, base * 0.62);
    tone(ac, lp, 'square', base * 2, at, 0.025 * o.gain, 0.01, 0.06, base * 1.2);
  }
}

/** "Meow": a vowel-like glide up and back down, with a little vibrato. */
function meow(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const d = 0.55 + o.rng() * 0.2;
  const base = 520 + o.rng() * 120;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base, t);
  osc.frequency.linearRampToValueAtTime(base * 1.55, t + d * 0.35);
  osc.frequency.linearRampToValueAtTime(base * 0.9, t + d);
  const vib = ac.createOscillator();
  const vibG = ac.createGain();
  vib.frequency.value = 6;
  vibG.gain.value = 9;
  vib.connect(vibG).connect(osc.frequency);
  // formant: "ee" opening to "ow"
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(1800, t);
  bp.frequency.linearRampToValueAtTime(1100, t + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2 * o.gain, t + 0.06);
  g.gain.setValueAtTime(0.2 * o.gain, t + d * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(bp).connect(g).connect(out);
  osc.start(t);
  vib.start(t);
  osc.stop(t + d + 0.05);
  vib.stop(t + d + 0.05);
}

/** A yawn: a breathy voice opening, rising a little and sighing down. */
function yawn(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const d = 1.1;
  const base = 210 + o.rng() * 60;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base, t);
  osc.frequency.linearRampToValueAtTime(base * 1.3, t + d * 0.35);
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + d);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.linearRampToValueAtTime(900, t + d * 0.4);
  bp.frequency.linearRampToValueAtTime(500, t + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.13 * o.gain, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(bp).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + d + 0.05);
  // the breath under the voice
  noiseBed(ac, out, t, o, { type: 'bandpass', from: 1200, to: 700, q: 0.8, peak: 0.02 * o.gain, attack: 0.2, hold: 0.4, release: 0.5 });
}

/** A crash ("rầm"): a dull thump, the clang of the bike hitting the asphalt and bits of plastic skittering off. */
function crash(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const g = o.gain;
  noiseBurst(ac, out, t, o, { type: 'lowpass', freq: 600, peak: 0.16 * g, decay: 0.22 });
  tone(ac, out, 'sine', 120, t, 0.12 * g, 0.004, 0.25, 50);
  tone(ac, out, 'triangle', 520, t + 0.03, 0.05 * g, 0.002, 0.3);
  tone(ac, out, 'triangle', 1370, t + 0.03, 0.025 * g, 0.002, 0.2);
  for (let i = 0; i < 5; i++) noiseBurst(ac, out, t + 0.12 + i * (0.05 + o.rng() * 0.06), o, { type: 'highpass', freq: 2500 + o.rng() * 1500, peak: (0.05 - i * 0.008) * g, decay: 0.03 });
}

/** Party horn: a buzzy reed note with a fast tremble, bending up at the end. */
function partyHorn(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const d = 0.42;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(470, t);
  osc.frequency.setValueAtTime(470, t + d * 0.7);
  osc.frequency.linearRampToValueAtTime(560, t + d);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  const trem = ac.createOscillator();
  const tremG = ac.createGain();
  trem.frequency.value = 22;
  tremG.gain.value = 0.02 * o.gain;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045 * o.gain, t + 0.03);
  g.gain.setValueAtTime(0.045 * o.gain, t + d - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  trem.connect(tremG).connect(g.gain);
  osc.connect(lp).connect(g).connect(out);
  osc.start(t);
  trem.start(t);
  osc.stop(t + d + 0.05);
  trem.stop(t + d + 0.05);
}

/** The power coming back: a low mains hum (with its harmonic) rising and settling in under a second. */
function powerHum(ac: AudioContext, out: AudioNode, t: number, gain: number): void {
  for (const [f, peak] of [
    [100, 0.05],
    [200, 0.025],
  ] as const) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.35);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * gain, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.15);
  }
}

/** Distant thunder: a deep rumble that rolls in, grumbles and fades for a few seconds. */
function thunder(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  if (!o.noise) return;
  const d = 3 + o.rng() * 1.5;
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  src.loop = true;
  src.playbackRate.value = 0.25;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(260, t);
  lp.frequency.exponentialRampToValueAtTime(90, t + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28 * o.gain, t + 0.35);
  // grumbles: the level wobbles on the way down
  let at = t + 0.35;
  let lvl = 0.28;
  while (at < t + d - 0.4) {
    at += 0.25 + o.rng() * 0.35;
    lvl *= 0.65 + o.rng() * 0.45;
    g.gain.linearRampToValueAtTime(Math.max(0.0002, Math.min(0.3, lvl) * o.gain), at);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(lp).connect(g).connect(out);
  src.start(t);
  src.stop(t + d + 0.05);
}

/** A running bed (rain, wind, the robot's hum): `level` sets its volume; `stop` ends it. */
export interface Bed {
  level: GainNode;
  stop(at: number): void;
}

/** Long noise (a couple of seconds) so the loops of the beds don't sound repetitive. */
export function makeLongNoise(ac: AudioContext, seconds = 2.5): AudioBuffer | null {
  try {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  } catch {
    return null;
  }
}

/** Starts the loop of a bed at volume ~0 (the board fades `level` to the level the world asks for). */
export function startBed(ac: AudioContext, dest: AudioNode, kind: 'rain' | 'wind' | 'robot_hum' | 'generator', noise: AudioBuffer | null): Bed | null {
  const level = ac.createGain();
  level.gain.value = 0.0001;
  const t = ac.currentTime;
  const nodes: AudioScheduledSourceNode[] = [];
  const loop = (): AudioBufferSourceNode | null => {
    if (!noise) return null;
    const s = ac.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    nodes.push(s);
    return s;
  };
  if (kind === 'rain') {
    // steady hiss of the rain plus a brighter patter on the windows
    const a = loop();
    const b = loop();
    if (!a || !b) return null;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    const ga = ac.createGain();
    ga.gain.value = 0.1;
    a.connect(hp).connect(lp).connect(ga).connect(level);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.9;
    const gb = ac.createGain();
    gb.gain.value = 0.04;
    b.playbackRate.value = 1.13;
    b.connect(bp).connect(gb).connect(level);
    a.start(t);
    b.start(t, 1.1);
  } else if (kind === 'wind') {
    // wind: noise through a band that slowly moves (gusts), with the level breathing along
    const a = loop();
    if (!a) return null;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 1.6;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoF = ac.createGain();
    lfoF.gain.value = 260;
    lfo.connect(lfoF).connect(bp.frequency);
    const gust = ac.createGain();
    gust.gain.value = 0.14;
    const lfo2 = ac.createOscillator();
    lfo2.frequency.value = 0.07;
    const lfoG = ac.createGain();
    lfoG.gain.value = 0.08;
    lfo2.connect(lfoG).connect(gust.gain);
    a.playbackRate.value = 0.6;
    a.connect(bp).connect(gust).connect(level);
    nodes.push(lfo, lfo2);
    a.start(t);
    lfo.start(t);
    lfo2.start(t);
  } else if (kind === 'generator') {
    // the generator outside: a small engine's putt-putt (a low pulse train, shaken by a slow wobble) and some rattle
    const m = ac.createOscillator();
    m.type = 'square';
    m.frequency.value = 23;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const gm = ac.createGain();
    gm.gain.value = 0.05;
    const wob = ac.createOscillator();
    wob.frequency.value = 1.3;
    const wobG = ac.createGain();
    wobG.gain.value = 1.5;
    wob.connect(wobG).connect(m.frequency);
    m.connect(lp).connect(gm).connect(level);
    nodes.push(m, wob);
    m.start(t);
    wob.start(t);
    const a = loop();
    if (a) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      const gn = ac.createGain();
      gn.gain.value = 0.012;
      a.connect(bp).connect(gn).connect(level);
      a.start(t);
    }
  } else {
    // robot vacuum: a low motor hum and a soft brush whir
    const m = ac.createOscillator();
    m.type = 'sawtooth';
    m.frequency.value = 118;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const gm = ac.createGain();
    gm.gain.value = 0.03;
    m.connect(lp).connect(gm).connect(level);
    nodes.push(m);
    m.start(t);
    const a = loop();
    if (a) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 1.5;
      const gn = ac.createGain();
      gn.gain.value = 0.015;
      a.connect(bp).connect(gn).connect(level);
      a.start(t);
    }
  }
  level.connect(dest);
  return {
    level,
    stop(at: number) {
      for (const n of nodes) {
        try {
          n.stop(at);
        } catch {
          /* already stopped */
        }
      }
      setTimeout(() => level.disconnect(), Math.max(0, (at - ac.currentTime) * 1000) + 200);
    },
  };
}
