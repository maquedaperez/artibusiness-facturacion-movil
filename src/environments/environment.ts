// ⚠️ TEMPORAL: apuntando a Development, ver el aviso en environment.prod.ts.
export const environment = {
  production: false,
  // si no quieres mapear tenant aún, pon el de DEV aquí y listo:
  defaultBaseUrl: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',

  // Mismo motivo que environment.prod.ts: ya desplegado en Development (2026-08-17).
  features: {
    enableQuickSave: true,
    enableServerAttachments: true,
    // Apagado hasta que Jose publique el PR 54 (POST .../ConvertirEnTicket). Con el endpoint
    // sin publicar, el botón existe y responde 404: en una demo eso es un aviso rojo delante
    // del cliente. Se enciende el día que esté arriba, que es cambiar este false.
    enableConvertToTicket: false,
  },
};
