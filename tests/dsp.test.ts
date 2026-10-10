import { describe, expect, it } from 'vitest';
import { cutSample, encodeWav, eventsFor, resample, rms, suggestRole } from '../src/audio/dsp';
import { demoSamples } from '../src/audio/demo';
import { newProject } from '../src/types';

describe('audio preparation', () => {
  it('resamples 44.1 kHz audio to the model rate without changing duration', () => {
    const original = new Float32Array(44100).fill(0.25);
    const result = resample(original, 44100);
    expect(result.length).toBe(16000);
    expect(result[8000]).toBeCloseTo(0.25);
    expect(() => resample(original, 0)).toThrow();
  });
  it('selects the loud transient, preserves original PCM, and fades sample edges', () => {
    const pcm = new Float32Array(16000); pcm.fill(0.7, 8000, 8400);
    const sample = { ...demoSamples()[0], pcm };
    const cut = cutSample(sample, 'crunch');
    expect(cut.length).toBe(4800);
    expect(rms(cut)).toBeGreaterThan(0.1);
    expect(cut[0]).toBe(0); expect(cut.at(-1)).toBe(0);
    expect(sample.pcm[8000]).toBeCloseTo(0.7);
    expect(cut.every(Number.isFinite)).toBe(true);
  });
  it('handles silent and very short input without NaN', () => {
    const sample = { ...demoSamples()[0], pcm: new Float32Array(2) };
    expect(cutSample(sample, 'thump').every(Number.isFinite)).toBe(true);
    expect(rms(sample.pcm)).toBe(0);
  });
});

describe('music rules', () => {
  it('schedules swing on offbeats only and skips muted or empty lanes', () => {
    const project = newProject(); project.bpm = 120; project.swing = 1;
    project.tracks[0].sampleId = 'test'; project.tracks[0].steps.fill(true);
    project.tracks[1].sampleId = 'muted'; project.tracks[1].muted = true;
    const events = eventsFor(project, 2);
    expect(events).toHaveLength(32);
    expect(events[0].time).toBe(0);
    expect(events[1].time).toBeCloseTo(0.18125);
    expect(events[2].time).toBe(0.25);
    expect(events[16].time).toBe(2);
    expect(events.every(event => event.track === 0)).toBe(true);
  });
  it('only suggests roles for recognized labels with useful scores', () => {
    expect(suggestRole([{ label: 'Bird vocalization, bird call, bird song', score: 0.4 }])).toBe('call');
    expect(suggestRole([{ label: 'Footsteps', score: 0.6 }])).toBe('thump');
    expect(suggestRole([{ label: 'Speech', score: 0.8 }])).toBeUndefined();
    expect(suggestRole([{ label: 'Bird', score: 0.001 }])).toBeUndefined();
  });
});

describe('WAV export', () => {
  it('writes a valid mono 16-bit PCM header and clips out-of-range samples', async () => {
    const data = await encodeWav(new Float32Array([-2, 0, 2]), 16000).arrayBuffer();
    const view = new DataView(data);
    const text = (from: number, length: number) => new TextDecoder().decode(new Uint8Array(data, from, length));
    expect(text(0, 4)).toBe('RIFF'); expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
    expect(data.byteLength).toBe(50);
  });
});
