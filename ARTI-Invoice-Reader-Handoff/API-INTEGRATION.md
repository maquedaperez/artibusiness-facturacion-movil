# API integration guide

All examples on this page use entirely fictional data.

## Request

```
POST /api/v1/documents/analyze
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | binary | yes | One document per request. |

**Supported formats**: PDF, JPEG/JPG, PNG, WEBP — verified against the
file's actual content (magic bytes), not just its extension or the
`Content-Type` you send.

**Maximum file size**: 10 MB.

**Optional header**: `X-Request-ID` — send your own opaque ID (letters,
digits, `.`, `_`, `-`, 1–128 characters) to correlate a request across
systems. If omitted, or if it doesn't match that format, the API
generates one for you. Present in the response either way.

### Example (cURL)

```bash
curl -X POST https://generic-invoice-reader-production.up.railway.app/api/v1/documents/analyze \
  -H "Authorization: Bearer <token>" \
  -F "file=@factura-ficticia.pdf"
```

## Response — success (`200`)

```json
{
  "success": true,
  "filename": "factura-ficticia.pdf",
  "api_version": "v1",
  "request_id": "87f90828-0000-4000-8000-000000000000",
  "document": {
    "document_type": "invoice",
    "confidence": 0.97,
    "extraction_source": "pdf_text",
    "warnings": [],
    "invoice": {
      "invoice_number": "DEMO-2026-0001",
      "issue_date": "2026-08-01",
      "issuer": { "legal_name": "Demo Telecom S.L.", "tax_id": "B99999999" },
      "customer": { "legal_name": "Cliente Demo S.A." },
      "lines": ["... line items ..."],
      "tax_breakdown": ["... per-rate VAT breakdown ..."],
      "totals": { "taxable_base": "30.00", "tax": "6.30", "total": "36.30" },
      "payment": { "iban": "ES0000000000000000000000" },
      "fiscal_regime": { "reverse_charge": false, "intra_community": false }
    }
  }
}
```

`document` follows the full `AnalyzeDocumentResponse` schema — see the
Swagger UI / OpenAPI schema linked in `README-ARTI.md` for the complete,
authoritative field-by-field reference (types, nullability, examples).
Money and quantity fields are serialized as **strings**, never floats,
to preserve exact decimal precision.

This API does not decide fiscal outcomes on your behalf: fields such as
tax identifiers, IBAN, withholding, and `fiscal_regime` are extracted
as read from the document and should go through human review before
being trusted for a fiscal decision.

## Response — error

Every error uses the same stable envelope:

```json
{
  "success": false,
  "error": { "code": "INVALID_FILE", "message": "El archivo enviado no es válido." },
  "request_id": "87f90828-0000-4000-8000-000000000000"
}
```

Branch on `error.code` (stable, safe to parse programmatically) — never
on `error.message` (human-readable, wording may change).

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Missing, malformed, or incorrect Bearer token. |
| 400 | `INVALID_FILE` | Missing `file` field or invalid/empty filename. |
| 400 | `UNSUPPORTED_FORMAT` | Extension, `Content-Type`, or actual file content isn't a supported format. |
| 413 | `FILE_TOO_LARGE` | File exceeds the 10 MB limit. |
| 422 | `EMPTY_DOCUMENT` | File field present but empty. |
| 422 | `DOCUMENT_NOT_PROCESSABLE` | The document could not be read/validated. |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests; includes a `Retry-After` header (seconds). |
| 503 | `SERVICE_BUSY` | Temporarily at capacity; no analysis was started for this request. |
| 503 | `PROVIDER_UNAVAILABLE` | The extraction engine is temporarily unavailable. |
| 504 | `PROVIDER_TIMEOUT` | The extraction engine did not respond in time. |
| 500 | `INTERNAL_ERROR` | Unexpected internal error (generic, sanitized message). |

## Retry recommendations

| Status / code | Retry? |
| --- | --- |
| `400`, `401`, `413`, `422` | **No.** These describe the request or file itself (or the token) — retrying unchanged fails the same way. |
| `429 RATE_LIMIT_EXCEEDED` | Yes — **honor the `Retry-After` header** (seconds) before retrying. |
| `503`, `504` | Yes, after a short backoff (a few seconds); no `Retry-After` is provided for these. |

A single bounded retry is enough — no need for a sophisticated retry
library. Each call to this endpoint is a real, billable extraction; do
not retry more than once without a good reason.

## Request ID

Every response — success or error — includes an `X-Request-ID` response
header and the same value as `request_id` in the JSON body. Keep this
value when reporting an issue to us; it lets us find the exact request
without you ever needing to share the document or its contents.
