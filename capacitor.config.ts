import type { CapacitorConfig } from '@capacitor/cli';

/** The iOS app: the built game (dist/) inside a native shell. Online play talks to unicornrush.io. */
const config: CapacitorConfig = {
  appId: 'io.unicornrush.app',
  appName: 'UnicornRush',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b111a',
  },
};

export default config;
