import { AccionesPermitidas, FacturaRecibida, TotalesFactura } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para Facturas Recibidas, incluido OCR y documento adjunto — hoy solo se
 * consumen desde este flujo. Si se confirma que OCR es un servicio propio con contrato
 * independiente (docs/SERVICE_CONTRACT_GAPS.md #21), se puede extraer a su propio
 * OcrRepository sin romper este contrato.
 *
 * Backend real (FacturasRecibidasController, confirmado en código — ver
 * AUDITORIA_INTEGRACION_BACKEND.md): listar/obtener ya están conectados. crear/editar/
 * eliminar siguen en el mock porque Guardar exige id_proveedor/id_impuesto/id_TipoFactura
 * (claves foráneas reales) y el backend todavía no expone los catálogos para resolverlas
 * — conectar en cuanto existan.
 */
export abstract class ReceivedInvoicesRepository {
  // Async a propósito: HttpReceivedInvoicesRepository los resuelve contra
  // POST /api/FacturasRecibidas/Enumerar y GET /api/FacturasRecibidas/{id} (backend real,
  // confirmado — ver AUDITORIA_INTEGRACION_BACKEND.md).
  abstract listar(): Promise<FacturaRecibida[]>;
  abstract obtenerPorId(id: number): Promise<FacturaRecibida | undefined>;

  abstract crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida;
  abstract actualizar(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): void;
  abstract eliminar(id: number): void;

  abstract nuevoIdLinea(): number;
  abstract totales(factura: FacturaRecibida): TotalesFactura;

  abstract crearDesdeOcr(file: File): Promise<FacturaRecibida>;
  abstract adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }>;

  abstract accionesPermitidas(factura: FacturaRecibida): AccionesPermitidas;
  abstract duplicar(id: number): FacturaRecibida | undefined;
}
