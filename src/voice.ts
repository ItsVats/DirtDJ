// Never choose a remote speech service: installed voices are optional, offline aids.
let generation = 0;
export function stopMissionVoice() {
  generation++;
  if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch { /* Speech support is optional. */ } }
}
export async function readMission(text: string): Promise<boolean> {
  stopMissionVoice();
  const request = generation;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', finish); resolve(); };
      const timer = setTimeout(finish, 700);
      synth.addEventListener('voiceschanged', finish);
    });
    voices = synth.getVoices();
  }
  if (generation !== request) return false;
  const voice = voices.find(item => item.localService && /^en(?:-|_|$)/i.test(item.lang));
  if (!voice) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 0.9;
  try { synth.speak(utterance); return true; } catch { return false; }
}
