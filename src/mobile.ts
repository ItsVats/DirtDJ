import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const nativeApp = () => Capacitor.isNativePlatform();
export const androidApp = () => Capacitor.getPlatform() === 'android';
const AudioAccess = registerPlugin<{
  checkPermissions(): Promise<{ microphone: string }>;
  requestPermissions(): Promise<{ microphone: string }>;
  openSettings(): Promise<void>;
}>('AudioAccess');

export async function requestMicrophoneAccess() {
  if (!androidApp()) return;
  const current = await AudioAccess.checkPermissions();
  const result = current.microphone === 'granted' || current.microphone === 'denied'
    ? current : await AudioAccess.requestPermissions();
  if (result.microphone !== 'granted') throw new DOMException('Microphone permission is required.', 'NotAllowedError');
}
export const openAudioSettings = () => AudioAccess.openSettings();
export async function downloadOrShare(blob: Blob, filename: string, title = 'My Dirt DJ beat') {
  if (nativeApp()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const file = await Filesystem.writeFile({ path: filename, data: btoa(binary), directory: Directory.Cache });
    await Share.share({ title, files: [file.uri], dialogTitle: title });
  } else {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
