import { HttpError } from '../../services/api.service';
import { mensajeDeError } from './mensaje-de-error';

export type AvisoDeFirma = { mensaje: string; color: 'medium' | 'danger' };

/**
 * Qué decirle al usuario cuando falla la firma de una factura (2026-09-15).
 *
 * EL CASO: la cuenta de demostración no tiene certificado de firma, así que Firmar falla
 * siempre, y un cliente que prueba el flujo veía un error rojo con detalles internos
 * ("El XML del lote (Id=229) no coincide con el registro fiscal..."). Pedido por Abraham: en la
 * demo, un aviso informativo que explique que la firma no está disponible ahí.
 *
 * SOLO SE SUAVIZA UN FALLO DEL SERVICIO DE FIRMA (HTTP 5xx) EN EL ENTORNO DE PRUEBAS. Todo lo
 * demás se sigue enseñando tal cual y en rojo, porque es información que el usuario necesita:
 * - un 4xx es una regla de negocio ("Esta factura está anulada; no se puede firmar"),
 * - un error de red no es de la demo: es que no hay conexión,
 * - fuera del entorno de pruebas, un cliente real tiene que ver el motivo real.
 *
 * El inconveniente, asumido: probando en Development tampoco se ve el motivo real de un 5xx en
 * el aviso. Queda en la consola del navegador.
 */
export async function avisoDeFirmaFallida(
  error: unknown,
  esEntornoDePruebas: () => Promise<boolean>,
  traducir: (clave: string) => string,
): Promise<AvisoDeFirma> {
  const falloDelServicioDeFirma = error instanceof HttpError && error.status >= 500;

  if (falloDelServicioDeFirma && await enPruebas(esEntornoDePruebas)) {
    console.warn('[firma] Fallo real en el entorno de pruebas, mostrado como aviso de demo:', error);
    return { mensaje: traducir('invoices.issued.sign.demoUnavailable'), color: 'medium' };
  }

  return { mensaje: mensajeDeError(error, traducir('invoices.issued.sign.error')), color: 'danger' };
}

// Si no se puede saber el entorno, se da por real: antes un error de más que esconder uno de
// verdad a un cliente.
async function enPruebas(esEntornoDePruebas: () => Promise<boolean>): Promise<boolean> {
  try {
    return await esEntornoDePruebas();
  } catch {
    return false;
  }
}
