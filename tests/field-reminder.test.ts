import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(), platform: vi.fn(), checkPermissions: vi.fn(), requestPermissions: vi.fn(), createChannel: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), unlock: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native, getPlatform: mocks.platform } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));
vi.mock('../src/audio/engine', () => ({ unlockAudio: mocks.unlock }));
import { cancelFieldReminder, scheduleFieldReminder } from '../src/field-reminder';

describe('optional phone-local search reminders', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.native.mockReturnValue(true); mocks.platform.mockReturnValue('android'); mocks.checkPermissions.mockResolvedValue({ display: 'granted' }); mocks.cancel.mockResolvedValue(undefined); mocks.schedule.mockResolvedValue({ notifications: [{ id: 4201 }] }); });
  it('uses an inexact device-local cue and replaces/cancels the one previous reminder', async () => {
    await scheduleFieldReminder(100000, 'Find a hidden bass');
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.createChannel).toHaveBeenCalledOnce();
    expect(mocks.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({ body: 'Find a hidden bass', isExactNotification: false, schedule: { at: new Date(100000) } })] });
    await cancelFieldReminder(); expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });
  it('keeps gameplay available if notification permission is declined', async () => {
    mocks.checkPermissions.mockResolvedValue({ display: 'prompt' }); mocks.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await scheduleFieldReminder(100000, 'Find a sound')).toContain('Reminders are off');
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it('uses the iOS sound without creating an Android channel and explains the web fallback', async () => {
    mocks.platform.mockReturnValue('ios'); await scheduleFieldReminder(100000, 'Find a sound');
    expect(mocks.createChannel).not.toHaveBeenCalled();
    expect(mocks.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({ sound: 'field-chime.wav' })] });
    mocks.native.mockReturnValue(false);
    expect(await scheduleFieldReminder(100000, 'Find a sound')).toContain('page stays open'); expect(mocks.unlock).toHaveBeenCalledOnce();
  });
});
