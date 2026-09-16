// ⚠️ TEMPORAL: apuntando a Development, ver el aviso en environment.prod.ts.
export const environment = {
  production: false,
  // si no quieres mapear tenant aún, pon el de DEV aquí y listo:
  defaultBaseUrl: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',

  // Mismo motivo que environment.prod.ts: ya desplegado en Development (2026-08-17).
  features: {
    enableQuickSave: true,
    enableServerAttachments: true,
    // Encendido el 2026-09-16: Jose mergeó y publicó el PR 54, y se ha comprobado que
    // POST /api/FacturasRecibidas/{id}/ConvertirEnTicket responde 401 (o sea, que la ruta
    // existe) tanto en Development como en Producción — no 404.
    enableConvertToTicket: true,
  },
};
