import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { audioContext, unlockAudio } from './audio/engine';

const id = 4201;
export async function scheduleFieldReminder(at: number, prompt: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    await unlockAudio();
    return 'The web reminder works while this page stays open. The installed phone app can remind you with the screen locked.';
  }
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return 'Reminders are off. Put the phone away and return whenever you find your sound.';
  if (Capacitor.getPlatform() === 'android') await LocalNotifications.createChannel({ id: 'field-search', name: 'Sound hunt reminders', description: 'Optional offline cues during a sound hunt', importance: 4, vibration: true, sound: 'field_chime.wav' });
  await LocalNotifications.cancel({ notifications: [{ id }] });
  await LocalNotifications.schedule({ notifications: [{ id, title: 'Your next sound is waiting', body: prompt, sound: 'field-chime.wav', channelId: 'field-search', schedule: { at: new Date(at) }, isExactNotification: false }] });
  return 'A local reminder is set. Lock your phone and explore; the cue may arrive a little later depending on phone settings.';
}
export async function cancelFieldReminder() {
  if (Capacitor.isNativePlatform()) await LocalNotifications.cancel({ notifications: [{ id }] });
}
export function foregroundFieldCue() {
  if (Capacitor.isNativePlatform() || document.hidden) return;
  const ctx = audioContext();
  if (ctx.state !== 'running') return;
  const oscillator = ctx.createOscillator(), gain = ctx.createGain();
  oscillator.frequency.value = 660; gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.4);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
