import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMission, stopMissionVoice } from '../src/voice';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup(voices: object[]) {
  const synth = { getVoices: vi.fn(() => voices), cancel: vi.fn(), speak: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: class {} });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text; } });
  return synth;
}
describe('offline mission voice', () => {
  it('explicitly selects an installed English voice, skipping remote voices', async () => {
    const local = { localService: true, lang: 'en-US', name: 'Installed' };
    const synth = setup([{ localService: false, lang: 'en-US' }, local]);
    expect(await readMission('Find a sound')).toBe(true);
    expect(synth.speak.mock.calls[0][0]).toMatchObject({ voice: local, text: 'Find a sound' });
    stopMissionVoice(); expect(synth.cancel).toHaveBeenCalledTimes(2);
  });
  it('never falls back to a remote or wrong-language voice', async () => {
    const synth = setup([{ localService: false, lang: 'en-US' }, { localService: true, lang: 'fr-FR' }]);
    expect(await readMission('Find a sound')).toBe(false); expect(synth.speak).not.toHaveBeenCalled();
  });
  it('offers text fallback when the device refuses synthesis', async () => {
    const synth = setup([{ localService: true, lang: 'en-US' }]);
    synth.speak.mockImplementation(() => { throw new Error('Unavailable'); });
    expect(await readMission('Find a sound')).toBe(false);
  });
  it('cancels pending voice loading before capture can start', async () => {
    vi.useFakeTimers(); const voices: object[] = []; const synth = setup(voices);
    const pending = readMission('Late speech'); stopMissionVoice();
    voices.push({ localService: true, lang: 'en-US' });
    await vi.advanceTimersByTimeAsync(700);
    expect(await pending).toBe(false); expect(synth.speak).not.toHaveBeenCalled();
  });
});
