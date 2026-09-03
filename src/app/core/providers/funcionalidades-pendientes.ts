/**
 * Funcionalidades que TODAVÍA NO tienen servicio real detrás y que, por eso, no se ofrecen en
 * la interfaz (2026-09-02).
 *
 * Este es el único sitio donde se decide algo así. Se hace con constantes y no comentando
 * bloques de plantilla a propósito: el código sigue compilando, cubierto por sus tests y visible
 * en la revisión, así que reactivar una función es cambiar `false` por `true` aquí y nada más.
 * Comentar código deja algo muerto que se pudre en silencio y que hay que reconstruir de memoria
 * cuando llega el backend.
 *
 * OJO — el listado de qué repositorio habla de verdad con el backend NO vive aquí, vive en
 * mock.providers.ts. Que algo siga siendo mock no implica ocultarlo: el catálogo de productos,
 * las suscripciones y la ficha de emisor siguen visibles a propósito (decisión de producto,
 * 2026-09-02), porque son pantallas que se quieren usar en cuanto el backend las sirva y
 * esconderlas retrasaría detectar sus problemas. Aquí solo entra aquello cuyo resultado
 * llegaría a un TERCERO como si fuera un documento válido.
 */

/**
 * Descargar o compartir el documento de una factura en estado BORRADOR.
 *
 * Bloqueado por: generarDocumento() sigue delegando en el mock, que produce un HTML con el
 * encabezado "SIMULACIÓN — NO VÁLIDO FISCALMENTE". Un borrador todavía no tiene PDF fiscal (se
 * genera al contabilizar), así que no hay ningún documento real que ofrecer, y este es el único
 * caso en el que lo simulado sale de la app y llega a un cliente.
 *
 * No afecta a contabilizadas ni firmadas: esas descargan y comparten el PDF/.xsig REALES que
 * publica FacturaE, y siguen disponibles.
 *
 * Para activarlo: que el backend sirva un documento de borrador/proforma de verdad.
 */
export const DOCUMENTO_DE_BORRADOR_DISPONIBLE = false;

/**
 * Emitir una factura rectificativa desde una factura ya contabilizada.
 *
 * ACTIVADA el 2026-09-03. POST /api/FacturaEmitida/{id}/Rectificar está desplegado (PR 42,
 * mergeado en upgrade-to-NET10 como 7cce320) y el script 015 está ejecutado.
 *
 * Cómo se comprobó que el script estaba puesto, que es el requisito que de verdad importaba: las
 * columnas MotivoRectificacion y MetodoRectificacion se mapean por convención en
 * FacturacionFacturasEmitidasCabecera (sin [NotMapped] ni exclusión fluent), así que EF las
 * incluye en el SELECT de CUALQUIER consulta de emitidas. Si faltaran, el listado entero
 * respondería 500 con "Invalid column name" — no solo rectificar. Que el listado cargue es la
 * prueba de que las columnas existen.
 */
export const RECTIFICATIVAS_DISPONIBLES = true;
