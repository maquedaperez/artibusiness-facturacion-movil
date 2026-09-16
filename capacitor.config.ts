import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.artisoftware.artibusinessfacturacion',
  appName: 'ARTIBusiness Facturación',
  webDir: 'www',
  ios: {
    // En false desde el 2026-09-16, antes de publicar en la App Store: en true, cualquiera con
    // el telefono y un Mac puede abrir el inspector de Safari sobre la app instalada y ver por
    // dentro TODO, incluido el token de sesion guardado. Para depurar se vuelve a poner a mano.
    webContentsDebuggingEnabled: false,
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