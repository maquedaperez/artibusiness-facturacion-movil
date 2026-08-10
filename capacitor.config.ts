import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.artisoftware.artibusinessfacturacion',
  appName: 'ARTIBusiness Facturación',
  webDir: 'www',
  ios: {
    webContentsDebuggingEnabled: true,
    scrollEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: 'ionic',
      resizeOnFullScreen: true,
      scrollAssist: true,
    }
  }
};
export default config;