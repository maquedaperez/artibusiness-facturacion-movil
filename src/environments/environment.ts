// ⚠️ TEMPORAL: apuntando a Development, ver el aviso en environment.prod.ts.
export const environment = {
  production: false,
  // si no quieres mapear tenant aún, pon el de DEV aquí y listo:
  defaultBaseUrl: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',

  // Mismo motivo que environment.prod.ts: ya desplegado en Development (2026-08-17).
  features: {
    enableQuickSave: true,
    enableServerAttachments: true,
  },
};
