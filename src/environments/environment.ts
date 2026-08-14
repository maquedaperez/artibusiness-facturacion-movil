// ⚠️ TEMPORAL: apuntando a Development, ver el aviso en environment.prod.ts.
export const environment = {
  production: false,
  // si no quieres mapear tenant aún, pon el de DEV aquí y listo:
  defaultBaseUrl: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',

  // Mismo motivo que environment.prod.ts: el backend de estos dos flags está preparado en
  // local pero no desplegado en el servidor real de Development. Si estás probando contra
  // tu propio backend local con estos endpoints activos, cámbialo a true aquí sin más.
  features: {
    enableQuickSave: false,
    enableServerAttachments: false,
  },
};
