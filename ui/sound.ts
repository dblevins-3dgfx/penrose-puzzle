// Synthesized Web Audio sound effects shared by Jigsaw and Sandbox (spec 7 & 9):
// zero external audio assets, lazily initialized on demand, and safe in
// environments without Web Audio or with strict autoplay restrictions.
import type { SoundCue } from '../settings';

let sharedCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
};

interface ToneSpec {
  freq: number;
  freqEnd?: number;
  type: OscillatorType;
  start: number;
  duration: number;
  gain: number;
}

const playTone = (ctx: AudioContext, tone: ToneSpec) => {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, tone.start);
  if (tone.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(tone.freqEnd, tone.start + tone.duration);
  }
  const attack = Math.min(0.01, tone.duration * 0.25);
  env.gain.setValueAtTime(0.0001, tone.start);
  env.gain.exponentialRampToValueAtTime(tone.gain, tone.start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, tone.start + tone.duration);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(tone.start);
  osc.stop(tone.start + tone.duration + 0.02);
};

const playSnap = (ctx: AudioContext, t: number) => {
  playTone(ctx, { freq: 740, freqEnd: 520, type: 'triangle', start: t, duration: 0.08, gain: 0.13 });
  playTone(ctx, { freq: 1480, type: 'sine', start: t, duration: 0.045, gain: 0.045 });
};

const playLock = (ctx: AudioContext, t: number) => {
  playTone(ctx, { freq: 523.25, type: 'sine', start: t, duration: 0.24, gain: 0.13 });
  playTone(ctx, { freq: 783.99, type: 'triangle', start: t + 0.025, duration: 0.2, gain: 0.075 });
};

const playBorder = (ctx: AudioContext, t: number) => {
  const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const at = t + i * 0.065;
    playTone(ctx, { freq, type: 'sine', start: at, duration: 0.36, gain: 0.11 });
    playTone(ctx, { freq: freq * 2, type: 'triangle', start: at, duration: 0.2, gain: 0.03 });
  });
};

const playSolve = (ctx: AudioContext, t: number) => {
  playTone(ctx, { freq: 261.63, type: 'sine', start: t, duration: 1.15, gain: 0.1 });
  const notes = [523.25, 659.25, 783.99, 880, 1046.5, 1318.5];
  notes.forEach((freq, i) => {
    const at = t + i * 0.07;
    const dur = i === notes.length - 1 ? 0.95 : 0.45;
    playTone(ctx, { freq, type: 'sine', start: at, duration: dur, gain: 0.11 });
    playTone(ctx, { freq: freq * 2, type: 'triangle', start: at, duration: dur * 0.55, gain: 0.028 });
  });
};

const SOUND_PLAYERS: Record<SoundCue, (ctx: AudioContext, t: number) => void> = {
  snap: playSnap,
  lock: playLock,
  border: playBorder,
  solve: playSolve
};

export const playSound = (cue: SoundCue): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    SOUND_PLAYERS[cue](ctx, ctx.currentTime);
  } catch {
    // Ignore audio errors when Web Audio is unavailable or blocked
  }
};
