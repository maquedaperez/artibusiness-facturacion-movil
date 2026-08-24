# Textos pendientes de traducir manualmente en las tiendas

Esto NO está en `src/assets/i18n/*.json` — vive en Google Play Console y App Store Connect,
fuera del código de la app, y hay que rellenarlo/traducirlo a mano en cada consola cuando
llegue el momento de publicar en inglés y ucraniano. Ninguno de estos textos se genera desde
esta implementación (Fase 2 de i18n); esta lista es solo el inventario de qué falta.

## Google Play Console

- **Nombre de la app** (por idioma, si se decide traducirlo — normalmente el nombre de marca
  "ARTIBusiness Facturación" se mantiene igual en los tres idiomas, ver más abajo).
- **Descripción breve** (80 caracteres) — es/en/uk.
- **Descripción completa** — es/en/uk.
- **Notas de la versión** (cada release) — es/en/uk, se repite en cada actualización.
- **Capturas de pantalla**: si las capturas incluyen texto de la UI superpuesto (títulos,
  llamadas a la acción), hacen falta capturas por idioma una vez la Fase 2 esté visible en
  producción — hasta ahora las pantallas migradas son solo Perfil (Fase 1); logo cuando el
  resto de pantallas de este barrido lleguen a producción.
- **Política de privacidad** (URL o texto): si tiene versión solo en español, revisar si
  procede traducirla o si basta con un único documento en el idioma principal.
- **Categoría, etiquetas de clasificación de contenido**: normalmente no llevan texto libre,
  pero cualquier campo de texto libre del formulario de clasificación se rellena una vez por
  ficha, no por idioma — confirmar en el formulario real de Play Console.

## App Store Connect (cuando exista una app iOS — ver nota de `ios/` más abajo)

- **Nombre de la app** y **subtítulo** — es/en/uk (Apple sí permite localizar subtítulo).
- **Descripción** — es/en/uk.
- **Palabras clave (keywords)** — es/en/uk, afectan a la búsqueda, se traducen con cuidado
  (no es una traducción literal, es una lista de términos de búsqueda por idioma).
- **Notas de la versión ("What's New")** — es/en/uk, cada release.
- **Capturas de pantalla** — mismo caso que en Play Console.
- **Texto de promoción (promotional text)** — es/en/uk, editable sin nueva versión.
- **Aviso de privacidad (App Privacy / "Nutrition label")**: las categorías de datos
  recopilados (no textos libres traducibles) — ver `docs/i18n/pendientes-ios-privacidad.md`
  más abajo para el detalle de `PrivacyInfo.xcprivacy`, que es código, no ficha de tienda.

## Qué NO va aquí (ya cubierto en el código, `src/assets/i18n/*.json`)

- Todo el texto visible dentro de la propia app (pantallas, toasts, alerts, menús) — ya
  migrado a Transloco en este barrido.
- El nombre de marca "ARTIBusiness Facturación" dentro de la UI de la app — no se traduce
  (ver `android/app/src/main/res/values/strings.xml`, `app_name`), es un nombre propio.

## Nota sobre el nombre de marca en las fichas de tienda

Confirmar con el negocio si "ARTIBusiness Facturación" se usa tal cual en las tres fichas de
tienda (inglés y ucraniano incluidos) o si se prefiere un nombre comercial distinto para
mercados de habla inglesa/ucraniana — esta decisión es de producto/marketing, no técnica, y
no se ha tomado en esta implementación.
