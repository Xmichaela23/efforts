import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.efforts.app',
  appName: 'Efforts',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#000000',
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for heart rate monitors...',
        cancel: 'Cancel',
        availableDevices: 'Available Devices',
        noDeviceFound: 'No heart rate monitors found',
      },
    },
  },
};

export default config;
