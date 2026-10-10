type Pack = { revision: string; version: string; files: { url: string; bytes: number }[] };
import { nativeApp } from './mobile';
const cacheName = (pack: Pack) => `dirtdj-ai-${pack.version}`;

export async function registerOffline() {
  if (!nativeApp() && 'serviceWorker' in navigator && import.meta.env.PROD) await navigator.serviceWorker.register('/sw.js');
}

async function manifest(): Promise<Pack> {
  const response = await fetch('/offline-pack.json');
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) throw new Error('AI files are missing. Run npm run setup, then rebuild the app.');
  return response.json();
}

export async function offlineAvailable() {
  if (nativeApp()) return true; // The mobile build packages weights, runtime, and UI in the app.
  if (!('caches' in window) || !navigator.serviceWorker?.controller) return false;
  try {
    const pack = await manifest();
    const cache = await caches.open(cacheName(pack));
    return (await Promise.all(pack.files.map(file => cache.match(file.url)))).every(Boolean);
  } catch { return false; }
}

export async function prepareOffline(progress: (value: number) => void) {
  if (nativeApp()) { progress(1); return; }
  if (!window.isSecureContext) throw new Error('Offline installation needs HTTPS or localhost.');
  if (import.meta.env.DEV) throw new Error('Use npm run build and npm run preview to install the offline version.');
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('This browser does not support offline installation. Try a recent Chrome, Edge, or Safari.');
  const pack = await manifest();
  const cache = await caches.open(cacheName(pack));
  const total = pack.files.reduce((sum, item) => sum + item.bytes, 0);
  let complete = 0;
  for (const file of pack.files) {
    if (!await cache.match(file.url)) {
      const response = await fetch(file.url);
      if (!response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`Missing offline asset: ${file.url}. Run npm run setup and rebuild.`);
      await cache.put(file.url, response);
    }
    complete += file.bytes; progress(complete / total);
  }
  // The browser may refuse persistent storage; the app still works, but data can be evicted.
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  await navigator.serviceWorker.ready;
  for (let attempt = 0; !navigator.serviceWorker.controller && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  if (!await offlineAvailable()) throw new Error('The app shell is not ready yet. Reload and try offline setup again.');
}
