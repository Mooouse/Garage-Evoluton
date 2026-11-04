// The garage's sounds, synthesized (no files), all through the host's mixer: every tool sounds like itself — the
// wet SLAP of a sponge, the hiss of a hose and a pressure washer, a grinder's buzz, the polisher's soft whirr, the
// wrench's ratchet, the spray gun — then the clunk of a part, the engine starting, the horn, coins and the fanfare.
// The music: one tune per garage level from @gp/core/sound (a cosy shed … a bright plant … a calm hangar).

import { createAmbience, createMixer, createMusic, musicTheme, type Ambience, type Mixer, type Music, type SoundHost } from '@gp/core/sound';
import type { Cat, LayerKind } from './data.ts';

export function createSound(host: SoundHost, volumes: { music: number; sfx: number }) {
  const mixer: Mixer = createMixer(host, { music: volumes.music, ambient: volumes.music * 0.8, sfx: volumes.sfx });
  const music: Music = createMusic(mixer, {
    shed: musicTheme('cozy', 19, { bpm: 92, root: 'F4' }),
    workshop: musicTheme('bright', 31, { bpm: 104, root: 'G4', drums: 1 }),
    station: musicTheme('bright', 47, { bpm: 108, root: 'A4', drums: 2, bright: 2000 }),
    luxury: musicTheme('cozy', 58, { bpm: 96, root: 'Eb4', scale: 'dorian', pad: 'sine', bright: 1500 }),
    plant: musicTheme('heroic', 73, { bpm: 110, root: 'D4', melody: 0.45, bright: 1700 }),
    hangar: musicTheme('mystery', 89, { bpm: 90, root: 'E4', scale: 'lydian', drums: 1, echo: 0.5 }),
  });
  const ambience: Ambience = createAmbience(mixer, { seed: 5 });
  let noise: AudioBuffer | null = null;

  const out = () => mixer.bus('sfx');
  const ctx = () => mixer.ctx();
  const ok = () => !!ctx() && !!out() && !mixer.silent();

  function noiseBuf(c: AudioContext): AudioBuffer {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      const d = noise.getChannelData(0);
      let s = 1;
      for (let i = 0; i < d.length; i++) {
        s = (s * 16807) % 2147483647;
        d[i] = (s / 2147483647) * 2 - 1;
      }
    }
    return noise;
  }

  /** A noise burst through a filter, with an envelope */
  function burst(o: { type?: BiquadFilterType; f0: number; f1?: number; q?: number; dur: number; vol: number; attack?: number; at?: number }): void {
    if (!ok()) return;
    const c = ctx()!;
    const now = c.currentTime + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf(c);
    src.playbackRate.value = 0.8 + ((now * 997) % 1) * 0.4;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f0, now);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, now + o.dur);
    f.Q.value = o.q ?? 1;
    const v = c.createGain();
    v.gain.setValueAtTime(0.0001, now);
    v.gain.exponentialRampToValueAtTime(o.vol, now + (o.attack ?? 0.008));
    v.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);
    src.connect(f).connect(v).connect(out()!);
    src.start(now, ((now * 1.7) % 0.5));
    src.stop(now + o.dur + 0.05);
  }

  /** A tone with a pitch glide */
  function tone(o: { type?: OscillatorType; f0: number; f1?: number; dur: number; vol: number; at?: number; attack?: number }): void {
    if (!ok()) return;
    const c = ctx()!;
    const now = c.currentTime + (o.at ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, now);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, now + o.dur);
    const v = c.createGain();
    v.gain.setValueAtTime(0.0001, now);
    v.gain.exponentialRampToValueAtTime(o.vol, now + (o.attack ?? 0.01));
    v.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);
    osc.connect(v).connect(out()!);
    osc.start(now);
    osc.stop(now + o.dur + 0.05);
  }

  let lastStroke = 0;
  return {
    mixer,
    music,
    /** The level's tune (and a little room tone) */
    level(l: number): void {
      music.play(['shed', 'workshop', 'station', 'luxury', 'plant', 'hangar'][Math.max(0, Math.min(5, l - 1))]);
      ambience.set(l >= 6 ? { hum: 0.35 } : l === 5 ? { hum: 0.25, wind: 0.1 } : { wind: 0.08, birds: l <= 2 ? 0.12 : 0 });
    },
    hold(on: boolean): void {
      music.hold(on);
      ambience.hold(on);
    },
    /** A tool stroke on a layer: every surface sounds its own way (soft: they repeat many times a second) */
    stroke(kind: LayerKind | 'part' | 'engine' | 'dent' | 'thruster', cat: Cat, tier: number, hand: boolean): void {
      const c = ctx();
      if (!c) return;
      // A robot's strokes are quieter, and no more than ~12 sounds a second
      if (c.currentTime - lastStroke < (hand ? 0.045 : 0.09)) return;
      lastStroke = c.currentTime;
      const k = hand ? 1 : 0.4;
      if (kind === 'dent') {
        // The suction cup: a rubbery creak rising as the panel gives
        tone({ type: 'triangle', f0: 110, f1: 190, dur: 0.1, vol: 0.07 * k });
        burst({ type: 'lowpass', f0: 500, f1: 300, dur: 0.06, vol: 0.05 * k, q: 4 });
      } else if (kind === 'mud' && tier === 0) {
        // ШЛЁП: a wet low thud and a squelch
        burst({ type: 'lowpass', f0: 900, f1: 180, dur: 0.16, vol: 0.32 * k, q: 3 });
        tone({ type: 'sine', f0: 140, f1: 70, dur: 0.12, vol: 0.12 * k });
      } else if (kind === 'mud' || kind === 'dust' || kind === 'soot') {
        // The jet: a hiss, higher with the tier
        burst({ type: 'bandpass', f0: 2600 + tier * 600, f1: 1800, dur: 0.14, vol: 0.14 * k, q: 0.7 });
        if (kind === 'mud') burst({ type: 'lowpass', f0: 600, f1: 200, dur: 0.1, vol: 0.12 * k, q: 2, at: 0.02 });
      } else if (kind === 'rust') {
        // The grinder: a saw buzz with grit
        tone({ type: 'sawtooth', f0: 520 + tier * 60, f1: 480, dur: 0.12, vol: 0.05 * k });
        burst({ type: 'highpass', f0: 3500, dur: 0.1, vol: 0.1 * k });
      } else if (kind === 'paint') {
        burst({ type: 'highpass', f0: 5000, f1: 4000, dur: 0.16, vol: 0.09 * k });
      } else if (kind === 'polish') {
        tone({ type: 'triangle', f0: 220, f1: 240, dur: 0.14, vol: 0.06 * k });
        burst({ type: 'bandpass', f0: 1200, dur: 0.12, vol: 0.05 * k, q: 2 });
      } else if (kind === 'thruster') {
        // The welder on a nozzle: a crackle over a low hum
        burst({ type: 'highpass', f0: 4200, f1: 3000, dur: 0.09, vol: 0.12 * k });
        tone({ type: 'sawtooth', f0: 95, f1: 90, dur: 0.1, vol: 0.04 * k });
      } else {
        // The wrench's ratchet: two quick clicks
        burst({ type: 'bandpass', f0: 3200, dur: 0.03, vol: 0.22 * k, q: 6 });
        burst({ type: 'bandpass', f0: 2800, dur: 0.03, vol: 0.18 * k, q: 6, at: 0.05 });
      }
    },
    /** The tyre bay */
    nut(tight: boolean): void {
      burst({ type: 'bandpass', f0: tight ? 3600 : 2600, dur: 0.04, vol: 0.2, q: 6 });
      burst({ type: 'bandpass', f0: tight ? 3000 : 2200, dur: 0.04, vol: 0.16, q: 6, at: 0.05 });
      if (tight) tone({ type: 'square', f0: 900, dur: 0.05, vol: 0.05, at: 0.1 });
    },
    spray(): void {
      if (!ok()) return;
      const c = ctx()!;
      if (c.currentTime - lastStroke < 0.08) return;
      lastStroke = c.currentTime;
      burst({ type: 'highpass', f0: 3200, f1: 2600, dur: 0.12, vol: 0.08 });
    },
    bubbles(): void {
      for (let i = 0; i < 3; i++) tone({ type: 'sine', f0: 700 + i * 260, f1: 1100 + i * 200, dur: 0.06, vol: 0.05, at: i * 0.05 });
    },
    plug(): void {
      tone({ type: 'sine', f0: 220, f1: 110, dur: 0.14, vol: 0.14 });
      burst({ type: 'lowpass', f0: 900, dur: 0.08, vol: 0.1 });
    },
    pump(p: number): void {
      if (!ok()) return;
      const c = ctx()!;
      if (c.currentTime - lastStroke < 0.14) return;
      lastStroke = c.currentTime;
      burst({ type: 'bandpass', f0: 500 + p * 900, dur: 0.1, vol: 0.09, q: 1.2 });
    },
    /** A rocket engine fires (a repaired nozzle's test, a ship landing or taking off): a deep roar, `sec` long */
    ignite(sec = 0.8, vol = 0.3): void {
      burst({ type: 'lowpass', f0: 700, f1: 160, dur: sec, vol, q: 0.6 });
      tone({ type: 'sawtooth', f0: 55, f1: 48, dur: sec, vol: vol * 0.25 });
    },
    pop(): void {
      mixer.duck(0.4, 0.8);
      burst({ type: 'lowpass', f0: 1800, f1: 120, dur: 0.35, vol: 0.4, q: 0.7 });
      tone({ type: 'sine', f0: 90, f1: 40, dur: 0.3, vol: 0.2 });
    },
    ding(): void {
      tone({ type: 'sine', f0: 1320, dur: 0.18, vol: 0.1 });
      tone({ type: 'sine', f0: 1980, dur: 0.25, vol: 0.06, at: 0.05 });
    },
    pull(): void {
      tone({ type: 'triangle', f0: 180, f1: 320, dur: 0.18, vol: 0.08 });
    },
    dent(): void {
      tone({ type: 'square', f0: 420, f1: 300, dur: 0.08, vol: 0.08 });
      burst({ type: 'bandpass', f0: 2600, dur: 0.06, vol: 0.14, q: 3 });
    },
    /** A layer finished: a bright little chime */
    layerDone(): void {
      tone({ type: 'sine', f0: 1046, dur: 0.25, vol: 0.12 });
      tone({ type: 'sine', f0: 1568, dur: 0.35, vol: 0.09, at: 0.08 });
    },
    /** A part snapped in */
    clunk(): void {
      tone({ type: 'square', f0: 180, f1: 90, dur: 0.12, vol: 0.12 });
      burst({ type: 'bandpass', f0: 2400, dur: 0.06, vol: 0.18, q: 4 });
      tone({ type: 'sine', f0: 880, dur: 0.2, vol: 0.06, at: 0.05 });
    },
    /** Lights, horn, engine */
    lights(): void {
      tone({ type: 'sine', f0: 660, f1: 990, dur: 0.18, vol: 0.08 });
    },
    horn(): void {
      tone({ type: 'sawtooth', f0: 392, dur: 0.32, vol: 0.06 });
      tone({ type: 'sawtooth', f0: 494, dur: 0.32, vol: 0.05 });
      tone({ type: 'sawtooth', f0: 392, dur: 0.22, vol: 0.06, at: 0.4 });
      tone({ type: 'sawtooth', f0: 494, dur: 0.22, vol: 0.05, at: 0.4 });
    },
    engine(): void {
      mixer.duck(0.4, 1.2);
      tone({ type: 'sawtooth', f0: 38, f1: 70, dur: 0.6, vol: 0.18, attack: 0.05 });
      tone({ type: 'square', f0: 55, f1: 95, dur: 1.1, vol: 0.06, at: 0.35, attack: 0.1 });
      burst({ type: 'lowpass', f0: 300, dur: 1.2, vol: 0.18, at: 0.3, attack: 0.1 });
    },
    driveOut(): void {
      tone({ type: 'sawtooth', f0: 70, f1: 160, dur: 1.4, vol: 0.08, attack: 0.08 });
      burst({ type: 'lowpass', f0: 500, f1: 900, dur: 1.2, vol: 0.12, attack: 0.1 });
    },
    /** RESTORED: a rising fanfare and coins */
    fanfare(): void {
      mixer.duck(0.5, 1.4);
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.12, at: i * 0.09 }));
      tone({ type: 'sine', f0: 1318, dur: 0.6, vol: 0.08, at: 0.38 });
      for (let i = 0; i < 6; i++) tone({ type: 'sine', f0: 1800 + i * 160, dur: 0.12, vol: 0.05, at: 0.45 + i * 0.05 });
    },
    /** A coin; `step` raises it a little each beat (the payout counting up) */
    coin(step = 0): void {
      const k = 1 + 0.06 * step;
      tone({ type: 'sine', f0: 1320 * k, dur: 0.1, vol: 0.1 });
      tone({ type: 'sine', f0: 1760 * k, dur: 0.16, vol: 0.09, at: 0.06 });
    },
    buy(): void {
      tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.14, vol: 0.12 });
      tone({ type: 'sine', f0: 1320, dur: 0.18, vol: 0.06, at: 0.07 });
    },
    no(): void {
      tone({ type: 'square', f0: 160, f1: 110, dur: 0.16, vol: 0.06 });
    },
    tap(): void {
      tone({ type: 'sine', f0: 620, f1: 820, dur: 0.06, vol: 0.05 });
    },
    /** A rush job rolls in: two quick rising horn notes */
    order(): void {
      tone({ type: 'square', f0: 523, f1: 540, dur: 0.12, vol: 0.06 });
      tone({ type: 'square', f0: 698, f1: 720, dur: 0.16, vol: 0.06, at: 0.14 });
    },
    /** The rush clock's last seconds */
    tick(): void {
      tone({ type: 'sine', f0: 1320, dur: 0.04, vol: 0.035 });
    },
    /** A big unlock: a new garage, a new tool tier */
    unlock(): void {
      mixer.duck(0.5, 1.6);
      [392, 523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.5, vol: 0.1, at: i * 0.11 }));
    },
    setVolumes(m: number, s: number): void {
      mixer.setVolume('music', m);
      mixer.setVolume('ambient', m * 0.8);
      mixer.setVolume('sfx', s);
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
