import type { DetectiveGame } from '../detective';
import type { Sample } from '../types';
import { encodeWav, resample } from './dsp';

// Keep discoveries in clue order, with breathing room between real-world sounds.
// This is a local audio edit, not generated music or another model prediction.
export function soundPostcard(game: DetectiveGame, samples: Sample[]): Blob {
  if (game.discoveries.length !== 4 || game.discoveries.some(item => !item)) throw new Error('Finish all four clues to make a Sound Postcard.');
  const ids = game.discoveries.map(item => item!.sampleId);
  if (new Set(ids).size !== 4) throw new Error('Each discovery needs its own recording.');
  const rate = 44100;
  const gap = Math.round(rate * 0.3);
  const clips = ids.map(id => {
    const sample = samples.find(item => item.id === id);
    if (!sample || !sample.pcm.length) throw new Error('A discovery recording is missing. Reopen its clue and capture it again.');
    if (!Number.isFinite(sample.sampleRate) || sample.sampleRate <= 0 || !sample.pcm.every(Number.isFinite)) throw new Error('A recording cannot be read. Capture it again.');
    const clip = resample(sample.pcm.slice(0, Math.round(sample.sampleRate * 3)), sample.sampleRate, rate);
    let peak = 0;
    for (const value of clip) peak = Math.max(peak, Math.abs(value));
    const gain = peak > 0.005 ? Math.min(2, 0.85 / peak) : 1;
    const fade = Math.min(Math.round(rate * 0.008), Math.floor(clip.length / 2));
    for (let i = 0; i < clip.length; i++) clip[i] *= gain * (fade ? Math.min(1, i / fade, (clip.length - 1 - i) / fade) : 1);
    return clip;
  });
  const pcm = new Float32Array(clips.reduce((total, clip) => total + clip.length, gap * 3));
  let offset = 0;
  for (const clip of clips) { pcm.set(clip, offset); offset += clip.length + gap; }
  return encodeWav(pcm, rate);
}
