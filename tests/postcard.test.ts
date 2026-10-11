import { describe, expect, it } from 'vitest';
import { soundPostcard } from '../src/audio/postcard';
import type { DetectiveGame } from '../src/detective';
import type { Sample } from '../src/types';

function fixture() {
  const samples: Sample[] = [16000, 44100, 48000, 22050].map((sampleRate, i) => ({
    id: `find-${i}`, name: `Discovery ${i}`, sampleRate,
    pcm: new Float32Array(sampleRate).fill((i + 1) * 0.1),
    createdAt: i, origin: 'recorded', predictions: [],
  }));
  const game: DetectiveGame = {
    version: 1, id: 'case', clueIds: ['knock', 'bird', 'water', 'hum'],
    discoveries: samples.map((sample, i) => ({ sampleId: sample.id, verified: i === 0 })),
    attempt: null, searchUntil: null,
  };
  return { samples, game };
}

describe('Sound Postcard', () => {
  it('keeps clue order across different rates, inserts silence, and preserves the originals', async () => {
    const { samples, game } = fixture();
    const originals = samples.map(sample => sample.pcm.slice());
    const blob = soundPostcard(game, [...samples].reverse());
    const bytes = await blob.arrayBuffer(), view = new DataView(bytes);
    const valueAt = (seconds: number) => view.getInt16(44 + Math.round(seconds * 44100) * 2, true) / 32767;
    expect(blob.type).toBe('audio/wav');
    expect(new TextDecoder().decode(new Uint8Array(bytes, 0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(bytes.byteLength).toBe(44 + Math.round(4.9 * 44100) * 2);
    for (let i = 0; i < 4; i++) {
      expect(valueAt(i * 1.3 + 0.5)).toBeCloseTo((i + 1) * 0.2, 3);
      expect(valueAt(i * 1.3)).toBe(0);
      if (i < 3) expect(valueAt(i * 1.3 + 1.15)).toBe(0);
      expect(samples[i].pcm).toEqual(originals[i]);
    }
  });

  it('limits each discovery to three seconds and fades its boundaries', async () => {
    const { samples, game } = fixture();
    for (const sample of samples) sample.pcm = new Float32Array(sample.sampleRate * 5).fill(1);
    const bytes = await soundPostcard(game, samples).arrayBuffer(), view = new DataView(bytes);
    expect(bytes.byteLength).toBe(44 + Math.round(12.9 * 44100) * 2);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(bytes.byteLength - 2, true)).toBe(0);
    expect(view.getInt16(44 + 44100 * 2, true) / 32767).toBeCloseTo(0.85, 3);
  });

  it('rejects unfinished cases, reused recordings, missing evidence, and corrupt audio', () => {
    const { samples, game } = fixture();
    expect(() => soundPostcard({ ...game, discoveries: [null, ...game.discoveries.slice(1)] }, samples)).toThrow(/Finish all four/);
    expect(() => soundPostcard({ ...game, discoveries: game.discoveries.map(() => game.discoveries[0]) }, samples)).toThrow(/own recording/);
    expect(() => soundPostcard(game, samples.slice(1))).toThrow(/missing/);
    samples[0].sampleRate = NaN;
    expect(() => soundPostcard(game, samples)).toThrow(/cannot be read/);
    samples[0].sampleRate = 16000; samples[0].pcm[0] = Infinity;
    expect(() => soundPostcard(game, samples)).toThrow(/cannot be read/);
  });
});
