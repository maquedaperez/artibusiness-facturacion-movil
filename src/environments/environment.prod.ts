// ⚠️ TEMPORAL: apuntando a Development porque DocumentoController (OCR) todavía no está
// publicado en Producción — ver docs/OCR_BACKEND_INTEGRATION.md. Revertir a
// https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net en cuanto el
// jefe publique ahí. Mientras tanto, el login en Netlify solo funciona con usuarios que
// existan en la base de datos de Development.
export const environment = {
  production: true,

  defaultBaseUrl: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',

};
