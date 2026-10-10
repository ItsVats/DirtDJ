# Host Dirt DJ yourself

No hosting account or deployment has been created for this project. These are the steps for you to follow.

## What you need

- **GitHub:** the source is in `ItsVats/DirtDJ`, branch `main`.
- **One HTTPS static-site host:** DigitalOcean App Platform is a straightforward choice, especially if your credits are from DigitalOcean. Confirm the issuer, expiry and eligible services in your credit offer before relying on it.
- **A browser on each device:** Chrome on a laptop/Android, Safari on an iPhone. Install the hosted app as a web app and prepare its offline pack on each device.

Dirt DJ does not need an inference server, GPU, cloud database, authentication service or API key. The hosting service delivers files. The browser runs AST and stores recordings locally.

## DigitalOcean App Platform

Follow [DigitalOcean's creation guide](https://docs.digitalocean.com/products/app-platform/getting-started/quickstart/) and [static-site settings](https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/).

1. Sign in to DigitalOcean. If your credits are for DigitalOcean, redeem them and check they appear in Billing.
2. Open **Apps → Create App**. Select **GitHub** and authorize access to this repository.
3. Select `ItsVats/DirtDJ`, branch `main`, source directory `/`.
4. Edit the detected component. Choose **Static Site**; this project does not need a web-service container.
5. Set **Build Command** to `npm run setup && npm run build`.
6. Set **Output Directory** to `dist` and route to `/`. Do not publish the repository or `public` directly.
7. No environment variables or secrets are required. The Node buildpack installs dependencies from `package-lock.json`; keep development dependencies enabled for the build.
8. Review the resource/billing summary and create the app yourself. Wait for successful deployment, then open its HTTPS live URL.
9. Optionally connect a domain later. The generated HTTPS hostname is sufficient for the first demo.

The buildpack currently defaults to Node 22.x and supports Node 24.x. This app needs Node 22.12+ or Node 24. If you pin a runtime later, add `"engines": { "node": "24.x" }` to `package.json`, update the lockfile and push the change. See [Node buildpack documentation](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/nodejs/).

**Why the setup command matters:** model and WASM binaries are excluded from Git. `npm run setup` downloads the pinned model, checks its SHA-256, copies the installed WASM runtime and creates the offline manifest. `npm run build` packages these into `dist`. A build using only `npm run build` on a fresh host will fail because the AI files are missing. Build-time downloading does not add a runtime cloud inference dependency.

App Platform currently includes three static-only apps and 1 GiB outbound transfer per app on its free tier. Extra transfer is $0.02/GiB. The offline pack is about 105 MB before HTTP compression, so model downloads can use that allowance quickly. Credit terms are specific to your offer. See [current pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/).

## Before sharing the link

- Open the HTTPS app, choose **Prepare offline**, and wait for **Offline pack ready**.
- Complete a new detective recording and wait for AI labels. An uncertain verdict still demonstrates classification; manual confirmation alone does not prove the model worked.
- The host must serve the roughly 91 MB `.onnx` file and `.wasm` with `application/wasm`, rather than an HTML fallback. A successful build does not by itself prove every asset is served correctly.
- Missing assets, 404s, HTML returned as model data, or WASM MIME errors must be fixed before the offline test.
- Updates activate after all existing Dirt DJ windows/tabs close and the app is reopened. This avoids mixing two builds during an active session.

## Install and use offline

**Laptop (Chrome):** open the HTTPS URL and use the address-bar install icon, or **Menu → Cast, save, and share → Install page as app**. See [Chrome's installation guide](https://support.google.com/chrome/answer/9658361).

**Android (Chrome):** open the HTTPS URL and use **Menu → Add to home screen → Install**, or the available install prompt. The wording depends on browser/device. See [Chrome's Android guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid).

**iPhone (Safari):** open the URL, choose **Share → Add to Home Screen**, enable **Open as Web App** if shown, then **Add**. See [Apple's installation guide](https://support.apple.com/guide/iphone/iphea86e5236/ios).

On **each installed web app**, while connected:

1. Launch from the new icon. Do the offline setup inside this installed app; do not assume another browser's cache transfers to it.
2. Tap **Prepare offline**. Keep it open until setup finishes. This saves the app, model and WASM locally on that device.
3. Turn off Wi-Fi and mobile data. On a laptop, disable its network connection.
4. Close and reopen the app from its icon.
5. Open a case, make a new three-second recording and verify that new AI labels appear while disconnected. Also test playback/export if you use the deck.

The first web installation and model download require a connection. Subsequent play does not require your laptop, Wi-Fi or the host to be reachable as long as the local files remain stored. Clearing site data/uninstalling can remove recordings and the pack; browsers can also evict storage. Run setup again after such a removal. Test on your actual Android/iPhone hardware; iOS/native device compatibility has not yet been verified. The optional web reminder is a foreground chime, not a locked-screen alarm.

## Native apps instead of the web app

The Android test APK already bundles the model and works without a web offline download. Build/transfer instructions are in [MOBILE.md](MOBILE.md). APKs and native build outputs are excluded from Git; pushing the source does not create an APK download or publish to Play Store. You can upload a built APK to a GitHub Release yourself if you want a public test download.

The iOS project is included, but installing it requires full Xcode and signing. No signed IPA/TestFlight release has been created. Native local reminders support locked-screen search cues subject to phone settings.

## Other hosting choices

Cloudflare Pages cannot deploy this build unchanged: its single-file asset limit is 25 MiB, while our model is about 86.6 MiB, and another emitted WASM file is also slightly above 25 MiB. Pages plus R2 is possible with a same-origin asset proxy and corresponding deployment changes; moving the model to a different origin without changing caching would break the current offline setup. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

Keep model and WASM paths on the same HTTPS origin as the app for this version. If your credits are from another provider, confirm its individual-file limits and use the equivalent settings: dependency install `npm ci`, build `npm run setup && npm run build`, output `dist`, served at the domain root with HTTPS.
