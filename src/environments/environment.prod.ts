// ⚠️ TEMPORAL: apuntando a Development porque DocumentoController (OCR) todavía no está
// publicado en Producción — ver docs/OCR_BACKEND_INTEGRATION.md. Revertir a
// https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net en cuanto el
// jefe publique ahí. Mientras tanto, el login en Netlify solo funciona con usuarios que
// existan en la base de datos de Development.
export const environment = {
  production: true,

  defaultBaseUrl: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',

  // Facturas Recibidas: "Guardado rápido" (POST /api/FacturasRecibidas/CrearDesdeDocumento)
  // y la persistencia real del documento adjunto (Azure Blob Storage) están implementados
  // en el backend, pero ese backend TODAVÍA NO ESTÁ DESPLEGADO — los ficheros están
  // preparados en local para entregárselos al jefe, no en el servidor real. Mientras estos
  // flags estén en false, la UI oculta "Guardado rápido" y no promete adjuntos permanentes
  // que en realidad fallarían con 404. Cuando el jefe despliegue esos endpoints, basta con
  // poner esto a true — no hace falta tocar ninguna pantalla.
  features: {
    enableQuickSave: false,
    enableServerAttachments: false,
  },
};
