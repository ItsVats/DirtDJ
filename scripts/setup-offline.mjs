// Run once with internet. All runtime model requests then stay on this app's origin.
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const model = 'Xenova/ast-finetuned-audioset-10-10-0.4593';
const revision = '249a1fbf0286b40e7f1ed687a8ae396997bf7dc6';
const modelHash = '807d244b58a30eaa89f0a721fb841619c696857aabe4eac93769bd0b61497f61';
const modelFiles = ['config.json', 'preprocessor_config.json', 'onnx/model_quantized.onnx'];
const entries = [];
for (const file of modelFiles) {
  const path = resolve(root, 'public/models', model, file);
  await mkdir(dirname(path), { recursive: true });
  let bytes;
  try { bytes = await readFile(path); } catch { /* Download below. */ }
  if (!bytes || (file.endsWith('.onnx') && createHash('sha256').update(bytes).digest('hex') !== modelHash)) {
    console.log(`Downloading ${file} from pinned model revision…`);
    const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${file}`);
    if (!response.ok) throw new Error(`Model download failed: ${response.status} ${file}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (file.endsWith('.onnx') && createHash('sha256').update(bytes).digest('hex') !== modelHash) {
      throw new Error('Model integrity check failed. File was not saved.');
    }
    await writeFile(path, bytes);
  }
  entries.push({ url: `/models/${model}/${file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const runtimeDir = dirname(fileURLToPath(import.meta.resolve('onnxruntime-web')));
await mkdir(resolve(root, 'public/wasm'), { recursive: true });
const names = await readdir(runtimeDir);
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  if (!names.includes(name)) throw new Error(`Missing ONNX runtime asset: ${name}`);
  await copyFile(resolve(runtimeDir, name), resolve(root, 'public/wasm', name));
  const bytes = await readFile(resolve(runtimeDir, name));
  entries.push({ url: `/wasm/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const version = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12);
await writeFile(resolve(root, 'public/offline-pack.json'), JSON.stringify({ model, revision, version, files: entries }, null, 2) + '\n');
console.log(`Ready: ${(entries.reduce((n, entry) => n + entry.bytes, 0) / 1e6).toFixed(1)} MB of local AI assets. No inference server needed.`);
