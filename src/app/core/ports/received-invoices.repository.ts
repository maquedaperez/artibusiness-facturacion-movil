import { FacturaRecibida } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para Facturas Recibidas, incluido OCR y documento adjunto — hoy solo se
 * consumen desde este flujo. Si se confirma que OCR es un servicio propio con contrato
 * independiente (docs/SERVICE_CONTRACT_GAPS.md #21), se puede extraer a su propio
 * OcrRepository sin romper este contrato.
 *
 * Backend real: no existe nada todavía salvo la sugerencia de
 * POST /api/FacturaRecibida/desde-ocr en CONTEXTO_FACTURACION.md — ver gap #13.
 */
export abstract class ReceivedInvoicesRepository {
  abstract listar(): FacturaRecibida[];
  abstract obtenerPorId(id: number): FacturaRecibida | undefined;

  abstract crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida;
  abstract actualizar(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): void;
  abstract eliminar(id: number): void;

  abstract crearDesdeOcr(file: File): Promise<FacturaRecibida>;
  abstract adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }>;
}
