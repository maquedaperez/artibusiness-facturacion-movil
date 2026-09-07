// Producción. Apuntó a Development desde el 2026-08 porque OCR todavía no estaba publicado
// ahí; Jose publicó todo en Producción el 2026-09-06, así que se revierte a lo que decía
// aquel aviso.
export const environment = {
  production: true,

  // OJO CON LO QUE ES ESTO: es solo el RESPALDO para cuando no hay clave de empresa resuelta
  // (sesión rota, o una llamada anterior a pasar por /setup). La URL real de cada empresa la
  // decide el dispatcher a partir de su clave — ver ApiService.resolveBaseUrl.
  //
  // Que el respaldo apuntara a Development es lo que hacía que un fallo al resolver la clave
  // mandara la sesión al entorno equivocado EN SILENCIO, sin que nada lo dijera en pantalla.
  defaultBaseUrl: 'https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net',

  // Facturas Recibidas: "Guardado rápido" (POST /api/FacturasRecibidas/CrearDesdeDocumento)
  // y la persistencia real del documento adjunto (Azure Blob Storage) — el jefe confirmó el
  // despliegue completo del handoff en Development el 2026-08-17, así que ya se pueden
  // activar aquí sin tocar ninguna pantalla (la UI ya estaba lista, solo oculta detrás de
  // este flag mientras el backend no existía de verdad).
  features: {
    enableQuickSave: true,
    enableServerAttachments: true,
  },
};
