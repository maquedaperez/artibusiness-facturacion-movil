/**
 * Qué mensaje de error se le enseña a una persona (2026-09-09).
 *
 * EL PROBLEMA. Una veintena de pantallas hacían `showToast(e?.message ?? 'traducción')`. La
 * intención era buena: cuando el backend explica algo útil ("Ya existe una factura con ese
 * número para este proveedor"), enseñarlo es mucho mejor que un genérico. Pero `e.message` no
 * siempre es una frase: cuando el backend devuelve un error con una forma que ApiService no
 * sabe interpretar, ahí dentro viene el cuerpo HTTP en bruto. Visto en un iPhone el
 * 2026-09-09, un toast rojo ocupando media pantalla con esto:
 *
 *     HTTP 502 {"error":"FacturaE no pudo procesar la factura.","detalle":"FacturaE respondió
 *     409 Conflict: {\"error\":\"Ya existe un registro (Id=246818) para la factura...
 *
 * LA REGLA. El mensaje del backend se enseña SOLO si parece escrito para una persona. Si no,
 * se usa la traducción de la pantalla, que siempre está escrita para leerse. Nunca se pierde
 * el original: sigue dentro del Error, disponible para el log y para las comprobaciones por
 * código que hacen las pantallas (`e.message.includes('OPERATION_IN_PROGRESS')`) mucho antes
 * de llegar aquí.
 */

// Más largo que esto no se lee en un toast: es un volcado, no un aviso.
const LARGO_MAXIMO = 200;

// "HTTP 500 - ", que antepone ApiService. Se usa para JUZGAR el mensaje, no para recortarlo:
// el código de estado le sirve a quien da soporte cuando el usuario le lee el aviso en alto.
const PREFIJO_HTTP = /^HTTP\s*\d{3}\s*-?\s*/i;

// Código de error entre corchetes al final ("... [OPERATION_IN_PROGRESS]"). Lo añade
// ApiService a propósito para que las pantallas puedan reconocer errores conocidos, pero al
// usuario no le dice nada, así que se recorta solo al mostrarlo.
const CODIGO_AL_FINAL = /\s*\[[A-Z][A-Z0-9_]{2,}\]\s*$/;

export function esMensajePresentable(mensaje: string | null | undefined): boolean {
  const texto = (mensaje ?? '').trim();
  if (!texto) return false;
  if (texto.length > LARGO_MAXIMO) return false;

  // Se juzga por lo que viene DESPUÉS del "HTTP 500 - ". Ese prefijo no impide que lo de
  // detrás sea una frase perfectamente legible ("Error interno del servidor."), que además
  // conviene enseñar: distinguir un fallo del servidor de un "no encontrado" importa. Lo que
  // no vale es que detrás venga un volcado.
  const cuerpo = texto.replace(PREFIJO_HTTP, '').trim();
  if (!cuerpo) return false;
  // Llaves o comillas escapadas = cuerpo JSON, anidado o no.
  if (/[{}]/.test(cuerpo) || cuerpo.includes('\\"')) return false;
  // Un stack trace o una excepción de .NET que se haya colado.
  if (/\bat\s+\w+\.\w+|Exception:|System\./.test(cuerpo)) return false;
  return true;
}

/**
 * El mensaje del error si se puede leer; si no, el de respaldo de la pantalla.
 *
 * `respaldo` es obligatorio y siempre debe venir traducido: es lo que se enseña en el caso
 * malo, que es justo cuando peor viene un texto en inglés o en jerga.
 */
export function mensajeDeError(error: unknown, respaldo: string): string {
  const bruto = (error as { message?: string } | undefined)?.message;
  if (!esMensajePresentable(bruto)) return respaldo;
  return (bruto as string).replace(CODIGO_AL_FINAL, '').trim() || respaldo;
}
