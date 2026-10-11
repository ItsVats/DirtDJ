# Dirt DJ: Touch Grass. Catch Sounds. Keep the Memories.

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).*

## What I Built

**Dirt DJ is a solo sound hunt and beat maker for Android and the web, with an open-weight audio model running on your own device.**

I wanted an app where the interesting part happens after you put your phone away. Instead of following a map or staring at a progress bar, you follow your ears.

In **Sound Detective**, you get four short mysteries. One clue asks you to find “a singer you can hear before you can see.” Another asks for a travelling drum whose voice changes with the ground beneath your feet.

Read or hear a clue, lock your phone, and explore. When you find the sound, return for a three-second capture. The app stops recording automatically and checks the evidence locally. If the model is unsure, you can try again, swap the clue, or confirm the discovery yourself. The casebook clearly separates AI matches from finds you confirmed.

Complete the hunt and make a **Sound Postcard**: a short WAV of your four discoveries, in clue order, with a little silence between them. It is an audio memory of your walk. Making and saving it works offline; sending it through a messaging service depends on that service's connection.

There is also a **Dirt Deck** for turning sounds into a beat. Record footsteps, crinkling leaves, tapping wood, or your own whistle; assign them to four lanes; then arrange a sixteen-step rhythm. Tempo, volume, and step edits take effect on the next loop while playback continues. Export the result as a WAV.

The hunt and the deck are separate activities. Closing a case creates a casebook and a postcard; it does not automatically turn every discovery into a groove.

## Demo

**Try the web app:** [Dirt DJ — live demo](https://dirtdj.onrender.com)

On the web, prepare the offline pack once while connected, wait for it to finish, then disconnect and reopen the app. The Android APK includes the model and runtime inside the app, so it needs no model download after installation.

## Code

The source, model setup, tests, and Android project are here:

{% github ItsVats/DirtDJ %}

[Browse the source on GitHub](https://github.com/ItsVats/DirtDJ)

## How I Built It

The open AI at the center is **Audio Spectrogram Transformer (AST)**, fine-tuned on AudioSet. I use the [MIT checkpoint](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593) through [Xenova's quantized ONNX conversion](https://huggingface.co/Xenova/ast-finetuned-audioset-10-10-0.4593). It scores 527 broad sound categories.

The path from a recording to a verdict is:

1. **MediaRecorder** captures the microphone with permission.
2. **Web Audio** decodes the recording into mono PCM and resamples it to 16 kHz.
3. **Transformers.js** prepares the model's audio features and handles its pipeline.
4. **ONNX Runtime Web / WebAssembly** executes the quantized weights on the device's CPU, inside a worker.
5. My gameplay rules compare the predicted labels with the current clue. An uncertain prediction stays uncertain; a player's confirmation is recorded separately.

The AI recognizes sounds and checks evidence. It does not generate the music. Sample trimming, fades, sequencing, mixing, and Sound Postcard assembly use ordinary audio code.

**React and TypeScript** provide the interface; **Vite** builds it. **IndexedDB** stores the recordings and beat locally. A **service worker and Cache API** keep the web app, model, and runtime available offline. **Capacitor** packages the shared app as an Android APK and provides the native file-sharing and optional local-reminder features.

The model revision is pinned, and setup verifies the weights with SHA-256. Remote model access is disabled at runtime. There is no inference API key, backend, or cloud database required. Render hosts the web build; the model runs on the user's device.

I also added a **GitHub Actions workflow** that runs unit tests, builds the web app, and uses Playwright to exercise the actual AST model with the browser disconnected. It checks offline reload, new captures/imports, a completed detective case, and Sound Postcard export. It then builds an Android APK and verifies that the correct model and local WASM runtime are packaged inside it. Screenshots and a CI test APK are saved as artifacts.

[See the workflow and its runs](https://github.com/ItsVats/DirtDJ/actions/workflows/ci.yml)

The automated audio fixtures are synthetic test sounds, not evidence of an outdoor field trial. Locally, 24 unit tests and seven browser tests passed. Android emulator checks also cover microphone access, offline inference, and postcard creation with the native share chooser in airplane mode. Testing on more physical phones is still needed, especially for memory use and device-specific audio behavior.

## Why Does Open Innovation Matter?

For this app, offline inference changes where the experience can happen. A sound hunt should work in a park with no signal, and recording a sound should not require uploading it to a service I do not control.

Open weights let me package the model with Android and cache it for the web. Open inference tools let me inspect the audio preparation and change how predictions become gameplay. I can replace the checkpoint later without rebuilding the app around a provider's private API.

A closed cloud API would need a connection to check each new sound. With this implementation, the complete inference path is local: recording, classification, casebook, beat making, and export. There is no per-request inference bill, although the device still supplies the processing power.

There are tradeoffs. The offline model/runtime pack is about **105 MB**, the model can confuse nearby sounds, and lower-memory phones may struggle. AST recognizes broad categories; it is not a bird-species expert, and its scores are not guaranteed confidence levels. Those limits shaped the app: short captures, optional clue swaps, and honest self-confirmation.

The goal is simple: spend a few seconds with the screen, then spend the interesting part listening to the world.

## Prize Categories

**Best Use of GitHub Copilot — through GitHub Actions automation.** The challenge lists project automation with GitHub Actions as an entry route. My workflow verifies the app's defining promise: real open-model inference and audio export with the browser offline, followed by a model-bundled Android build. I used Codex during development; I am entering through the Actions route and am not claiming Copilot authored the app.

Workflow: [Offline AI and Android](https://github.com/ItsVats/DirtDJ/actions/workflows/ci.yml)
