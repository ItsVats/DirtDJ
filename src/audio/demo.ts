import type { Sample } from '../types';

// These are clearly marked synthesized sounds, not field recordings or AI results.
export function demoSamples(): Sample[] {
  const rate = 16000;
  let seed = 42;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  return ['Thump', 'Crunch', 'Rustle', 'Whistle'].map((name, kind) => {
    const pcm = new Float32Array(rate);
    let previous = 0;
    for (let i = 0; i < pcm.length; i++) {
      const t = i / rate;
      if (kind === 0) pcm[i] = Math.sin(2 * Math.PI * (60 * t + 1.6 * (1 - Math.exp(-30 * t)))) * Math.exp(-14 * t) * 0.8;
      if (kind === 1) pcm[i] = noise() * Math.exp(-17 * t) * (0.45 + 0.25 * Math.sin(t * 270));
      if (kind === 2) { const random = noise(); pcm[i] = (random - previous) * Math.exp(-30 * t) * 0.3; previous = random; }
      if (kind === 3) pcm[i] = Math.sin(2 * Math.PI * (1100 * t + 100 * t * t)) * Math.sin(Math.PI * Math.min(1, t / 0.45)) * Math.exp(-7 * t) * 0.55;
    }
    return { id: `demo-${kind}`, name: `Demo ${name.toLowerCase()}`, pcm, sampleRate: rate, createdAt: Date.now(), origin: 'demo', predictions: [] };
  });
}
