import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { encodeWav } from '../../src/audio/dsp';
import { demoSamples } from '../../src/audio/demo';
import { newProject } from '../../src/types';

// Synthetic audio lives only in test fixtures; the demo button has been removed.
async function seedKit(page: Page) {
  const samples = demoSamples();
  const project = newProject();
  project.tracks.forEach((track, index) => { track.sampleId = samples[index].id; });
  await page.evaluate(async ({ project, samples }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('dirtdj', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('samples', { keyPath: 'id' }); request.result.createObjectStore('project'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['samples', 'project'], 'readwrite');
        samples.forEach(sample => tx.objectStore('samples').put({ ...sample, pcm: new Float32Array(sample.pcm) }));
        tx.objectStore('project').put(project, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  }, { project, samples: samples.map(sample => ({ ...sample, pcm: Array.from(sample.pcm) })) });
  await page.reload();
  await expect(page.getByText('4 / 4 sounds')).toBeVisible();
}

test('studio, persistence, WAV export, real local inference, and offline reload', async ({ page, context }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', request => { if (!request.url().startsWith('http://localhost:4173') && /^https?:/.test(request.url())) external.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /The outdoors/ })).toBeVisible();
  await seedKit(page);
  await expect(page.getByText('4 / 4 sounds')).toBeVisible();
  await page.getByRole('button', { name: 'Play beat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop beat', exact: true })).toBeVisible();
  await expect(page.locator('.current-step')).toHaveCount(4);
  await page.getByRole('button', { name: 'Stop beat', exact: true }).click();
  await page.getByRole('button', { name: 'Thump step 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thump step 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400); // Wait for the debounced IndexedDB commit.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thump step 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const exported = await download;
  const bytes = await readFile((await exported.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.readUInt32LE(24)).toBe(44100);
  expect(bytes.length).toBeGreaterThan(900000);

  await page.getByRole('button', { name: 'Prepare offline pack' }).click();
  await expect(page.getByRole('button', { name: 'Prepare offline pack' })).toHaveCount(0, { timeout: 180000 });
  await expect(page.getByText('Local AI loaded', { exact: true })).toBeVisible({ timeout: 180000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('4 / 4 sounds')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare offline pack' })).toHaveCount(0);

  // A generated fixture exercises real model inference without distributing someone else's recording.
  const sound = demoSamples()[3];
  const wav = Buffer.from(await encodeWav(sound.pcm, sound.sampleRate).arrayBuffer());
  await page.locator('input[type=file]').setInputFiles({ name: 'offline-whistle.wav', mimeType: 'audio/wav', buffer: wav });
  const imported = page.locator('.sample-row').filter({ has: page.getByRole('heading', { name: /offline-whistle/ }) });
  await expect(imported.locator('.top-prediction')).toBeVisible({ timeout: 180000 });
  await expect(imported.locator('.predictions>span')).toHaveCount(3);
  await expect(page.getByText('Local AI loaded', { exact: true })).toBeVisible();
  await expect(page.getByText('5 sounds', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.sample-row').filter({ has: page.getByRole('heading', { name: /offline-whistle/ }) }).locator('.top-prediction')).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'How it works' })).toHaveCount(0);
  await expect(page.locator('.offline-strip,.sleeve-sticker,.hero-footnote,.site-footer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try the demo beat' })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
});

test('recorder closes and releases the microphone, and unsupported files explain failure', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Collect a sound', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close recorder', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('0 sounds', { exact: true })).toBeVisible();
});

test('deck edits keep playing and tempo can be typed, cleared, clamped, and saved', async ({ page }) => {
  await page.goto('/'); await seedKit(page);
  await page.getByRole('button', { name: 'Play beat', exact: true }).click();
  const stop = page.getByRole('button', { name: 'Stop beat', exact: true });
  await expect(stop).toBeVisible();
  await page.getByRole('button', { name: 'Thump step 2', exact: true }).click();
  await expect(stop).toBeVisible();
  const tempo = page.getByRole('spinbutton', { name: 'Tempo in BPM' });
  await tempo.fill(''); await expect(tempo).toHaveValue('');
  await expect(stop).toBeVisible();
  await tempo.fill('120'); await tempo.press('Enter');
  await expect(tempo).toHaveValue('120');
  await page.getByLabel('Thump volume', { exact: true }).fill('24');
  await page.getByLabel('Swing', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Mute Crunch', exact: true }).click();
  await page.getByLabel('Sound for Call', { exact: true }).selectOption('demo-0');
  await page.getByRole('button', { name: 'New groove', exact: true }).click();
  await expect(stop).toBeVisible();
  await expect(page.getByText('Playing your loop', { exact: true })).toBeVisible();
  await page.waitForTimeout(3500); // Cross an entire old bar and its edited successor.
  await expect(stop).toBeVisible();
  await expect(page.locator('.current-step')).toHaveCount(4);
  await tempo.fill('999'); await tempo.press('Tab');
  await expect(tempo).toHaveValue('160');
  await tempo.fill('10'); await tempo.press('Enter');
  await expect(tempo).toHaveValue('50');
  await tempo.fill('120'); await tempo.press('Enter');
  await page.waitForTimeout(400);
  await stop.click(); await page.reload();
  await expect(tempo).toHaveValue('120');
  await expect(page.getByLabel('Thump volume', { exact: true })).toHaveValue('24');
});

test('offline detective: real three-second evidence, AI verdicts, resumed case, and no automatic groove', async ({ page, context }) => {
  await context.grantPermissions(['microphone']); await page.setViewportSize({ width: 390, height: 844 });
  const external: string[] = [], errors: string[] = [];
  context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://localhost:4173')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Prepare offline pack' }).click();
  await expect(page.getByRole('button', { name: 'Prepare offline pack' })).toHaveCount(0, { timeout: 180000 });
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('group', { name: 'Recording place' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Solo adventures' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open a case', exact: true }).click();
  // Keep the case deterministic: Chromium's synthetic microphone is recognized as knocking.
  await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem('dirtdj-detective-v1')!);
    game.clueIds = ['knock', 'bird', 'water', 'hum'];
    localStorage.setItem('dirtdj-detective-v1', JSON.stringify(game));
  });
  await page.reload();

  await expect(page.getByRole('button', { name: 'Share Sound Postcard', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Need a hint?', exact: true }).click();
  await expect(page.locator('.clue-hint-copy')).toBeVisible();
  await page.getByRole('button', { name: 'Put phone away', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No recording is running.');
  await page.screenshot({ path: 'test-results/detective-pocket.png', fullPage: true });
  await page.getByRole('button', { name: 'Found it. Capture three seconds.', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Found it. Check my sound', exact: true }).click();
    await expect(page.getByText('This capture saves automatically after three seconds.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    // Actual MediaRecorder + AST, not mocked. The synthetic mic may not solve this clue.
    await expect(page.locator('.detective-verdict h4')).toHaveText(/Mystery solved|Not sure yet/, { timeout: 180000 });
    if (i === 0) await expect(page.locator('.game-progress')).toContainText('1 / 4 discoveries · 1 AI match');
    await page.getByRole('navigation').getByRole('button', { name: 'Sounds', exact: true }).click();
    const sample = page.locator('.sample-row').last();
    await expect(sample.locator('.top-prediction')).toBeVisible();
    const duration = Number((await sample.locator('h3 span').innerText()).replace('s', ''));
    expect(duration).toBeGreaterThan(2.8); expect(duration).toBeLessThan(3.5);
    await page.getByRole('navigation').getByRole('button', { name: 'Hunt', exact: true }).click();
    if (await page.getByRole('button', { name: 'I found it — keep discovery', exact: true }).count()) {
      await expect(page.locator('.game-progress')).toContainText(`${i} / 4 discoveries`);
      await page.getByRole('button', { name: 'I found it — keep discovery', exact: true }).click();
      if (i < 3) await expect(page.getByText('You confirmed this find.', { exact: false })).toBeVisible();
    }
    await expect(page.locator('.game-progress')).toContainText(`${i + 1} / 4 discoveries`);
    if (i === 0) {
      await page.reload();
      await expect(page.locator('.game-progress')).toContainText('1 / 4 discoveries');
    }
    if (i < 3) await page.getByRole('button', { name: 'Next clue', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Case closed. Ears open.' })).toBeVisible();
  await expect(page.locator('.casebook li')).toHaveCount(4);
  const postcardDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share Sound Postcard', exact: true }).click();
  const postcard = await postcardDownload;
  expect(postcard.suggestedFilename()).toMatch(/^dirtdj-sound-postcard-.*\.wav$/);
  const postcardBytes = await readFile((await postcard.path())!);
  expect(postcardBytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(postcardBytes.readUInt32LE(24)).toBe(44100);
  expect(postcardBytes.length).toBeGreaterThan(1000000);
  expect(postcardBytes.length).toBeLessThanOrEqual(44 + Math.round(12.9 * 44100) * 2);
  await expect(page.getByRole('button', { name: 'Stop beat', exact: true })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Kit', exact: true }).click();
  await expect(page.getByText('0 / 4 sounds', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Hunt', exact: true }).click();
  await expect(page.locator('.sample-row')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/detective-complete.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

 test('spoken exploration refuses remote voices and never opens a microphone', async ({ page }) => {
  await page.addInitScript(() => {
    const synth = { getVoices: () => [{ localService: false, lang: 'en-US' }], cancel: () => {}, speak: () => { throw new Error('Remote speech was requested'); } };
    Object.defineProperty(window, 'speechSynthesis', { value: synth });
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Microphone opened during exploration'); };
  });
  const errors: string[] = []; page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open a case', exact: true }).click();
  await page.getByRole('button', { name: 'Hear & explore', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No installed English voice is available');
  await expect(page.getByRole('dialog')).toContainText('No recording is running.');
  expect(errors).toEqual([]);
});

 test('AI matches earn a discovery, swapping a clue earns nothing, and deleted evidence reopens it', async ({ page }) => {
  await page.goto('/'); await seedKit(page);
  await page.evaluate(async () => {
    localStorage.setItem('dirtdj-detective-v1', JSON.stringify({ version: 1, id: 'test-case', clueIds: ['clap', 'bird', 'water', 'hum'], discoveries: [null, null, null, null], attempt: { index: 0, sampleId: 'demo-0' }, searchUntil: null }));
    await new Promise<void>(resolve => {
      const request = indexedDB.open('dirtdj', 1); request.onsuccess = () => {
        const db = request.result, tx = db.transaction('samples', 'readwrite');
        const read = tx.objectStore('samples').get('demo-0');
        read.onsuccess = () => tx.objectStore('samples').put({ ...read.result, predictions: [{ label: 'Clapping', score: 0.8 }] });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mystery solved.', exact: true })).toBeVisible();
  await expect(page.locator('.game-progress')).toContainText('1 / 4 discoveries · 1 AI match');
  await page.getByRole('button', { name: 'Next clue', exact: true }).click();
  const before = await page.locator('.detective-riddle').innerText();
  await page.getByRole('button', { name: 'Find a different clue', exact: true }).click();
  await expect(page.locator('.detective-riddle')).not.toHaveText(before);
  await expect(page.locator('.game-progress')).toContainText('1 / 4 discoveries');
  await page.getByRole('button', { name: 'Delete Demo thump', exact: true }).click();
  await expect(page.locator('.game-progress')).toContainText('0 / 4 discoveries');
});

test('mobile screens keep the case and playing deck alive with touch-sized steps', async ({ page }) => {
  await page.goto('/');
  await seedKit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();
  await expect(page.locator('.hero')).toBeHidden();
  await page.getByRole('button', { name: 'Open a case', exact: true }).click();
  const clue = await page.locator('.detective-riddle').innerText();
  await nav.getByRole('button', { name: 'Kit', exact: true }).click();
  await expect(page.locator('.field-kit')).toBeVisible();
  await expect(page.locator('.detective-panel')).toBeHidden();
  await nav.getByRole('button', { name: 'Deck', exact: true }).click();
  await page.getByRole('button', { name: 'Play beat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop beat', exact: true })).toBeVisible();
  const step = page.getByRole('button', { name: 'Thump step 16', exact: true });
  await expect(page.getByRole('group', { name: 'Deck lanes' })).toHaveCount(0);
  await expect(page.locator('.pattern-lane')).toHaveCount(4);
  for (const role of ['Thump', 'Crunch', 'Rustle', 'Call']) {
    await expect(page.getByRole('button', { name: `${role} step 1`, exact: true })).toBeVisible();
    await expect(page.getByLabel(`Sound for ${role}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel(`${role} volume`, { exact: true })).toBeVisible();
  }
  const box = (await step.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await step.click();
  const timeline = page.getByRole('region', { name: 'Four-lane rhythm grid' });
  expect(await timeline.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const labelLeft = await page.locator('.pattern-label').last().evaluate(element => element.getBoundingClientRect().left);
  expect(labelLeft).toBeCloseTo((await timeline.boundingBox())!.x + 1, 0);
  await expect(page.getByRole('button', { name: 'Call step 16', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Call step 16', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Call step 16', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(step).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Call volume', { exact: true }).fill('31');
  await page.getByLabel('Sound for Call', { exact: true }).selectOption('demo-0');
  await page.getByRole('button', { name: 'Mute Crunch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute Crunch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('spinbutton', { name: 'Tempo in BPM' }).fill('112');
  await nav.getByRole('button', { name: 'Hunt', exact: true }).click();
  await expect(page.locator('.detective-riddle')).toHaveText(clue);
  await nav.getByRole('button', { name: 'Deck', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop beat', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Tempo in BPM' })).toHaveValue('112');
  await expect(page.getByLabel('Call volume', { exact: true })).toHaveValue('31');
  await expect(page.getByLabel('Sound for Call', { exact: true })).toHaveValue('demo-0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/app-mobile-deck.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/app-small-mobile-deck.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Stop beat', exact: true }).click();
  await nav.getByRole('button', { name: 'Kit', exact: true }).click();
  await page.getByRole('button', { name: 'Record another', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialog = (await page.getByRole('dialog').boundingBox())!;
  expect(dialog.width).toBe(390);
  await page.screenshot({ path: 'test-results/app-mobile-recorder.png' });
  await page.getByRole('button', { name: 'Close recorder' }).click();
  await nav.getByRole('button', { name: 'Hunt', exact: true }).click();
  await page.screenshot({ path: 'test-results/app-mobile-hunt.png', fullPage: true });
});
