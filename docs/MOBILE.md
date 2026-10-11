# Solo mobile app

## The app structure

The React/TypeScript app is the shared product code. **Capacitor** embeds its production build in Android's WebView and iPhone's WKWebView, with a bridge to native capabilities.

This is a hybrid native app: it has Android and iOS projects and can be built into installed apps. The interface is still written in React; it has not been rewritten in Kotlin or Swift. The native wrappers package local model/runtime assets, so they do not depend on a website being reachable after installation.

**Current verification:** Android test build 1.2 (version code 3) compiled successfully. Android emulator checks passed for the microphone prompt, denial recovery/app settings, recording start and track release, airplane-mode AI classification, playback and tab switching. The Sound Postcard check also created a valid WAV and opened Android's native share chooser in airplane mode, using synthetic recordings. Physical-phone compatibility still needs checking. It is at `android/app/build/outputs/apk/debug/app-debug.apk` (about 81 MB). Browser tests cover real AI inference, offline reload, complete detective cases, and Sound Postcard WAV export. Native WebView behavior must be checked on target devices.

## Mobile screens and microphone access

On phones and in the native app, bottom navigation opens **Hunt**, **Kit**, **Deck**, or **Sounds**. The desktop web view keeps its wider layout. Mobile screens remain mounted when hidden, so switching tabs preserves detective progress and continuous playback. The deck shows one selectable lane with sixteen numbered touch controls in a four-by-four grid. Recording opens a full-screen capture view and prevents background scrolling.

Android's manifest now declares `MODIFY_AUDIO_SETTINGS` alongside `RECORD_AUDIO`: Capacitor's WebView audio capture checks both. The local `AudioAccess` Capacitor plugin requests the microphone permission when capture begins and opens Android app settings if access is denied. Recording still uses MediaRecorder/Web Audio; this plugin does not upload or record audio itself. The error message refers to phone permissions in native builds and browser site settings on the web.

Install this APK over the existing Dirt DJ installation to update without clearing its recordings. If permission remains denied, use **Open app settings → Permissions → Microphone**, allow access while using the app, and return to retry. Check the device microphone privacy toggle too.

## Install on your Android phone now

The compiled test APK is `android/app/build/outputs/apk/debug/app-debug.apk`.

The simplest transfer uses your local Wi-Fi:

```bash
cd /Users/vats/Desktop/DirtDJ/DirtDJ
npm run phone:download
```

1. Connect your Android phone and Mac to the same Wi-Fi. The router does not need internet.
2. Open the **phone URL printed by the command** in your phone browser, for example `http://192.168.29.233:8790`. `localhost` on a phone means the phone itself, so use the laptop's printed address.
3. Tap **Download for Android**, open `DirtDJ-debug.apk` from Downloads, then tap **Install**. If prompted, Android's **Install unknown apps** permission applies to the browser/file manager handling this file. Device or organization policies can restrict this; the steps vary by phone.
4. Open Dirt DJ and allow microphone access when you record. Notifications are optional and requested only if you turn on a search reminder.
5. Switch to airplane mode and run a new recording and classification. Sound Detective, the deck, collection, and WAV export need no server.
6. Stop the download terminal with **Ctrl+C** when the transfer finishes. The app continues to work.

You can also transfer this same APK using USB or another file-transfer method. This is a debug test build, not a Play Store release. Existing installations made with the same development key can be updated by installing the newer APK; uninstalling clears local app data.

The download helper exposes just `/` and `/DirtDJ.apk`; it does not expose the repository, recordings, or arbitrary files. It is a transfer helper, not an app backend.

## Install on an iPhone

An iPhone cannot install an Android APK. The native iOS project is included, but this workspace has **no signed IPA or TestFlight download** and lacks full Xcode.

1. Install full **Xcode** on your Mac and complete its initial setup.
2. Connect your iPhone by cable, unlock it, and trust the Mac if prompted.
3. Run `npm run mobile:sync`, then `npm run mobile:ios` from this repository.
4. In Xcode, select the **App** target, open **Signing & Capabilities**, enable automatic signing, and choose your Apple Account's development team. A personal team can run development builds on your own device; broad distribution requires an appropriate Apple distribution route.
5. Select your connected iPhone as the run destination and press **Run**. Follow Xcode's device pairing instructions and enable **Developer Mode** on the iPhone when requested.
6. Once installed, launch in airplane mode and test a new recording and model classification. The native iPhone build bundles the same AI assets; it does not fetch them from the laptop.

For friends who need a simple iPhone download, a signed **TestFlight/App Store** build is the next distribution step. Publishing and Apple account setup have not been done.

A web alternative is possible after hosting this web build on HTTPS: open it in Safari, prepare its offline pack once, then use **Add to Home Screen**. The current localhost URL is only a development preview; an ordinary HTTP laptop address does not provide the secure context required for browser microphone access and offline installation. Native apps avoid that hosting requirement.

