# Pasar la web de Netlify a Azure Static Web Apps

Estado a 2026-09-16: **el repo ya está preparado; falta crear el recurso en Azure.** Este
documento dice qué hay hecho, qué tiene que hacer Jose (no se puede hacer desde el código) y
qué queda por tocar en el front cuando el recurso exista.

## 1. Lo que ya está hecho en el repo (rama `pruebas`)

- **`src/staticwebapp.config.json`** — la configuración del sitio. Lo importante es
  `navigationFallback`: sin eso, entrar directamente en `https://…/facturas-emitidas` o
  recargar con F5 devuelve un 404, porque para el servidor esa ruta no es un fichero. Con el
  fallback, cualquier ruta que no sea un fichero devuelve `index.html` y el router de Angular
  se encarga. La lista `exclude` evita el caso contrario: que un `.js` o un `.json` que falte
  devuelva el HTML de la app y el navegador se atragante intentando interpretarlo.
  - `routes`: `index.html` sin caché y las traducciones (`/assets/i18n/*`) revalidando
    siempre. Los `.js` y `.css` de Angular llevan hash en el nombre, así que esos sí se pueden
    cachear sin miedo; los ficheros de idioma no, y si se cachean, un texto corregido tarda
    días en llegar al usuario.
  - `globalHeaders`: `nosniff` y `Referrer-Policy`. Mínimos, no rompen nada.
- **`angular.json`** copia ese fichero a la raíz de `www` al compilar. Tiene que estar en la
  raíz de lo que se publica, si no, Azure lo ignora en silencio (síntoma: los 404 al recargar).
- **Node 20** fijado en `package.json` (`engines`), que es lo que mira el build de Azure.
- **El `postbuild` no estorba**: `scripts/generar-redirects-de-pruebas.mjs` solo escribe algo
  si la variable `BRANCH` vale `pruebas`, y esa variable la pone Netlify. Fuera de Netlify no
  hace nada.
- **`docs/azure/azure-static-web-apps.yml`** — el workflow de GitHub Actions ya escrito. No
  está en `.github/workflows/` a propósito: sin el recurso creado no existe el secreto del
  token y fallaría en cada push, ensuciando el repo de ejecuciones en rojo.

## 2. Lo que tiene que hacer Jose

1. **Crear el recurso** Static Web App (región West Europe; plan Free para empezar — ver el
   punto 6), con origen GitHub, repo `maquedaperez/artibusiness-facturacion-movil`, rama
   `main`, y *build preset* **Custom**: app location `/`, api location vacío, output location
   `www`.
2. Al crearlo, Azure añade el secreto `AZURE_STATIC_WEB_APPS_API_TOKEN` al repositorio y
   commitea su propio workflow en `.github/workflows/`. Si ese workflow no compila bien
   (Oryx a veces elige otra versión de Node), se sustituye por el de `docs/azure/`, que compila
   con `npm ci && npm run build` y solo sube el resultado.
3. **CORS — esto es lo que rompe si se olvida.** Azure Portal → App Service → API → CORS, hay
   que dar de alta el origen nuevo en tres sitios:
   - `configurationapidispatcher-…` → **nuevo**. Hoy no hace falta porque Netlify lo proxea
     por dentro; en Static Web Apps ese proxy no existe (punto 5).
   - `webapiartibusinessdevelopment-…`
   - `webapiartibusiness-…` (producción; hoy **no** admite la web, por eso desde el navegador
     solo se puede hablar con Development).

   Orígenes a dar de alta: `https://<nombre>.azurestaticapps.net` (para poder probar antes del
   corte) y después el dominio propio. En el dispatcher hay que dejar también
   `https://artibusiness-facturacion.netlify.app`, o Netlify deja de funcionar en cuanto yo
   haga el cambio del punto 3.
4. **Dominio propio**: CNAME del subdominio elegido a la URL `*.azurestaticapps.net` y
   validarlo en el portal. El certificado TLS lo emite y lo renueva Azure, gratis. Queda por
   decidir el subdominio.

## 3. Lo que hago yo cuando el recurso exista

- **`TenantService`**: en web, llamar al dispatcher directamente en vez de por
  `/config-api/configuration`. Es una línea, pero **no se puede hacer antes** de que el
  dispatcher admita los dos orígenes (Netlify y el nuevo): en cuanto se cambie, Netlify deja de
  usar su proxy y pasa a llamar cross-origin como el resto. Hasta entonces, la web desplegada
  en Static Web Apps no puede ni llegar al login, porque `/config-api/configuration` allí
  devuelve el `index.html`.
- **Borrar el proxy** `/config-api` de `netlify.toml`: tras lo anterior ya no hace nada.
- **Borrar el apaño de la rama `pruebas`** (`scripts/generar-redirects-de-pruebas.mjs` y
  `ApiService.baseUrlDePruebas`) el día que Development y Producción admitan el origen nuevo.
  Son las dos mitades de la misma tubería y se van juntas.

## 4. Orden del cambio, sin cortes

1. Jose crea el recurso y añade el CORS del dispatcher para los dos orígenes.
2. Yo cambio `TenantService` y subo. Netlify y Static Web Apps funcionan las dos a la vez.
3. Se prueba el sitio en su URL `*.azurestaticapps.net` con una empresa de Development.
4. Jose da de alta el dominio propio y ese origen en los tres App Service.
5. Se baja el TTL del DNS unas horas antes, se apunta el dominio al sitio nuevo y se deja
   Netlify levantado una semana por si hay que volver atrás.
6. Cuando esté estable: borrar el sitio de Netlify, `netlify.toml` y el apaño de `pruebas`.

## 5. Lo que Static Web Apps no puede hacer

- **No hace de proxy hacia URLs externas.** Lo único parecido son los *linked backends*, y solo
  bajo `/api`, solo en plan Standard y solo hacia recursos de Azure de la misma suscripción.
  De ahí que el CORS deje de ser opcional: la app tiene que llamar al dispatcher y a la API
  directamente desde el navegador.
- **Los entornos de preview salen de los pull requests, no de una rama suelta.** Para tener un
  entorno fijo de `pruebas` como el de Netlify hace falta plan Standard y un segundo workflow
  con `deployment_environment: pruebas`.

## 6. Coste

Free: 100 GB de banda al mes, dominios propios con certificado incluido, sin SLA — de sobra
para lo que hay hoy. Standard (unos 9 $ al mes por aplicación, confirmar en el portal) añade
SLA, entornos con nombre y linked backends. Se puede empezar en Free y subir después sin
recrear el recurso.
