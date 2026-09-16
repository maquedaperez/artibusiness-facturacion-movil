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

// "HTTP 500 - ", que antepone ApiService. Se usa para juzgar el mensaje Y se recorta al
// mostrarlo: un codigo de estado no le dice nada a nadie que no sea programador, y visto en un
// movil ("HTTP 502 - FacturaE no pudo firmar la factura") hace que un aviso normal parezca un
// error del sistema. El mensaje completo sigue dentro del Error, para el log.
const PREFIJO_HTTP = /^HTTP\s*\d{3}\s*-?\s*/i;

// Código de error entre corchetes al final ("... [OPERATION_IN_PROGRESS]"). Lo añade
// ApiService a propósito para que las pantallas puedan reconocer errores conocidos, pero al
// usuario no le dice nada, así que se recorta solo al mostrarlo.
const CODIGO_AL_FINAL = /\s*\[[A-Z][A-Z0-9_]{2,}\]\s*$/;

// Errores del sistema, del navegador o de un plugin del movil. Llegan como un Error normal,
// igual que los nuestros, y acababan en el aviso rojo tal cual: en ingles y escritos para un
// programador. Reales, vistos probando la app:
//
//     Missing parent directory - possibly recursive=false was passed
//     Failed to fetch
//
// (2026-09-16, pedido por Jose para que la demo no ensene textos en ingles.)
//
// SE RECONOCEN POR SU FIRMA, NO POR "PARECER INGLES". Un primer intento descartaba cualquier
// mensaje con palabras inglesas y sin palabras castellanas: eso habria borrado tambien NUESTROS
// mensajes cuando la app esta en ingles o en ucraniano, que es justo cuando mas falta hacen.
// Estas expresiones solo casan con textos que ningun mensaje de producto escribiria.
//
// La lista crece cuando aparezca un caso nuevo: lo que no este aqui se sigue enseñando, porque
// perder un motivo real es peor que enseñar una frase en ingles.
const FIRMAS_DEL_SISTEMA: RegExp[] = [
  /missing parent directory/i,          // Filesystem de Capacitor (iOS/Android)
  /^failed to fetch/i,                  // fetch, Chrome
  /^load failed/i,                      // fetch, Safari
  /network request failed/i,            // WebView
  /NSURLErrorDomain|NSCocoaErrorDomain/, // iOS
  /\bERR_[A-Z_]{3,}\b/,                 // Chrome (ERR_INTERNET_DISCONNECTED...)
  /unexpected token .* in JSON|JSON\.parse/i,
  /\bjava\.[a-z]+\.[A-Za-z]+Exception\b|android\.[a-z]+\./,
  /possibly recursive=false/i,
];

export function pareceMensajeDelSistema(mensaje: string): boolean {
  return FIRMAS_DEL_SISTEMA.some(firma => firma.test(mensaje));
}

export type Traducir = (clave: string, params?: Record<string, unknown>) => string;

/**
 * Mensajes que SÍ son nuestros, y en castellano, pero escritos para quien programa (2026-09-16).
 *
 * El caso que lo motivó, visto en la demo: al contabilizar salía un aviso rojo con
 *
 *     No se pudo obtener el bloqueo 'contabilizar-emitida-83036' para la empresa 5
 *     (sp_getapplock devolvió -1).
 *
 * Es cierto y es útil en un log, pero a quien está usando la app no le dice nada: lo que le pasa
 * es que esa factura ya se está contabilizando (o acaba de intentarse) y tiene que esperar. Lo
 * mismo con el id interno de la empresa, que se cuela al final de varios mensajes del backend.
 */
const BLOQUEO_EN_CURSO = /sp_getapplock|No se pudo obtener el bloqueo/i;
const PROVINCIA_DESCONOCIDA = /^No existe la provincia\s+'(.+?)'/i;

/**
 * Traductor por defecto para los mensajes de arriba.
 *
 * Se registra UNA vez al arrancar (AppComponent) en vez de pasarlo por los 44 sitios que llaman
 * a mensajeDeError: lo que se quiere garantizar es que un texto así no llegue NUNCA a una
 * pantalla, y eso no se consigue si hay que acordarse de pasarlo en cada llamada nueva. Quien
 * quiera pasar el suyo (un test, un servicio sin inyección) puede seguir haciéndolo.
 */
let traductorPorDefecto: Traducir | null = null;

export function configurarTraductorDeErrores(traducir: Traducir | null): void {
  traductorPorDefecto = traducir;
}

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
  // Un error del sistema en ingles: se ensena el respaldo, que si esta traducido.
  if (pareceMensajeDelSistema(cuerpo)) return false;
  return true;
}

/**
 * El mensaje del error si se puede leer; si no, el de respaldo de la pantalla.
 *
 * `respaldo` es obligatorio y siempre debe venir traducido: es lo que se enseña en el caso
 * malo, que es justo cuando peor viene un texto en inglés o en jerga.
 */
export function mensajeDeError(error: unknown, respaldo: string, traducir?: Traducir): string {
  const bruto = (error as { message?: string } | undefined)?.message;
  const traductor = traducir ?? traductorPorDefecto;

  const cuerpo = (bruto ?? '')
    .replace(PREFIJO_HTTP, '')
    .replace(CODIGO_AL_FINAL, '')
    .trim();

  // Sin traductor se enseña el respaldo de la pantalla, que también está traducido: peor es
  // enseñar el nombre de un cerrojo de SQL Server.
  if (BLOQUEO_EN_CURSO.test(cuerpo)) {
    return traductor ? traductor('errors.operationInProgress') : respaldo;
  }

  const provincia = cuerpo.match(PROVINCIA_DESCONOCIDA);
  if (provincia && traductor) {
    return traductor('errors.provinceNotFound', { provincia: provincia[1] });
  }

  if (!esMensajePresentable(bruto)) return respaldo;
  return cuerpo || respaldo;
}
