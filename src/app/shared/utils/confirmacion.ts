import { AlertController, AlertInput } from '@ionic/angular/standalone';

/**
 * Diálogo de confirmación que se CIERRA antes de hacer el trabajo (2026-09-03).
 *
 * Bug real encontrado probando la app: el diálogo de "Contabilizar factura" se quedaba encima de
 * la pantalla mientras el botón de abajo ya decía "Contabilizando…". No era un problema de
 * z-index ni de animación — es que Ionic ESPERA al handler del botón antes de cerrar:
 *
 *     await this.callButtonHandler(t) ? this.dismiss(...) : Promise.resolve()
 *     (node_modules/@ionic/core, buttonClick)
 *
 * Así que un `handler: async () => { ...guardar, contabilizar, toast... }` mantiene el diálogo
 * en pantalla todos los segundos que dure la llamada al backend. Con acciones fiscales, que
 * hablan con FacturaE y la AEAT, eso son varios segundos con el usuario mirando un diálogo que
 * parece colgado y sin saber si su clic ha servido de algo.
 *
 * La solución es no hacer NADA dentro del handler: los botones solo llevan un rol, se espera a
 * que el diálogo se cierre de verdad, y el trabajo se hace después. Se encapsula aquí para que
 * la próxima confirmación que se añada no vuelva a caer en lo mismo.
 */

const ROL_CONFIRMAR = 'confirmar';

export interface OpcionesConfirmacion {
  header: string;
  message?: string;
  textoConfirmar: string;
  textoCancelar: string;
  /** 'destructive' pinta el botón en rojo (eliminar, anular). */
  rolConfirmar?: 'destructive';
  /** Para elegir entre opciones (medio de cobro, motivo de rectificación...). */
  inputs?: AlertInput[];
}

export interface ResultadoConfirmacion<T = string> {
  confirmado: boolean;
  /** Lo elegido en `inputs`, si los había. */
  valor?: T;
}

export async function pedirConfirmacion<T = string>(
  alertCtrl: AlertController,
  opciones: OpcionesConfirmacion,
): Promise<ResultadoConfirmacion<T>> {
  const alert = await alertCtrl.create({
    header: opciones.header,
    message: opciones.message,
    inputs: opciones.inputs,
    buttons: [
      // 'cancel' es también el rol que Ionic asigna al cerrar tocando fuera o con Escape: ante
      // la duda, no se hace nada.
      { text: opciones.textoCancelar, role: 'cancel' },
      // Sin handler A PROPÓSITO — ver el comentario de cabecera.
      { text: opciones.textoConfirmar, role: opciones.rolConfirmar ?? ROL_CONFIRMAR },
    ],
  });
  await alert.present();

  const { role, data } = await alert.onDidDismiss();
  const confirmado = role === ROL_CONFIRMAR || role === 'destructive';

  return { confirmado, valor: confirmado ? (data?.values as T) : undefined };
}
