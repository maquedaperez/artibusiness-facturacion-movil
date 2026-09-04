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
 * Emitir una factura rectificativa (R4 por diferencias) desde una factura ya contabilizada.
 *
 * DESACTIVADA el 2026-09-04 por DECISIÓN DE NEGOCIO, no por un fallo técnico. El endpoint
 * POST /api/FacturaEmitida/{id}/Rectificar funciona y está desplegado (PR 42), y el script 015
 * está ejecutado — pero en la reunión del 2026-09-03 Jose y Abraham acordaron resolver la
 * rectificación de otra manera mucho más simple (issue #73 de Azure DevOps):
 *
 *     "Para rectificar una factura: anular y registrar la factura antigua · crear una copia
 *      de la factura antigua y dejarla en borrador"
 *
 * Es decir: NO se emite una rectificativa enlazada con importes en negativo. Se anula la
 * original (que ya se registra como Anulación en VERI*FACTU) y el usuario emite una factura
 * nueva e independiente partiendo de una copia editable. Menos conceptos fiscales que explicar
 * al usuario y ningún caso especial (concurso, crédito incobrable) que exponer de momento.
 *
 * Se apaga en vez de borrar el código: el endpoint y su servicio siguen ahí, cubiertos por sus
 * tests, por si se recupera el modelo R4 cuando algún cliente lo pida de verdad. Mientras esté
 * en false no se ofrece el botón, que es lo que importa — con él encendido se seguirían creando
 * registros R4 reales en la AEAT que ya no encajan con el modelo acordado.
 */
export const RECTIFICATIVAS_DISPONIBLES = false;
