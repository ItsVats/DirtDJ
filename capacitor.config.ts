import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dirtdj.app',
  appName: 'Dirt DJ',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { LocalNotifications: { smallIcon: 'ic_field_notification', iconColor: '#e85f36', presentationOptions: ['sound', 'banner', 'list'] } },
};
export default config;
