import type { Role, Project, Sample } from '../types';

// The model accepts mono PCM at 16 kHz. Linear resampling is sufficient for this MVP.
export function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (!(from > 0 && to > 0)) throw new Error('Sample rates must be positive.');
  const output = new Float32Array(Math.round(input.length * to / from));
  for (let i = 0; i < output.length; i++) {
    const position = i * from / to;
    const left = Math.min(Math.floor(position), input.length - 1);
    const fraction = position - left;
    output[i] = (input[left] || 0) * (1 - fraction) + (input[Math.min(left + 1, input.length - 1)] || 0) * fraction;
  }
  return output;
}

export function rms(pcm: Float32Array): number {
  return Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / Math.max(1, pcm.length));
}

// Select the loudest short region, retain its attack, then normalize gently.
export function cutSample(sample: Sample, role: Role): Float32Array {
  const durations: Record<Role, number> = { thump: 0.24, crunch: 0.3, rustle: 0.14, call: 0.65 };
  const window = Math.max(1, Math.floor(sample.sampleRate * 0.025));
  let strongest = 0, position = 0;
  for (let i = 0; i < sample.pcm.length; i += window) {
    let energy = 0;
    for (let j = i; j < Math.min(i + window, sample.pcm.length); j++) energy += sample.pcm[j] ** 2;
    if (energy > strongest) { strongest = energy; position = i; }
  }
  const start = Math.max(0, position - Math.round(sample.sampleRate * 0.02));
  const cut = sample.pcm.slice(start, Math.min(sample.pcm.length, start + Math.round(sample.sampleRate * durations[role])));
  let peak = 0;
  for (const value of cut) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0.005 ? Math.min(3, 0.85 / peak) : 1;
  const fade = Math.min(Math.round(sample.sampleRate * 0.005), Math.floor(cut.length / 2));
  for (let i = 0; i < cut.length; i++) {
    const envelope = fade ? Math.min(1, i / fade, (cut.length - 1 - i) / fade) : 1;
    cut[i] *= gain * envelope;
  }
  return cut;
}

export function suggestRole(predictions: { label: string; score: number }[]): Role | undefined {
  const patterns: [Role, RegExp][] = [
    ['call', /bird|chirp|tweet|whistl|singing|insect|cricket/],
    ['thump', /footstep|walk|thump|thud|knock|tap|drum/],
    ['crunch', /crunch|crack|snap|clap|crush/],
    ['rustle', /rustl|wind|water|rain|stream|leaves|noise/],
  ];
  for (const prediction of predictions) {
    if (prediction.score < 0.08) continue;
    for (const [role, regex] of patterns) if (regex.test(prediction.label.toLowerCase())) return role;
  }
  return undefined;
}

export function eventsFor(project: Project, bars: number) {
  const secondsPerStep = 60 / project.bpm / 4;
  const events: { track: number; step: number; time: number }[] = [];
  project.tracks.forEach((track, index) => {
    if (track.muted || !track.sampleId) return;
    for (let bar = 0; bar < bars; bar++) track.steps.forEach((on, step) => {
      if (on) events.push({ track: index, step, time: (bar * 16 + step + (step % 2 ? project.swing * 0.45 : 0)) * secondsPerStep });
    });
  });
  return events;
}

export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((value, i) => { const clamped = Math.max(-1, Math.min(1, value)); view.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true); });
  return new Blob([buffer], { type: 'audio/wav' });
}

export function waveform(pcm: Float32Array, bins = 64): number[] {
  return Array.from({ length: bins }, (_, i) => {
    let peak = 0;
    for (let j = Math.floor(i * pcm.length / bins); j < Math.floor((i + 1) * pcm.length / bins); j++) peak = Math.max(peak, Math.abs(pcm[j]));
    return peak;
  });
}
