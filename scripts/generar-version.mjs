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
// ── ANDROID: la misma idea, pero fuera de git ────────────────────────────────────────────────
//
// android/ e ios/ estan en .gitignore (son proyectos regenerables de Capacitor), asi que la
// version nativa NO se puede versionar aqui. Queda apuntada para poder rehacerla en 30 segundos
// si alguna vez se regenera la carpeta.
//
// android/app/build.gradle venia con 'versionCode 1' fijo desde que Capacitor genero el
// proyecto. Google Play RECHAZA un AAB con un versionCode ya subido, asi que la segunda
// publicacion habria sido un rechazo. Se cambio el 2026-09-07 por esto, justo encima del
// bloque `android {`:
//
//     def hoy = java.time.LocalDate.now()
//     def codigoDeVersion = System.getenv("ANDROID_VERSION_CODE")?.toInteger()
//             ?: Integer.parseInt(hoy.format(java.time.format.DateTimeFormatter.ofPattern('yyyyMMdd')))
//     def nombreDeVersion = System.getenv("ANDROID_VERSION_NAME")
//             ?: hoy.format(java.time.format.DateTimeFormatter.ofPattern('yyyy.MM.dd'))
//
// (java.time y no new Date().format(...): ese format() es de groovy-dateutil, que no siempre
//  esta en el runtime de Gradle. java.time es JDK puro.)

// ── iOS: EL MISMO PROBLEMA, Y ADEMAS DOS COSAS QUE SE OLVIDAN ───────────────────────────────
//
// 1) EL NUMERO DE BUILD. Capacitor genera el proyecto iOS con Version 1.0 y Build 1 fijos,
//    igual que Android traia versionCode 1. App Store Connect DESCARTA EN SILENCIO un binario
//    cuyo par Version+Build ya se haya subido: no da error, simplemente el build no aparece
//    nunca en la lista para seleccionarlo. En Xcode: target App > General > Identity.
//    Mismo criterio que Android — la fecha del dia:
//
//        Version (MARKETING_VERSION)      2026.09.09
//        Build   (CURRENT_PROJECT_VERSION) 20260909
//
//    Para dos publicaciones el mismo dia, el Build va a 20260909.1 (o 2, 3...).
//
// 2) HAY QUE RECOMPILAR Y SINCRONIZAR ANTES DE ARCHIVAR. Es el fallo mas facil de cometer:
//    www/ e ios/ estan en .gitignore, asi que un `git pull` en el Mac actualiza src/ y NO TOCA
//    los assets que Xcode empaqueta. Si abres Xcode y le das a Archive sin mas, subes la web
//    de la ultima vez que compilaste — con el codigo viejo, aunque el repo este al dia.
//
//        git pull origin main
//        npm ci            # solo si cambio package-lock.json
//        npm run build     # regenera version.ts y www/
//        npx cap sync ios  # copia www/ dentro de ios/App/App/public/
//
//    Comprobacion de 5 segundos antes de archivar, que la fecha viaja como texto en el bundle:
//
//        grep -rl "$(node -p "require('./src/environments/version.ts')" 2>/dev/null || date +%Y.%m.%d)" ios/App/App/public/ | head
//
//    Si no devuelve nada, el sync no se ha hecho y Xcode va a empaquetar codigo viejo.
//
// ...y dentro de defaultConfig:
//
//     versionCode codigoDeVersion
//     versionName nombreDeVersion
//
// Da 20260907 / "2026.09.07": crece solo, no hay que acordarse de nada y coincide con lo que se
// ve en Perfil. Para dos publicaciones el mismo dia, las variables de entorno de arriba.
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
