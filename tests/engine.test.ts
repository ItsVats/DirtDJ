import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeatTransport } from '../src/audio/engine';
import { newProject, type Project, type Sample } from '../src/types';

function fakeAudio() {
  const sources: { buffer: unknown; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: unknown }[] = [];
  const gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    currentTime: 0, destination: {},
    createBuffer: (_channels: number, length: number) => { const pcm = new Float32Array(length); return { getChannelData: () => pcm }; },
    createBufferSource: () => { const node = { buffer: undefined as unknown, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: undefined as unknown }; sources.push(node); return node; },
    createGain: () => { const node = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(node); return node; },
    createDynamicsCompressor: () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
  };
  return { ctx, sources, gains };
}
const sample = (id: string): Sample => ({ id, name: id, sampleRate: 16000, pcm: Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 12) * 0.4), origin: 'demo', predictions: [], createdAt: 0 });
function project(): Project {
  const p = newProject(); p.bpm = 120;
  p.tracks = p.tracks.map((track, i) => ({ ...track, sampleId: i === 0 ? 'a' : null, steps: Array.from({ length: 16 }, (_, step) => step === 0) }));
  return p;
}

describe('continuous bar transport', () => {
  const transports: BeatTransport[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { transports.forEach(transport => transport.stop()); transports.length = 0; vi.useRealTimers(); });
  function start() {
    const audio = fakeAudio(), p = project(), samples = [sample('a'), sample('b')];
    const transport = new BeatTransport(audio.ctx as unknown as AudioContext, p, samples, 0.05); transports.push(transport);
    return { ...audio, p, samples, transport };
  }

  it('keeps the current bar and applies pattern, sound, level, swing, and BPM on the next bar', () => {
    const { ctx, sources, gains, transport, p, samples } = start();
    const firstBuffer = sources[0].buffer;
    ctx.currentTime = 0.7;
    const changed = structuredClone(p); changed.bpm = 60; changed.swing = 0.5;
    changed.tracks[0] = { ...changed.tracks[0], sampleId: 'b', volume: 0.2, steps: Array.from({ length: 16 }, (_, i) => i === 1 || i === 8) };
    transport.update(changed, samples);
    expect(transport.position().bpm).toBe(120);
    expect(sources).toHaveLength(1);
    expect(sources[0].stop).not.toHaveBeenCalled();
    ctx.currentTime = 1.96; vi.advanceTimersByTime(25);
    expect(sources).toHaveLength(3);
    expect(sources[1].start).toHaveBeenCalledWith(2.05 + 0.25 * 1.225);
    expect(sources[2].start).toHaveBeenCalledWith(4.05);
    expect(sources[1].buffer).not.toBe(firstBuffer);
    expect(gains[2].gain.value).toBeCloseTo(0.2 * 0.85);
    expect(gains[3].gain.value).toBe(0.2);
    ctx.currentTime = 2.05;
    expect(transport.position()).toEqual({ step: 0, bar: 1, bpm: 60 });
    expect(sources[0].stop).not.toHaveBeenCalled();
    ctx.currentTime = 3.05;
    expect(transport.position().step).toBe(4);
  });

  it('replaces a future queued bar when edited just before the boundary, retaining current notes', () => {
    const { ctx, sources, transport, p, samples } = start();
    ctx.currentTime = 1.96; vi.advanceTimersByTime(25);
    expect(sources).toHaveLength(2);
    ctx.currentTime = 2.02;
    const changed = structuredClone(p); changed.tracks[0].muted = true;
    transport.update(changed, samples);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(sources[1].stop).toHaveBeenCalledOnce();
    ctx.currentTime = 2.05; expect(transport.position().bar).toBe(1);
    ctx.currentTime = 3.96; vi.advanceTimersByTime(25);
    expect(sources).toHaveLength(2); // Muted bars contain no audio nodes.
  });

  it('handles edits before a group cue, catches up after suspension, and cancels on stop', () => {
    const { ctx, sources, transport, p, samples } = start();
    const changed = structuredClone(p); changed.bpm = 160;
    transport.update(changed, samples);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(transport.position().step).toBe(-1);
    ctx.currentTime = 30.2;
    expect(transport.position()).toEqual({ step: 1, bar: 20, bpm: 160 });
    // The missed downbeat is skipped, rather than a burst of 20 missed bars.
    expect(sources).toHaveLength(2);
    transport.stop(); const count = sources.length;
    ctx.currentTime = 40; vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(count);
    expect(sources[1].stop).toHaveBeenCalledOnce();
  });
});
