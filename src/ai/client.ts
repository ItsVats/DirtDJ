import { resample } from '../audio/dsp';
import type { Prediction, Sample } from '../types';

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (result: Prediction[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const { id, result, error } = event.data;
      const task = pending.get(id);
      if (!task) return;
      clearTimeout(task.timer); pending.delete(id);
      if (error) task.reject(new Error(error)); else task.resolve(result);
    };
    worker.onerror = event => {
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(event.message || 'The AI worker could not start.')); }
      pending.clear(); worker?.terminate(); worker = undefined;
    };
  }
  return worker;
}

function request(pcm?: Float32Array): Promise<Prediction[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      // A wedged model must not keep the CPU busy indefinitely.
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('AI took too long on this device. You can still use your recording without a label.')); }
      pending.clear(); worker?.terminate(); worker = undefined;
    }, 180000);
    pending.set(id, { resolve, reject, timer });
    try { getWorker().postMessage({ id, pcm }, pcm ? [pcm.buffer] : []); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
export const warmModel = () => request();
export const classifySample = (sample: Sample) => request(resample(sample.pcm, sample.sampleRate));
