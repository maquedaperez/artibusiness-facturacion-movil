/**
 * Funcionalidades que TODAVÍA NO tienen servicio real detrás (2026-09-02).
 *
 * Este es el único sitio donde se decide qué se oculta en la interfaz por no estar
 * implementado de verdad. Cada entrada está en `false` porque hoy se resolvería con datos
 * simulados del mock, y enseñar eso a un usuario que ya está probando la app —o en una demo—
 * es peor que no ofrecer la función: parece que funciona, y lo que produce es mentira.
 *
 * Se hace con constantes y no comentando el código a propósito: el código sigue compilando,
 * cubierto por sus tests y visible en la revisión, así que reactivar una función es cambiar
 * `false` por `true` aquí y nada más. Comentar bloques de plantilla deja código muerto que se
 * pudre en silencio y que hay que reconstruir de memoria cuando llega el backend.
 *
 * Al activar cualquiera de estas, comprobar también que el repositorio correspondiente en
 * mock.providers.ts ya apunta a su implementación HTTP real.
 */

/**
 * Añadir una línea eligiéndola de un catálogo de productos/servicios.
 *
 * Bloqueado por: CatalogRepository sigue siendo MockCatalogRepository. El catálogo son cinco
 * productos inventados ("Revisión anual de instalación", 1.200 €...). Es el caso más grave de
 * los tres: esas líneas no se quedan en pantalla, entran en una factura REAL que se contabiliza
 * y se manda a la AEAT.
 *
 * Para activarlo: endpoint de catálogo en el backend + HttpCatalogRepository.
 */
export const CATALOGO_DISPONIBLE = false;

/**
 * Añadir una línea a partir de una suscripción del cliente.
 *
 * Bloqueado por: SubscriptionsRepository sigue siendo MockSubscriptionsRepository. Mismo
 * problema que el catálogo, y además una suscripción arrastra domiciliación y datos de cobro
 * recurrentes que hoy no existen en ningún sitio.
 *
 * Para activarlo: endpoint de suscripciones + HttpSubscriptionsRepository.
 */
export const SUSCRIPCIONES_DISPONIBLES = false;

/**
 * Pantalla "Datos de emisor" (Perfil › Datos de emisor).
 *
 * Bloqueado por: EmisorRepository sigue siendo MockEmisorRepository, y el puerto solo declara
 * getEmisor() — no hay forma de guardar nada. La pantalla muestra "Mi Empresa de Ejemplo S.L."
 * con NIF B00000000, que NO son los datos de la empresa del usuario ni los que salen en sus
 * facturas (esos los pone el backend desde la ficha real de la empresa al contabilizar). Es
 * decir: enseña datos falsos como si fueran los suyos.
 *
 * Para activarlo: endpoint de lectura/escritura de la ficha de empresa + HttpEmisorRepository,
 * y añadir guardado al puerto.
 */
export const DATOS_EMISOR_DISPONIBLES = false;

/**
 * Descargar o compartir el documento de una factura en estado BORRADOR.
 *
 * Bloqueado por: generarDocumento() sigue delegando en el mock, que produce un HTML con el
 * encabezado "SIMULACIÓN — NO VÁLIDO FISCALMENTE". Un borrador todavía no tiene PDF fiscal (se
 * genera al contabilizar), así que no hay ningún documento real que ofrecer. Mandarle eso a un
 * cliente es peor que no tener el botón.
 *
 * No afecta a contabilizadas ni firmadas: esas descargan y comparten el PDF/.xsig REALES que
 * publica FacturaE, y siguen disponibles.
 *
 * Para activarlo: que el backend sirva un documento de borrador/proforma de verdad.
 */
export const DOCUMENTO_DE_BORRADOR_DISPONIBLE = false;
