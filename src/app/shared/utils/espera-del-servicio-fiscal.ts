import { LoadingController } from '@ionic/angular/standalone';

/**
 * Textos ya traducidos de la espera. El primero cambia según la operación (contabilizar,
 * firmar); los otros dos son los mismos para todas.
 */
export interface TextosDeEspera {
  inicial: string;
  lento: string;
  casiListo: string;
}

/**
 * A partir de cuándo se cambia el texto. Exportado para que los tests puedan adelantar el reloj
 * sin repetir los números.
 */
export const PLAZOS_DE_ESPERA = { lento: 8_000, casiListo: 40_000, maximo: 180_000 };

/**
 * Los textos de la espera, con el inicial de la operación ("Contabilizando…", "Firmando…") y los
 * otros dos comunes. Recibe la función de traducir para no atar esta utilidad a Transloco.
 */
export function textosDeEspera(traducir: (clave: string) => string, claveInicial: string): TextosDeEspera {
  return {
    inicial: traducir(claveInicial),
    lento: traducir('invoices.issued.fiscalServiceWait.slow'),
    casiListo: traducir('invoices.issued.fiscalServiceWait.almost'),
  };
}

/**
 * Ejecuta una operación que pasa por FacturaE con una pantalla de espera que va explicando lo que
 * pasa (2026-09-21).
 *
 * POR QUÉ. La base de FacturaE se duerme por la pausa automática, y la primera operación del día
 * tiene que esperar a que arranque todo: del orden de un minuto. Con solo el botón en
 * "Contabilizando…" durante un minuto, la gente cierra la app o se pone a tocar cosas pensando
 * que se ha colgado. Esta pantalla bloquea los toques y, si tarda, dice por qué.
 *
 * Casi nunca debería llegar al segundo texto: al entrar en Emitidas la app ya despierta FacturaE
 * (ver despertarServicioFiscal). Esto es para quien contabiliza nada más abrir la app.
 *
 * Si la pantalla no se puede abrir, la operación se ejecuta igual, sin ella: un adorno no puede
 * impedir contabilizar (ya pasó en Recibidas, 2026-09-14, que un aviso que no se abría dejaba los
 * botones bloqueados).
 *
 * Y a los 3 minutos se quita sola, aunque la operación siga en marcha. La app no pone límite de
 * espera a las peticiones (Android no tiene ninguno; iOS, 10 minutos), así que si se pierde la
 * cobertura a mitad, esta pantalla —que bloquea todo— dejaría al usuario atrapado sin más salida
 * que matar la app. Con el servidor sano nunca se llega: la API espera a FacturaE 150 s como mucho.
 * No hay riesgo de repetir la operación: quien llama mantiene su botón desactivado hasta que acabe.
 */
export async function conEsperaDelServicioFiscal<T>(
  loadingCtrl: LoadingController,
  textos: TextosDeEspera,
  operacion: () => Promise<T>,
): Promise<T> {
  let aviso: HTMLIonLoadingElement | undefined;
  try {
    aviso = await loadingCtrl.create({ message: textos.inicial, spinner: 'crescent', cssClass: 'cargando-documento' });
    await aviso.present();
  } catch {
    aviso = undefined;
  }

  const temporizadores = aviso
    ? [
        setTimeout(() => { aviso!.message = textos.lento; }, PLAZOS_DE_ESPERA.lento),
        setTimeout(() => { aviso!.message = textos.casiListo; }, PLAZOS_DE_ESPERA.casiListo),
        setTimeout(() => { void aviso!.dismiss().catch(() => undefined); }, PLAZOS_DE_ESPERA.maximo),
      ]
    : [];

  try {
    return await operacion();
  } finally {
    temporizadores.forEach(clearTimeout);
    await aviso?.dismiss().catch(() => undefined);
  }
}
