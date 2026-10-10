import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const apk = resolve(import.meta.dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');
const info = await stat(apk).catch(() => undefined);
if (!info) { console.error('Android APK is missing. Build assembleDebug in Android Studio first.'); process.exit(1); }
const port = Number(process.env.DIRTDJ_DOWNLOAD_PORT ?? 8790);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Install Dirt DJ</title><style>body{font:16px/1.7 system-ui,sans-serif;background:#f5f3e9;color:#29382e;max-width:620px;margin:50px auto;padding:24px}h1{font-size:38px;line-height:1.1;letter-spacing:-1.8px}a{display:inline-block;padding:14px 22px;background:#e85f36;color:white;text-decoration:none;border-radius:7px;font-weight:600}li{margin:10px 0}small{color:#768166}button{font:inherit}</style></head><body><small>DIRT DJ / PHONE INSTALLATION</small><h1>Your world. Your sounds. Your beat.</h1><p>This Android test app bundles its AI model. After installation, Sound Detective, recording, and beat making work without internet.</p><a href="/DirtDJ.apk" download="DirtDJ-debug.apk">Download for Android · ${Math.round(info.size / 1024 / 1024)} MB</a><ol><li>Keep the phone and this laptop on the same Wi-Fi while transferring.</li><li>Download the APK, open it from Downloads, and tap Install. If Android asks, allow this browser or file manager to install this app.</li><li>Open Dirt DJ, then try airplane mode. Allow microphone access when recording.</li></ol><p><strong>iPhone:</strong> the APK is for Android. Open the included iOS project in Xcode on your Mac, choose your signing team and connected iPhone, and press Run. A signed iPhone download or TestFlight release has not been produced.</p><small>The transfer stays on your local Wi-Fi. This page serves only the APK and installation instructions. Stop the terminal with Ctrl+C after installing.</small></body></html>`;
const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path === '/DirtDJ.apk') {
    response.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': info.size, 'Content-Disposition': 'attachment; filename="DirtDJ-debug.apk"', 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end(); else createReadStream(apk).on('error', () => response.destroy()).pipe(response);
  } else if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : page); }
  else { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '0.0.0.0', () => {
  console.log(`Dirt DJ phone download: http://localhost:${port}`);
  for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
    if (address.family === 'IPv4' && !address.internal) console.log(`Open on your Android phone: http://${address.address}:${port}`);
  }
  console.log('Use the same Wi-Fi for this transfer. No internet is needed. Press Ctrl+C when done.');
});
