# OCR: documentos bancarios

Contexto: correo de Alex (2026-08-19) sobre `4QHPJO04H000.pdf` (un abono de remesa de
adeudos directos de Banco Sabadell) — el lector antes intentaba tratar cualquier documento
como una factura. La mejora que describe: el lector ya distingue `document_type` antes de
devolver los datos, y un documento bancario es un **HTTP 200 válido con `success: true`**,
no un error ni una factura a medias.

## Contrato admitido

```text
document.document_type === "invoice"       -> los datos están en document.invoice
document.document_type === "bank_document" -> los datos están en document.bank_document
```

No cambia el fichero multipart, el nombre del campo (`file`) ni el endpoint del lector. Se
conserva compatibilidad con respuestas antiguas de factura que todavía no incluyan
`document_type`, siempre que exista `document.invoice`. Cuando `document_type` sí viene,
manda siempre — incluso si quedara un bloque `bank_document` residual junto a una factura
real.

## Comportamiento en la app (frontend, ya implementado)

- Una factura sigue el flujo actual de alta y guardado, sin cambios.
- Un `bank_document` abre `DocumentoBancarioComponent` (`src/app/modals/documento-bancario/`):
  un visor que recorre `document.bank_document` de forma genérica (incluidos objetos y
  arrays anidados, sin imponer un DTO bancario rígido) y muestra `confidence`, `warnings`,
  `request_id` y el fichero original (reutilizando `VerDocumentoComponent`).
- Un documento bancario **nunca** se convierte ni se guarda como factura recibida — ni se
  navega a ningún detalle de factura.
- Si `document_type` es `bank_document` pero falta `document.bank_document`, se lanza un
  error de contrato claro (`construirDocumentoBancario` en
  `received-invoices.repository.http.ts`) en vez de dar a entender que el lector no pudo
  leer el fichero.
- `ReceivedInvoicesRepository.crearDesdeOcr`/`crearDesdeDocumentoDirecto` devuelven ahora
  `ResultadoProcesamientoDocumento` (`FacturaRecibida | DocumentoBancarioAnalizado`) — union
  discriminada con el type guard `esDocumentoBancarioAnalizado` (ver
  `src/app/core/models/documento-bancario.ts`).

## Frontera con el backend

La pantalla principal de Facturas Recibidas (botones "Escanear"/"Adjuntar documento") usa:

```text
POST /api/FacturasRecibidas/CrearDesdeDocumento
```

Este es el camino real que dispara el escaneo desde la UI — `crearDesdeOcr`
(`POST /api/Documento/analizar`) solo se usa hoy como fallback interno cuando
`CrearDesdeDocumento` rechaza por proveedor no reconocido / NIF o número ilegibles. **Por
eso el backend necesita el mismo cambio en los dos endpoints**, no solo en uno.

Para un documento bancario, ambos deben responder HTTP 200 preservando el sobre del lector,
sin intentar guardar ninguna factura:

```json
{
  "success": true,
  "filename": "4QHPJO04H000.pdf",
  "request_id": "...",
  "document": {
    "document_type": "bank_document",
    "confidence": 0.98,
    "warnings": [],
    "invoice": null,
    "bank_document": { "...": "datos estructurados del lector, reenviados tal cual" }
  }
}
```

`/api/Documento/analizar` (`DocumentoController`/`DocumentoService`) ya cumple esto sin
cambios: siempre ha reenviado el JSON del lector tal cual (`Content = resultado.Json`).

`/api/FacturasRecibidas/CrearDesdeDocumento`
(`FacturaRecibidaDocumentoService.CrearDesdeDocumentoAsync`) **no** lo cumplía: antes de
este cambio, cualquier respuesta sin `document.invoice` (incluido un `bank_document`
correcto) caía en el mismo `throw` genérico ("No se pudo extraer información del
documento."), devuelto como 400 — perdiendo todos los datos bancarios ya extraídos. Se
corrige detectando `document_type === "bank_document"` (o, si el discriminante no viene,
`invoice == null && bank_document` presente) **antes** de ese `throw`, y devolviendo el
mismo sobre de arriba en vez de un error o de una factura a medias.

## Prueba de aceptación con Sabadell

Con `4QHPJO04H000.pdf`, la prueba se considera correcta si:

1. El servidor responde HTTP 200 con `document_type: "bank_document"`, tanto desde
   `/api/Documento/analizar` como desde `/api/FacturasRecibidas/CrearDesdeDocumento`.
2. No se crea ninguna fila en Facturas Recibidas.
3. Se abre el visor "Documento bancario" (no el detalle de ninguna factura).
4. Se ven, como mínimo, la referencia única, los IBAN, el nominal, la comisión, los
   impuestos, el líquido y la fecha valor devueltos por el lector.
5. El documento original se puede abrir desde el visor.
