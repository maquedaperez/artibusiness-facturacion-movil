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
 * Bloqueado por: el endpoint POST /api/FacturaEmitida/{id}/Rectificar existe (PR 42) pero
 * todavía no está desplegado, y hace falta ejecutar antes el script 015 que añade las columnas
 * del motivo y el método. Con el flag en false no se ofrece un botón que daría 404.
 *
 * Para activarlo: en cuanto el backend esté publicado y el script ejecutado, poner true. No hay
 * nada más que hacer — el resto del flujo (pantalla, validaciones, i18n) ya está.
 */
export const RECTIFICATIVAS_DISPONIBLES = false;
