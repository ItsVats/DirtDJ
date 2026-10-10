import { cutSample, encodeWav, eventsFor } from './dsp';
import type { Project, Role, Sample } from '../types';

let context: AudioContext | undefined;
let playing: BeatTransport | undefined;
let previewing: AudioBufferSourceNode | undefined;
let beatEpoch = 0;
export function audioContext() { return context ??= new AudioContext(); }
export async function unlockAudio() { const ctx = audioContext(); await ctx.resume(); return ctx; }
export function stopBeat() { beatEpoch++; playing?.stop(); playing = undefined; }
export function updateBeat(project: Project, samples: Sample[]) { playing?.update(project, samples); }
export function stopPreview() { try { previewing?.stop(); } catch { /* Already stopped. */ } previewing = undefined; }

export async function renderBeat(project: Project, samples: Sample[], bars = 1, tail = false) {
  const rate = 44100;
  const duration = bars * 4 * 60 / project.bpm;
  const offline = new OfflineAudioContext(1, Math.ceil((duration + (tail ? 0.7 : 0)) * rate), rate);
  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -12; compressor.ratio.value = 4;
  const master = offline.createGain(); master.gain.value = 0.8;
  compressor.connect(master); master.connect(offline.destination);
  const buffers = project.tracks.map(track => {
    const sample = samples.find(item => item.id === track.sampleId);
    if (!sample) return undefined;
    const pcm = cutSample(sample, track.role);
    const buffer = offline.createBuffer(1, Math.max(1, pcm.length), sample.sampleRate);
    buffer.getChannelData(0).set(pcm);
    return buffer;
  });
  for (const event of eventsFor(project, bars)) {
    const buffer = buffers[event.track];
    if (!buffer) continue;
    const source = offline.createBufferSource(); source.buffer = buffer;
    const gain = offline.createGain();
    gain.gain.value = project.tracks[event.track].volume * (event.step % 4 === 0 ? 1 : 0.85);
    source.connect(gain); gain.connect(compressor); source.start(event.time);
  }
  return offline.startRendering();
}

type Prepared = { project: Project; buffers: (AudioBuffer | undefined)[] };
type Bar = { startsAt: number; duration: number; index: number; prepared: Prepared; sources: AudioBufferSourceNode[] };

// Every bar owns its scheduled notes. Edits may replace a future bar, never the
// bar already being heard. Web Audio's clock determines each note's start time.
export class BeatTransport {
  private pending: Prepared;
  private current: Bar;
  private next?: Bar;
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;
  private sources = new Set<AudioBufferSourceNode>();
  private buffers = new WeakMap<Sample, Map<Role, AudioBuffer>>();
  private compressor: DynamicsCompressorNode;
  private master: GainNode;

  constructor(private ctx: AudioContext, project: Project, samples: Sample[], startsAt: number) {
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12; this.compressor.ratio.value = 4;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.compressor.connect(this.master); this.master.connect(ctx.destination);
    this.pending = this.prepare(project, samples);
    this.current = this.scheduleBar(startsAt, 0);
    this.timer = setInterval(() => this.pump(), 25);
  }

  private prepare(project: Project, samples: Sample[]): Prepared {
    const snapshot = { ...project, tracks: project.tracks.map(track => ({ ...track, steps: [...track.steps] })) };
    const buffers = snapshot.tracks.map(track => {
      const sample = samples.find(item => item.id === track.sampleId);
      if (!sample) return undefined;
      let cached = this.buffers.get(sample);
      if (!cached) { cached = new Map(); this.buffers.set(sample, cached); }
      let buffer = cached.get(track.role);
      if (!buffer) {
        const pcm = cutSample(sample, track.role);
        buffer = this.ctx.createBuffer(1, Math.max(1, pcm.length), sample.sampleRate);
        buffer.getChannelData(0).set(pcm);
        cached.set(track.role, buffer);
      }
      return buffer;
    });
    return { project: snapshot, buffers };
  }

