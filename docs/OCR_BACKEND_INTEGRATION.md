# Integración del lector OCR (Generic Invoice Reader) en el backend

Este documento es para quien implemente el endpoint en `WebAPIARTIBusiness`
(C#/.NET). Resuelve los gaps #13 y #21 de `SERVICE_CONTRACT_GAPS.md`: el
paquete que nos han entregado (`ARTI-Invoice-Reader-Handoff/`) está pensado
para integrarse **desde el backend**, no desde la app móvil — el motivo es
que el token de esa API es de pago por llamada y no puede vivir en ningún
cliente (web, Android o iOS son igual de inseguros para guardar un secreto:
un APK se descompila en segundos con herramientas gratuitas).

## Resumen del flujo

```
App móvil (Angular/Capacitor)
    → POST /api/FacturaRecibida/desde-ocr   (con el token de sesión normal de la app)
    → WebAPIARTIBusiness
        → POST https://generic-invoice-reader-production.up.railway.app/api/v1/documents/analyze
          (con el token de la API de OCR, guardado solo en el servidor)
    ← JSON con los datos extraídos de la factura
← WebAPIARTIBusiness devuelve el resultado a la app
```

La API de OCR **no** contabiliza nada ni decide nada fiscal — solo lee el
documento y devuelve texto estructurado. Todo lo demás (numeración,
VeriFactu, decisión fiscal) sigue siendo responsabilidad exclusiva de
ARTIBusiness, como ya dice el propio `README-ARTI.md` del paquete.

---

## Paso 1 — Guardar el token de forma segura

El token que os han pasado (o pasarán) por canal separado va en la
configuración del servidor — **nunca en el código ni en un `appsettings.json`
que se suba a git**:

- En desarrollo: `dotnet user-secrets set "InvoiceOcr:Token" "<token>"`.
- En producción (Azure App Service, que es donde está desplegado
  `WebAPIARTIBusiness` según `environment.prod.ts`): variable de entorno /
  "Application settings" del App Service, p. ej. `InvoiceOcr__Token`.

También conviene guardar la URL base como configuración, no hardcodeada:

```
https://generic-invoice-reader-production.up.railway.app
```

## Paso 2 — Crear el endpoint `POST /api/FacturaRecibida/desde-ocr`

- **Protegido igual que el resto de endpoints autenticados** de la API (el
  mismo esquema que ya usa el login/sesión de la app) — así solo usuarios
  logueados de ARTIBusiness pueden disparar una llamada facturable a la API
  de OCR, nunca un desconocido.
- **Request**: `multipart/form-data` con un único campo `file` (binario) —
  es exactamente lo que la app ya envía hoy contra el mock, así que no hace
  falta cambiar nada en el frontend en cuanto a la forma de subir el
  fichero.
- **No se manda `Company`/`BusinessUnit` en el body.** Esos campos solo
  viajan una vez, en el login (`POST /api/Employees/authenticate`, ver
  `auth.service.ts`) — a partir de ahí el token de sesión ya identifica la
  empresa, y **ningún** endpoint de negocio existente (Emitidas, Recibidas)
  vuelve a mandarla explícita en llamadas posteriores. Este endpoint debe
  seguir el mismo patrón: la empresa se deriva en el servidor a partir del
  token autenticado, nunca de un campo que mande el cliente — si se
  aceptara un "empresa" desde el body, un cliente con un bug (o manipulado)
  podría intentar crear una factura recibida en una empresa que no es la
  suya.
- **Tamaño máximo**: la API de OCR ya rechaza por encima de 10 MB
  (`413 FILE_TOO_LARGE`) — no hace falta duplicar la validación, pero si
  queréis cortar antes para no gastar ancho de banda, 10 MB es el límite
  real.
- **Formatos**: PDF, JPEG/JPG, PNG, WEBP.

## Paso 3 — Reenviar el fichero a la API de OCR

Usar `CSHARP-EXAMPLE.cs` (incluido en `ARTI-Invoice-Reader-Handoff/`) como
base — usa solo librería estándar de .NET (`HttpClient`,
`MultipartFormDataContent`, `System.Text.Json`), no hace falta ningún
paquete NuGet nuevo:

```csharp
using var form = new MultipartFormDataContent();
using var fileContent = new StreamContent(fileStream);
form.Add(fileContent, "file", nombreOriginalDelFichero);

client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", tokenDesdeConfiguracion);

var response = await client.PostAsync(
    $"{baseUrl}/api/v1/documents/analyze", form);
```

Guardad también el header `X-Request-ID` que devuelve la respuesta (o el
que vosotros mandéis) en vuestros logs — sirve para pedir soporte sin tener
que compartir el documento con ellos.

## Paso 4 — Manejar los errores de la API de OCR

Todas las respuestas de error de esa API tienen el mismo formato estable:

```json
{ "success": false, "error": { "code": "INVALID_FILE", "message": "..." }, "request_id": "..." }
```

Importante: **el código de negocio se saca de `error.code`, nunca de
`error.message`** (el mensaje es humano y puede cambiar de wording).

| Código OCR | Qué hacer en el backend |
| --- | --- |
| `UNAUTHORIZED` (401) | Fallo vuestro (token mal puesto) — no lo devolváis tal cual al cliente. Logueadlo como error interno y devolved 500 genérico a la app. |
| `INVALID_FILE` / `UNSUPPORTED_FORMAT` (400) | Devolved 400 a la app con un mensaje claro ("formato no soportado"). No reintentéis. |
| `FILE_TOO_LARGE` (413) | Devolved 413 a la app. No reintentéis. |
| `EMPTY_DOCUMENT` / `DOCUMENT_NOT_PROCESSABLE` (422) | Devolved 422 a la app ("no se pudo leer el documento"). No reintentéis. |
| `RATE_LIMIT_EXCEEDED` (429) | Respetad el header `Retry-After` (segundos) y reintentad **una sola vez**. Si vuelve a fallar, devolved error a la app. |
| `SERVICE_BUSY` / `PROVIDER_UNAVAILABLE` (503) / `PROVIDER_TIMEOUT` (504) | Reintentad una vez tras una espera corta (unos segundos). Si persiste, devolved 503/504 a la app. |
| `INTERNAL_ERROR` (500) | No reintentéis salvo que queráis. Devolved 500 a la app. |

Un único reintento acotado es suficiente — cada llamada a esa API es
facturable, así que no hay que montar una librería de reintentos
sofisticada ni reintentar varias veces "por si acaso".

## Paso 5 — Qué devolver a la app

**Recomendación: reenviad el objeto `document` de la respuesta de OCR
prácticamente tal cual**, envuelto en vuestro propio formato de respuesta.
Así el backend queda como un proxy fino (menos código, menos mantenimiento)
y todo el trabajo de mapear esos campos a una `FacturaRecibida` lo hago yo
en el frontend — ya tengo el esquema completo (`openapi.json`) y me basta
con esto:

```json
{
  "success": true,
  "document": {
    "document_type": "invoice",
    "confidence": 0.97,
    "warnings": [],
    "invoice": {
      "invoice_number": "F-2026-001",
      "issue_date": "2026-08-01",
      "issuer": { "legal_name": "...", "tax_id": "..." },
      "lines": [
        { "description": "...", "quantity": "1", "unit_price": "10.00", "tax_rate": "21", "line_total": "12.10" }
      ],
      "tax_breakdown": [
        { "rate": "21", "taxable_base": "10.00", "tax_amount": "2.10" }
      ],
      "totals": { "taxable_base": "10.00", "tax": "2.10", "total": "12.10" }
    }
  }
}
```

Los importes y cantidades llegan **como texto** (`"10.00"`, no `10.00`) a
propósito — la API de OCR los serializa así para no perder precisión
decimal. No hace falta convertirlos a `float`/`decimal` en el backend si
vais a reenviarlos tal cual; yo los parseo en el frontend al construir el
borrador.

Si en el futuro preferís que el backend sea quien transforme la respuesta a
vuestro propio DTO de `FacturaRecibida` en vez de reenviar el bloque
`document` (por ejemplo si queréis guardar la extracción también en base de
datos con vuestro propio modelo), decidme y ajusto el mapeo del lado del
frontend — es un cambio pequeño, solo hay que acordar el contrato exacto
antes de que yo construya el adaptador definitivo.

### El documento original no vuelve en la respuesta

**La API de OCR no devuelve el fichero ni en base64 ni de ninguna otra
forma** — confirmado contra el `openapi.json` completo, `AnalyzeDocumentResponse`
solo trae datos extraídos (texto/números), nunca el documento en sí. Esto
importa para la funcionalidad de "documento adjunto" de Recibidas:

- Hoy, en el mock, la app ya guarda el fichero **localmente** en el propio
  dispositivo (como Data URL) al mismo tiempo que llama al OCR — no depende
  de la respuesta de la API, así que ese comportamiento no cambia.
- Pero eso es solo local: si el usuario cambia de móvil o borra la app,
  pierde la imagen adjunta. Si queréis que el documento quede accesible de
  forma persistente entre dispositivos, es el backend quien tiene que
  guardar una copia del fichero que recibe **antes** de reenviarlo a la API
  de OCR — es una decisión de almacenamiento aparte, no algo que resuelva
  esta integración por sí sola (ver gap #22 de `SERVICE_CONTRACT_GAPS.md`).

## Paso 6 — Aviso importante para el usuario final

Los datos extraídos **no son de fiar a ciegas**, y así lo dice también el
propio README de la API: el NIF, el IBAN, si aplica retención, si es
intracomunitaria... son datos leídos del documento, no una decisión fiscal.
En el frontend la factura creada desde OCR ya nace como **borrador
editable** (`estado: 'borrador'`, campo `origenOcr: true`) precisamente
para que el usuario revise y corrija antes de guardar — eso ya está
implementado, no hace falta nada extra en el backend para forzarlo.

---

## Lo que NO hace falta hacer

- No hay que registrar nada en VeriFactu ni tocar la lógica fiscal — esta
  API solo lee, no decide.
- No hace falta que el backend valide NIFs, IBANs, etc. — eso queda para
  cuando el usuario revisa el borrador en la app.
- No hace falta un sistema de colas/async para esto — la API de OCR
  responde de forma síncrona (aunque puede tardar unos segundos en
  documentos grandes); un `await` normal en el controlador basta.

## Cuando el endpoint esté listo

Avísame de la URL final del endpoint (o confirma que es
`/api/FacturaRecibida/desde-ocr` sobre el mismo dominio que ya usa el resto
de la app) y de si reenviáis `document` tal cual o con otro formato — y
construyo el adaptador del lado de Angular que sustituye al mock
(`crearDesdeOcr`) por la llamada real, sin tocar ninguna pantalla.
