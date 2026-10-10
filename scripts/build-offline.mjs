import { readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
await copyFile(resolve(import.meta.dirname, '../THIRD_PARTY_NOTICES.md'), resolve(dist, 'THIRD_PARTY_NOTICES.md'));
await copyFile(resolve(import.meta.dirname, '../LICENSE'), resolve(dist, 'LICENSE.txt'));
async function walk(dir, prefix = '') {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === 'models' || item.name === 'wasm') continue;
    if (item.isDirectory()) files.push(...await walk(resolve(dir, item.name), `${prefix}${item.name}/`));
    else if (!item.name.endsWith('.wasm')) files.push(`/${prefix}${item.name}`);
  }
  return files;
}
const files = await walk(dist);
const pack = JSON.parse(await readFile(resolve(dist, 'offline-pack.json'), 'utf8'));
for (const file of pack.files) {
  const info = await stat(resolve(dist, file.url.slice(1))).catch(() => undefined);
  if (!info || info.size !== file.bytes) throw new Error(`Missing or incomplete offline asset ${file.url}. Run npm run setup before building.`);
}
// Every build gets a distinct cache. A new worker only activates on the next launch.
const hasher = createHash('sha256');
for (const file of files) hasher.update(await readFile(resolve(dist, file.slice(1))));
const hash = hasher.digest('hex').slice(0, 12);
const shellCache = `dirtdj-shell-${hash}`;
const sw = `
const SHELL = ${JSON.stringify(shellCache)};
const AI = ${JSON.stringify('dirtdj-ai-' + pack.version)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('dirtdj-shell-') && key !== SHELL) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    if (event.request.mode === 'navigate') return (await caches.open(SHELL)).match('/index.html');
    const options = { ignoreSearch: true, ignoreVary: true };
    const cached = await (await caches.open(SHELL)).match(event.request, options) || await (await caches.open(AI)).match(event.request, options);
    return cached || fetch(event.request);
  })());
});
`;
await writeFile(resolve(dist, 'sw.js'), sw);
console.log(`Offline app shell generated (${files.length} files).`);
