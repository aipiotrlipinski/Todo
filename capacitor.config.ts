import type { CapacitorConfig } from '@capacitor/cli';

// Android app (APK) wraps the same build as the web version (dist/index.html).
const config: CapacitorConfig = {
  appId: 'pl.lipinski.plan',
  appName: 'Plan',
  webDir: 'dist',
  android: {
    backgroundColor: '#0f1115',
  },
};

export default config;
