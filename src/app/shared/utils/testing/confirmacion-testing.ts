import { AlertController } from '@ionic/angular/standalone';

/**
 * Dobles de los diálogos de confirmación en los tests (2026-09-03).
 *
 * Desde que pedirConfirmacion() no usa handlers (Ionic los ESPERA antes de cerrar el diálogo,
 * lo que dejaba el aviso de "Contabilizar factura" en pantalla durante toda la llamada al
 * backend — ver shared/utils/confirmacion.ts), simular un diálogo es simular su CIERRE, no
 * invocar un handler. Se centraliza aquí para que los specs no tengan que conocer la forma
 * interna del overlay de Ionic, que es justo lo que los hacía frágiles.
 */

/** El usuario pulsa el botón de confirmar. `valor` es lo elegido, si el diálogo tenía opciones. */
export function simularConfirmacion(alertCtrl: AlertController, valor?: unknown) {
  spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
    const boton = opts.buttons.find((b: any) => b.role !== 'cancel');
    return {
      present: async () => {},
      onDidDismiss: async () => ({ role: boton.role, data: valor === undefined ? undefined : { values: valor } }),
    } as any;
  });
}

/** El usuario cancela (o cierra tocando fuera / con Escape, que Ionic manda como 'cancel'). */
export function simularCancelacion(alertCtrl: AlertController) {
  spyOn(alertCtrl, 'create').and.resolveTo({
    present: async () => {},
    onDidDismiss: async () => ({ role: 'cancel' }),
  } as any);
}

/**
 * Confirma pero deja el cierre del diálogo pendiente hasta que se llame a `cerrar()`. Sirve para
 * comprobar el estado JUSTO MIENTRAS la acción está en vuelo (spinners, banderas de
 * exclusión mutua entre botones).
 */
export function simularConfirmacionDiferida(alertCtrl: AlertController): { cerrar: () => void } {
  let resolver!: (v: any) => void;
  const cierre = new Promise<any>(r => { resolver = r; });
  spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
    const boton = opts.buttons.find((b: any) => b.role !== 'cancel');
    return {
      present: async () => {},
      onDidDismiss: async () => { await cierre; return { role: boton.role }; },
    } as any;
  });
  return { cerrar: () => resolver(undefined) };
}
