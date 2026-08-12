# Generic Invoice Reader API

Extraction and normalization service for invoices, credit notes,
receipts, and bank documents. This package is what you need to
integrate it from ARTI Software's C#/.NET application.

## Base URL

```
https://generic-invoice-reader-production.up.railway.app
```

## Endpoint

```
POST /api/v1/documents/analyze
```

## Interactive docs

- Swagger UI: `https://generic-invoice-reader-production.up.railway.app/docs`
- OpenAPI schema: `https://generic-invoice-reader-production.up.railway.app/openapi.json`

## Authentication

Bearer token (`Authorization: Bearer <token>`).

**The token will be provided through a separate secure channel** — it
is not included anywhere in this package.

## Flow

```
ARTI C#/.NET
    -> Generic Invoice Reader API
    -> structured JSON
    -> ARTI decides how to use the result
```

## What this API does — and does not — do

This API reads a document (PDF, JPEG, PNG, or WEBP) and returns
structured, normalized information about it. It does **not**:

- register invoices with VeriFactu;
- create fiscally valid invoices;
- assign fiscal invoice numbering.

It returns only structured information extracted from the document.
Everything else — creating the invoice, numbering it, sending it to
VeriFactu, and any final fiscal decision — remains entirely ARTI's
responsibility.

## In this package

- `API-INTEGRATION.md` — everything needed to call the endpoint:
  request/response shape, formats, size limit, errors, retries,
  request-id.
- `CSHARP-EXAMPLE.cs` — a short, compilable C#/.NET example using only
  the standard library.
- `openapi.json` — machine-readable API schema (if included; see
  Swagger UI above for the same information interactively).
