/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import type { Prediction } from '../types';

// No Hugging Face/CDN calls at runtime. Both weights and WASM are served locally.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
env.useBrowserCache = false; // Dirt DJ owns the offline cache instead.
env.backends.onnx.wasm!.wasmPaths = {
  mjs: '/wasm/ort-wasm-simd-threaded.mjs',
  wasm: '/wasm/ort-wasm-simd-threaded.wasm',
};
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

const model = 'Xenova/ast-finetuned-audioset-10-10-0.4593';
type Classifier = (pcm: Float32Array, options: { top_k: number }) => Promise<Prediction[]>;
let classifier: Promise<Classifier> | undefined;
const getClassifier = () => classifier ??= pipeline('audio-classification', model, { device: 'wasm', dtype: 'q8' }) as unknown as Promise<Classifier>;

self.onmessage = async (event: MessageEvent<{ id: number; pcm?: Float32Array }>) => {
  const { id, pcm } = event.data;
  try {
    const classify = await getClassifier();
    // The pipeline converts the waveform into log-mel features before AST inference.
    const result = pcm ? await classify(pcm, { top_k: 3 }) : [];
    self.postMessage({ id, result });
  } catch (error) {
    classifier = undefined; // Allow retry after the pack is installed.
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