Official setup references: [Run on a device](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html), [personal-team signing](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html), [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/), [Android app installation](https://support.google.com/pixelphone/answer/7391672?hl=en).

## Sound Detective with little screen time

1. Tap **Open a case** to receive four randomly selected sound mysteries. One clue appears at a time; a hint is optional.
2. Tap **Hear & explore**, or read the clue once. Lock the phone and search. Speech uses an installed English voice exposed by the device; without one, the text fallback remains available.
3. Return and tap **Found it. Check my sound**. The app records three seconds, stops the microphone, saves the evidence and runs AST locally.
4. An AI match earns a discovery. If the model is unsure, try another sound, check again, choose a different clue, or explicitly confirm the find yourself. Self-confirmed discoveries are never labeled AI matches.
5. Complete four clues to close the case. The casebook lists the discoveries and how they were confirmed. Detective captures stay in Field notes without assigning deck lanes or starting a beat. The music deck is a separate activity.
6. Tap **Share Sound Postcard** to join those four recordings into a short WAV. File creation works offline; the Android system chooser lets you save or share it. Sending through a messaging service may require internet.

The case, saved evidence IDs and search timestamp persist locally. Reload resumes it, including a saved attempt awaiting a verdict. Deleting evidence reopens its clue. Starting a new case keeps older recordings. Old adventure recordings are retained; old adventure rounds do not become verified detective discoveries.

The optional reminder uses **Capacitor Local Notifications**, scheduled by the phone itself. It works without internet and can notify while the screen is locked, subject to OS notification permissions, focus/quiet modes, and battery settings. Android uses an **inexact** alarm; it can be delayed. The plugin's exact-alarm manifest permission is explicitly removed. A declined notification permission never blocks the hunt. On the web, a chime is a foreground fallback, not a background alarm. Reminders are canceled when starting capture or choosing a new round.

Searching can continue with the phone locked. Detective recording is a foreground three-second capture; manual field-kit recordings last six seconds; background microphone recording is not implemented.

## Prepare and open the native projects

From the repository root:

```bash
npm ci
npm run setup
npm run mobile:sync
```

Then:

```bash
# Opens the existing project in Android Studio
npm run mobile:android

# Opens the existing project in Xcode
npm run mobile:ios
```

`mobile:sync` builds `dist/`, copies it into the two native projects, and updates their Capacitor plugin dependencies. Run it again after changing the shared source. The generated native copies are ignored by Git to avoid committing duplicated model binaries.

In Android Studio, select **Java 21** as the Gradle JDK, allow Gradle/SDK dependencies to finish downloading, connect an Android device or start an emulator, and use Run. A portable Java 21 compiler is available in this workspace under `.tools/jdk-21.0.12.1+1/Contents/Home`; it is ignored by Git and did not change the system Java. The generated project targets Android SDK 36 and declares microphone permission. In Xcode, choose your development team/signing, choose an iPhone or simulator, then Run. Full Xcode is required; command-line tools alone are insufficient.

The app ID is `com.dirtdj.app`, configured in `capacitor.config.ts`. Change it before store distribution if you need your own namespace, and keep the native application/bundle IDs consistent.

## What the native plugins do

- **Capacitor Core:** Detects whether the app is running natively and provides the plugin bridge.
- **Filesystem:** Writes exported WAV audio to an app cache file.
- **Share:** Opens the operating system's share sheet so users can save or share that WAV.
- **Local Notifications:** Schedules optional offline search cues on the device; no push server is involved.

Recording still uses MediaRecorder/Web Audio in the WebView. Android's manifest contains `RECORD_AUDIO`; iPhone's Info.plist explains why the microphone is requested. The model runs in a JavaScript worker using WASM, not in a native cloud SDK.

The web app downloads/caches the model on that device. The native app **bundles** it. This creates a comparatively large app package; the AI assets alone are about 105 MB, with additional build/runtime overhead. This is a tradeoff for working offline from the installed app.

## Before distributing the mobile app

Check these actual behaviors on the devices you want to support:

1. Launch in airplane mode and run a new audio classification.
2. Grant/deny microphone permission, record, cancel, and verify the mic stops.
3. Import supported phone audio files.
4. Play and export through the native share sheet.
5. Try Hear & explore with an installed English voice; confirm the text fallback if none is available.
6. Test memory/battery on a lower-memory target phone. AST may be too heavy for some devices.
7. Test foreground/background transitions and audio interruptions.
8. Lock the phone during a reminder, verify it arrives, and verify capture/round cancellation clears it.
9. Complete a detective case in airplane mode, reload between clues, and verify that self-confirmed finds stay separate from AI matches and deck assignments remain unchanged.

Store signing, release builds, store listings and distribution are not completed. For App Store distribution, also review the included Filesystem privacy-manifest entry and applicable Apple requirements; this is a development project, not a store-ready submission.

Official framework workflow: https://capacitorjs.com/docs/basics/workflow
