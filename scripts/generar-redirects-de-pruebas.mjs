// Proxy de los backends SOLO en el despliegue de la rama de pruebas (2026-09-07).
//
// EL PROBLEMA. Los dos App Service tienen activada la función CORS de Azure, que anula el
// AllowAnyOrigin del código de la API (está documentado: si activas CORS en App Service, el del
// código deja de aplicarse). Lo que hay de verdad es una lista blanca, y en Development solo
// figura https://artibusiness-facturacion.netlify.app. La URL del despliegue de rama
// —https://pruebas--artibusiness-facturacion.netlify.app— no está, así que el navegador corta
// hasta el login.
//
// LA SALIDA. CORS es una regla del NAVEGADOR sobre peticiones a otro origen. Si la petición sale
// hacia el mismo origen, no hay CORS que valga: Netlify la reenvía al backend desde su servidor,
// y entre servidores esto no existe. Es exactamente el mismo truco que ya usa el dispatcher en
// netlify.toml, la única llamada que tampoco podía ir directa.
//
// POR QUÉ AQUÍ Y NO EN netlify.toml. Porque las reglas de netlify.toml son GLOBALES: se aplican
// también a producción, y eso convertiría el sitio público en un proxy abierto a los dos
// backends. Un fichero _redirects, en cambio, es POR DESPLIEGUE — se genera solo cuando compila
// esta rama, y el día que se promociona a main no viaja nada. No hay que acordarse de quitarlo,
// que es justo la clase de cosa que se acaba colando.
//
// Y funciona porque las reglas de _redirects se procesan ANTES que las de netlify.toml, así que
// ganan al comodín /* que devuelve el index.html de la SPA. Si eso cambiara, el síntoma sería
// recibir el HTML de la app donde se esperaba JSON.
//
// ESTO ES UN APAÑO TEMPORAL. La solución de verdad es que Jose dé de alta el origen en el App
// Service (Azure Portal -> API -> CORS). En cuanto lo haga, este script y el desvío que hay en
// ApiService.baseUrlDePruebas() se borran los dos.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// BRANCH lo pone Netlify en cada build. En un build local no existe, así que no se genera nada
// — y bien: en local se usa `ng serve`, que no pasa por Netlify.
const rama = process.env.BRANCH ?? '';

if (rama !== 'pruebas') {
  console.log(`Sin proxy de pruebas (rama: ${rama || 'build local'}).`);
  process.exit(0);
}

// Los mismos prefijos que espera ApiService.baseUrlDePruebas(). Si se tocan aquí, hay que
// tocarlos allí: son las dos mitades de la misma tubería.
const BACKENDS = [
  ['/be-dev/*', 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net/:splat'],
  ['/be-pro/*', 'https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net/:splat'],
];

const contenido = `# GENERADO por scripts/generar-redirects-de-pruebas.mjs — no editar a mano.
# Solo existe en el despliegue de la rama 'pruebas'. Ver ese script para el porqué.
${BACKENDS.map(([desde, hacia]) => `${desde}  ${hacia}  200`).join('\n')}
`;

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', '_redirects');

writeFileSync(destino, contenido, 'utf8');

console.log(`Proxy de pruebas escrito en www/_redirects (${BACKENDS.length} backends).`);
