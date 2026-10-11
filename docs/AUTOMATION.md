# Offline AI and Android automation

The [GitHub Actions workflow](../.github/workflows/ci.yml) runs for pushes and pull requests to `main`. You can also run it manually from the repository's **Actions → Offline AI and Android → Run workflow** page.

It downloads the pinned open model during the build, verifies its SHA-256, runs unit tests, and builds the production web files. Playwright then loads the real AST checkpoint, disconnects the browser, reloads, and exercises new audio classification and a completed detective hunt with Sound Postcard export. It also checks that the app makes no external HTTP requests. This is real inference with synthetic test audio, not a mocked AI response or a physical outdoor field test.

The same job installs Java 21 and Android SDK 36, synchronizes **only Android**, builds a debug APK, checks its signature, and verifies that the correct model and WASM are inside it. A successful workflow is evidence of a build, not proof of compatibility with every physical phone.

## Artifacts and signing

Open a successful run to download **browser-evidence** (test screenshots) and **DirtDJ-Android-CI-test** (a ZIP containing `app-debug.apk`). Artifacts are retained for seven days. They are separate from a public APK release or a Play Store listing.

GitHub runners generate a temporary debug signing key. The CI APK can be tested on a device without an existing Dirt DJ installation. It usually **cannot update an installation signed with the developer's local key**, and its signing identity is not stable between fresh runners. Use the locally rebuilt APK to update the existing phone installation and preserve its recordings. Uninstalling the old app clears local data.

A stable public update channel needs a persistent release signing key and a separate distribution setup. This workflow does not upload a private key or publish releases.

## Sound Postcard implementation

`src/audio/postcard.ts` loads the four saved discoveries in clue order, takes up to three seconds from each, resamples to 44.1 kHz, gently normalizes and fades the edges, and adds 0.3-second gaps. It returns a mono 16-bit WAV. Source recordings are preserved. On Android, Capacitor Filesystem writes the WAV to an app cache file and Share opens the system chooser; the web downloads it.

Making the file and opening the chooser are local operations. A destination such as email or a chat app may need internet to actually send it. No recordings are uploaded automatically.

The unit tests check ordering, mixed sample rates, valid WAV data, source preservation, length limits, and missing/corrupt evidence. The browser test finishes a hunt with actual model verdicts and verifies the exported file while disconnected.
