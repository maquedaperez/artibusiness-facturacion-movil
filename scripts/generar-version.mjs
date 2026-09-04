// Sella la versión de la app con la FECHA DE COMPILACIÓN, en formato AAAA.MM.DD (2026-09-04).
//
// Nace de una petición de Jose en la reunión del 2026-09-03: poder mirar el Perfil y saber qué
// versión tiene instalada cada uno, sin depender de los números de App Store ni de Google Play
// (que van por su cuenta y encima difieren entre TestFlight y la versión publicada).
//
// Se genera en cada build en vez de escribirlo a mano a propósito. Una versión que hay que
// acordarse de subir acaba mintiendo, y una versión que miente es peor que no tener ninguna:
// alguien mira el Perfil, ve una fecha vieja y da por hecho que no tiene la corrección que sí
// tiene (o al revés). Netlify compila en cada push, así que lo desplegado siempre lleva la fecha
// real de su compilación.
//
// El fichero generado SÍ se versiona en git: así `ng serve` y los tests funcionan sin haber
// compilado antes. Que un build local lo modifique es normal y esperable — es la señal de que
// eso que tienes delante se compiló hoy.
//
// Para varias publicaciones el mismo día, Jose pidió sufijos (.1, .2). Se pasan por variable de
// entorno para no tener que tocar este script:
//
//     APP_VERSION_SUFIJO=.1 npm run build
//
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ahora = new Date();
const dosDigitos = n => String(n).padStart(2, '0');

// Fecha LOCAL, no UTC: cerca de medianoche en España, toISOString() daría el día anterior y la
// versión no coincidiría con el día en que de verdad se publicó. Mismo criterio que ya se aplica
// a la fecha de una factura (ver fechaLocalHoy en mock-facturas.service.ts).
const fecha = [
  ahora.getFullYear(),
  dosDigitos(ahora.getMonth() + 1),
  dosDigitos(ahora.getDate()),
].join('.');

const sufijo = (process.env.APP_VERSION_SUFIJO ?? '').trim();
const version = `${fecha}${sufijo}`;

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'environments', 'version.ts');

writeFileSync(destino, `// GENERADO AUTOMÁTICAMENTE por scripts/generar-version.mjs — no editar a mano.
// Se reescribe en cada build con la fecha de compilación. Ver ese script para el porqué.
export const VERSION_APP = '${version}';
`, 'utf8');

console.log(`Versión sellada: ${version}`);
