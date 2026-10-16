// Small synthesized sound set (WebAudio, no assets). Silent when Sound is OFF.
type Cue = 'launch' | 'burst' | 'gate' | 'lowFuel' | 'complete' | 'failed';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on && ctx && ctx.state === 'running') void ctx.suspend();
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', endFreq?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

function noise(a: AudioContext, dur: number, gain: number) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export function play(cue: Cue): void {
  const a = audio();
  if (!a) return;
  switch (cue) {
    case 'launch': tone(a, 180, 0, 0.35, 0.12, 'triangle', 420); break;
    case 'burst': noise(a, 0.28, 0.08); break;
    case 'gate': tone(a, 660, 0, 0.12, 0.08); tone(a, 990, 0.08, 0.16, 0.06); break;
    case 'lowFuel': tone(a, 330, 0, 0.12, 0.08, 'square'); tone(a, 330, 0.18, 0.12, 0.08, 'square'); break;
    case 'complete': tone(a, 523, 0, 0.2, 0.1); tone(a, 784, 0.12, 0.25, 0.09); tone(a, 1046, 0.26, 0.5, 0.08); break;
    case 'failed': tone(a, 220, 0, 0.6, 0.12, 'sawtooth', 55); break;
  }
}
