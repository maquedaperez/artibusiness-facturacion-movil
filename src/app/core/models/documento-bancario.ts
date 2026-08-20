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