  private scheduleBar(startsAt: number, index: number): Bar {
    const prepared = this.pending;
    const sources: AudioBufferSourceNode[] = [];
    for (const event of eventsFor(prepared.project, 1)) {
      const buffer = prepared.buffers[event.track];
      const when = startsAt + event.time;
      // If the app was suspended, skip missed notes rather than playing a burst.
      if (!buffer || when < this.ctx.currentTime) continue;
      const source = this.ctx.createBufferSource(); source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = prepared.project.tracks[event.track].volume * (event.step % 4 === 0 ? 1 : 0.85);
      source.connect(gain); gain.connect(this.compressor);
      source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
      this.sources.add(source); sources.push(source); source.start(when);
    }
    return { startsAt, duration: 240 / prepared.project.bpm, index, prepared, sources };
  }

  private cancelBar(bar: Bar) {
    for (const source of bar.sources) { try { source.stop(); } catch { /* Already ended. */ } }
  }

  private pump() {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    if (this.next && now >= this.next.startsAt) { this.current = this.next; this.next = undefined; }
    const end = this.current.startsAt + this.current.duration;
    if (now >= end) {
      // Recover promptly from a suspended timer, keeping the bar clock aligned.
      const duration = 240 / this.pending.project.bpm;
      const skipped = Math.floor((now - end) / duration);
      this.current = this.scheduleBar(end + skipped * duration, this.current.index + 1 + skipped);
    }
    const nextStart = this.current.startsAt + this.current.duration;
    if (!this.next && nextStart - now <= 0.12) this.next = this.scheduleBar(nextStart, this.current.index + 1);
  }

  update(project: Project, samples: Sample[]) {
    if (this.stopped) return;
    this.pump();
    this.pending = this.prepare(project, samples);
    // A group cue may be in the future; edits before it starts belong in bar 1.
    if (this.ctx.currentTime < this.current.startsAt) {
      this.cancelBar(this.current);
      this.current = this.scheduleBar(this.current.startsAt, this.current.index);
    }
    // Even an edit during the lookahead window reaches the very next loop.
    if (this.next) {
      this.cancelBar(this.next);
      this.next = this.scheduleBar(this.next.startsAt, this.next.index);
    }
  }

  position() {
    this.pump();
    const elapsed = this.ctx.currentTime - this.current.startsAt;
    return { step: elapsed < 0 ? -1 : Math.min(15, Math.floor(elapsed / this.current.duration * 16)), bar: this.current.index, bpm: this.current.prepared.project.bpm };
  }

  stop() {
    this.stopped = true; clearInterval(this.timer);
    for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } }
    this.sources.clear(); this.compressor.disconnect(); this.master.disconnect();
  }
}

export async function playBeat(project: Project, samples: Sample[], at?: number) {
  stopBeat();
  const epoch = beatEpoch;
  const ctx = await unlockAudio();
  if (epoch !== beatEpoch) throw new Error('Playback was canceled.');
  const startsAt = ctx.currentTime + Math.max(0.05, at ? (at - Date.now()) / 1000 : 0.05);
  const transport = new BeatTransport(ctx, project, samples, startsAt);
  playing = transport;
  return { position: () => transport.position() };
}

export async function previewSample(sample: Sample) {
  const ctx = await unlockAudio(); stopPreview();
  const source = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, sample.pcm.length, sample.sampleRate);
  buffer.getChannelData(0).set(sample.pcm); source.buffer = buffer;
  source.connect(ctx.destination); source.start(); previewing = source;
}

export async function exportBeat(project: Project, samples: Sample[]) {
  const buffer = await renderBeat(project, samples, 4, true);
  return encodeWav(buffer.getChannelData(0), buffer.sampleRate);
}

export async function decodeAudio(blob: Blob): Promise<{ pcm: Float32Array; sampleRate: number; truncated: boolean }> {
  const ctx = audioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const length = Math.min(decoded.length, Math.round(decoded.sampleRate * 10));
  const pcm = new Float32Array(length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < length; i++) pcm[i] += data[i] / decoded.numberOfChannels;
  }
  return { pcm, sampleRate: decoded.sampleRate, truncated: decoded.duration > 10 };
}
