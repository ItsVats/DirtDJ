import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const nativeApp = () => Capacitor.isNativePlatform();
export async function downloadOrShare(blob: Blob, filename: string) {
  if (nativeApp()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const file = await Filesystem.writeFile({ path: filename, data: btoa(binary), directory: Directory.Cache });
    await Share.share({ title: 'My Dirt DJ beat', files: [file.uri], dialogTitle: 'Save or share your beat' });
  } else {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
