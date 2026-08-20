import { FacturaRecibida, LineaFactura } from '../../services/mock-facturas.service';

// Resultado de una extracción OCR clasificada como `bank_document` (ver el correo de Alex,
// 2026-08-19: el lector ya distingue documentos bancarios de facturas y devuelve un HTTP 200
// válido, no un error). `datos` se conserva con la estructura exacta que manda el lector — el
// visor (DocumentoBancarioComponent) la recorre de forma segura, sin imponer un DTO bancario
// rígido, para no romper si el lector añade campos nuevos en el futuro.
export type DocumentoBancarioAnalizado = {
  tipoDocumento: 'bank_document';
  datos: Record<string, unknown>;
  confianza?: number;
  avisos: string[];
  nombreArchivo: string;
  documentoUrl?: string;
  requestId?: string;
};

export function esDocumentoBancarioAnalizado(valor: unknown): valor is DocumentoBancarioAnalizado {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidato = valor as Partial<DocumentoBancarioAnalizado>;
  return candidato.tipoDocumento === 'bank_document'
    && typeof candidato.datos === 'object'
    && candidato.datos !== null
    && !Array.isArray(candidato.datos);
}

function esObjetoBD(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoBD(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
}

function numeroBD(valor: unknown): number | undefined {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim()) {
    const n = Number(valor.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// El lector no sigue un esquema fijo para bank_document (a propósito, ver el comentario de
// arriba) — se prueban varias claves plausibles para cada campo en vez de asumir una sola
// forma exacta, así un documento bancario de otro banco/formato sigue dando algo aprovechable.
function primeroBD<T>(datos: Record<string, unknown>, claves: string[], extractor: (v: unknown) => T | undefined): T | undefined {
  for (const clave of claves) {
    const valor = extractor(datos[clave]);
    if (valor !== undefined) return valor;
  }
  return undefined;
}

// 2026-08-20, pedido explícito: un documento bancario (remesa de cobros, no una compra a un
// proveedor) también debe generar un borrador de Factura Recibida, para completar y guardar —
// NUNCA se guarda directo (a diferencia de crearDesdeDocumentoDirecto con una factura normal):
// aquí no hay proveedor real que resolver ni IVA, así que el borrador siempre necesita revisión
// manual antes de guardar. 'importe' usa el neto/líquido de la remesa si está disponible (lo
// que de verdad se movió), cayendo al nominal si no viene desglosado — decisión confirmada.
export function crearBorradorDesdeDocumentoBancario(
  documento: DocumentoBancarioAnalizado,
  nuevoIdLinea: () => number,
): Omit<FacturaRecibida, 'id'> {
  const datos = documento.datos;
  const importes = esObjetoBD(datos['amounts']) ? datos['amounts'] : {};

  const banco = primeroBD(datos, ['bank', 'bank_name', 'banco'], textoBD);
  const importe = primeroBD(datos, ['net_amount', 'net', 'liquido'], numeroBD)
    ?? primeroBD(importes, ['net', 'net_amount', 'liquido'], numeroBD)
    ?? primeroBD(datos, ['nominal_amount', 'nominal', 'amount'], numeroBD)
    ?? primeroBD(importes, ['nominal', 'nominal_amount', 'amount'], numeroBD)
    ?? 0;
  const fecha = primeroBD(datos, ['value_date', 'document_date', 'reception_date'], textoBD)
    ?? new Date().toISOString().slice(0, 10);
  const referencia = primeroBD(
    datos, ['unique_reference', 'reference', 'file_reference', 'document_number'], textoBD,
  ) ?? '';
  const titulo = primeroBD(datos, ['document_title', 'document_subtype'], textoBD) ?? 'Documento bancario';

  const linea: LineaFactura = {
    id: nuevoIdLinea(),
    origen: 'manual',
    descripcion: titulo,
    cantidad: 1,
    precioUnitario: importe,
    descuentoPct: 0,
    ivaPct: 0,
  };

  return {
    proveedor: banco ? `Banco ${banco}` : 'Documento bancario sin proveedor identificado',
    numFactura: referencia,
    fecha,
    vencimiento: undefined,
    concepto: titulo,
    formaPago: undefined,
    lineas: [linea],
    retencionPct: 0,
    pagada: false,
    estado: 'borrador',
    origenOcr: true,
    documentoUrl: documento.documentoUrl,
    documentoNombre: documento.nombreArchivo,
    avisosOcr: [
      'Borrador generado desde un documento bancario: revisa proveedor, concepto e importe ' +
      'antes de guardar — el lector no identifica proveedor ni IVA en este tipo de documento.',
      ...documento.avisos,
    ],
  };
}
