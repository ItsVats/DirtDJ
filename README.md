# Dirt DJ

**The outdoors is your instrument.** Solve sound mysteries with **Sound Detective**, using an open-weight audio model on your device. Or collect your own sounds and arrange them on the dirt deck.

Built for the **Touch Grass** challenge. No accounts, cloud AI, or inference API keys. Recordings stay on your device. This is a solo app with no multiplayer server.

**Mobile projects are included for Android and iPhone**, using Capacitor. See [the mobile guide](docs/MOBILE.md).

## Run it

Use Node.js **24 LTS** (22.12+ also satisfies the build tools' requirements).

```bash
npm ci
npm run setup
npm run build
npm run preview
```

Open **http://localhost:4173**. Click **Prepare offline** while connected, wait for the success message, then disconnect and reload. The initial setup downloads about **105 MB** of model/runtime files. They are ignored by Git and are recreated by `npm run setup`.

For editing with live reload, use `npm run dev` at **http://localhost:5173**. Offline installation is supported by the **production build/preview**, not the development server.

## Install on a phone

**Android:** a compiled APK is in `android/app/build/outputs/apk/debug/app-debug.apk`. Run `npm run phone:download`, connect your phone and laptop to the same Wi-Fi, open the printed phone URL, and download/install the APK. All AI assets are included, so solo play needs no internet after installation. The local Wi-Fi transfer itself needs no internet either.

**iPhone:** run `npm run mobile:ios`, then use full Xcode and device signing to install the included iOS project on your connected phone. No signed IPA or TestFlight download has been produced. See [the phone installation guide](docs/MOBILE.md) for both platforms and the optional HTTPS/PWA route.

## Try it

1. Open a **Sound Detective** case. Hear or read a mystery clue, lock your phone and explore, then tap once to capture three seconds. The local AST model checks the saved evidence against a sound family. A clear match earns a discovery; an uncertain result lets you retry, swap the clue or explicitly confirm the find yourself. Complete four clues to close the case and see your casebook. Detective captures do not assign lanes or start music.
2. Record a six-second sound in any lane, or import a WAV/MP3/M4A/WebM file. Imports keep the first ten seconds and are converted to mono. Maximum import size: 30 MB.
3. The local model returns its three highest scoring sound labels. You choose the lane; its suggested musical role appears in Field notes.
4. Tap the 16-step grid, adjust tempo/swing/levels, and press play. Edits apply on the next loop while playback continues. Type a tempo from 50–160 BPM.
5. Export **four bars plus a short tail** as a mono, 44.1 kHz, 16-bit WAV.

**Hear & explore** uses an installed English device voice only; it never selects a remote voice. If the browser/phone exposes no suitable voice, read the short prompt instead. Speech availability varies by device. Optional native search reminders can alert you with the screen locked. Capturing remains a foreground action.

Your original samples and current pattern are saved automatically in IndexedDB. Different browsers/origins have separate storage. Clear browser data and you clear the recordings too.

## What each technology does

| Piece | Technology | Responsibility |
| --- | --- | --- |
| Interface | React + TypeScript | Detective casebook, sound cards, recorder and sequencer |
| Build | Vite | Development server and optimized static files |
| Recording | Browser MediaRecorder | Captures microphone audio with permission |
| Sound decoding and music | Web Audio API | Converts files to waveforms; cuts, normalizes, fades, mixes, plays and renders samples |
| AI model | Audio Spectrogram Transformer (AST) | Scores 527 AudioSet sound categories |
| Model preparation | Transformers.js | Converts a 16 kHz mono waveform into log-mel features and handles the model pipeline |
| Model execution | ONNX Runtime Web / WebAssembly | Runs the quantized model locally on the CPU |
| Background processing | Web Worker | Keeps model loading/inference off the interface thread |
| Recordings and current beat | IndexedDB | Saves structured project data and PCM samples locally |
| Offline files | Cache API + service worker | Saves app/model/runtime files and serves them without internet |
| Checks | Vitest + Playwright | Audio logic, browser flows, and actual disconnected inference |
| Mobile packaging | Capacitor | Packages the same interface, audio engine, and AI assets as Android/iOS apps |
| Mobile export | Capacitor Filesystem + Share | Saves the WAV to an app cache file and opens the phone's share sheet |
| Spoken missions | Web Speech API | Reads prompts using installed English voices only, with a text fallback |
| Search reminders | Capacitor Local Notifications | Optional device-scheduled cues while you explore |

Read **[the project explainer](docs/EXPLAINER.md)** for the concepts, code tour, and a presentation script.

## The exact open model

- Original: [MIT/ast-finetuned-audioset-10-10-0.4593](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593).
- Browser-ready ONNX conversion: [Xenova/ast-finetuned-audioset-10-10-0.4593](https://huggingface.co/Xenova/ast-finetuned-audioset-10-10-0.4593).
- Pinned revision: `249a1fbf0286b40e7f1ed687a8ae396997bf7dc6`.
- Variant: `model_quantized.onnx`, 8-bit weights, approximately 90.8 MB.
- Setup verifies SHA-256: `807d244b58a30eaa89f0a721fb841619c696857aabe4eac93769bd0b61497f61`.

**AI recognizes sound and checks detective evidence; it does not generate the music.** Musical-role suggestions, sample trimming, groove presets and sequencing are regular code. AST predicts broad categories, not bird species. Scores are not calibrated confidence guarantees.

YAMNet was an early candidate in the idea discussion; **this implementation uses AST**. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Offline and privacy

Model loading has remote access disabled. We serve both model files and WASM from this app's origin. No fonts, scripts, inference services, or CDNs are needed at runtime.

On a deployed HTTPS origin, the service worker keeps the app available after setup. A local preview works without internet while its local server runs. A phone cannot access your laptop's `localhost`; use HTTPS hosting for a phone installation. Plain HTTP over a LAN does not provide the secure context required for recording/service workers.

Browser storage can be evicted. The app requests persistent storage during offline setup, but browsers may decline. Export beats you want to keep. Low-memory phones may struggle with AST; the MVP is tested in desktop Chromium and does not promise identical performance on every phone.

Native builds include the model and runtime inside the app and do not require the web offline-preparation step. The Android debug APK was successfully compiled at `android/app/build/outputs/apk/debug/app-debug.apk` (about 81 MB). Physical-device testing and iOS compilation remain unverified; full Xcode is unavailable here. Browser testing is not proof of native WebView compatibility; use the mobile test checklist before distribution.

## Check the project

```bash
npm test
npx playwright install chromium
npm run build
npm run test:e2e
npm audit
```

Browser tests use generated test audio, run the actual model (no mocked inference), disconnect the browser, reload, import audio, and check its labels. They also check WAV output, saved rhythm steps, recorder closure and invalid imports, and a complete disconnected detective case with three-second captures, actual AI verdicts, distinct self-confirmations, resumed progress and unchanged deck. Speech tests verify that remote voices are never selected and pending narration is canceled before capture. PNG screenshots go to the ignored `test-results/` folder.

## Host it yourself

Follow [the hosting and offline installation guide](docs/HOSTING.md) for DigitalOcean settings and laptop/Android/iPhone installation.

This is a static app. Run setup and build, then serve `dist/` over HTTPS with root-relative URLs. Ensure the host accepts the roughly 91 MB ONNX file and serves `.wasm` as `application/wasm`. No backend is required. This work does not push to GitHub or deploy the app.

App source: MIT license. Upstream components retain their respective licenses.
