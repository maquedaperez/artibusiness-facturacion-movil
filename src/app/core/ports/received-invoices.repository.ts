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
// Subconjunto de filtros de Enumerar que de verdad viajan al backend — no todo lo que se
// puede filtrar en pantalla: el rango de fechas se queda fuera porque Enumerar solo admite
// año+mes, no un rango arbitrario, así que ese sigue aplicándose en el cliente, sobre lo
// que haya devuelto listar() — ver facturas-recibidas.page.ts.
export type FiltrosListarRecibidas = {
  // Busca por nombre de proveedor (Enumerar: NombreProveedor, LIKE) — a diferencia del
  // buscador anterior, ya NO mira 'concepto': ese campo no lo admite el backend, y
  // mantenerlo solo en cliente habría exigido descargar todo para no perder resultados.
  query?: string;
  pagada?: boolean;
  // Confirmado con el jefe: Facturas Recibidas reutiliza los mismos valores de Estado que
  // Emitidas — 131 = borrador, 132 = revisada (aquí nunca 133/"firmada", Recibidas no pasa
  // por ahí). El mapeo a estos dos valores numéricos vive en received-invoices.repository.http.ts.
  estado?: 'borrador' | 'revisada';
};

export abstract class ReceivedInvoicesRepository {
  // Async a propósito: HttpReceivedInvoicesRepository los resuelve contra
  // POST /api/FacturasRecibidas/Enumerar y GET /api/FacturasRecibidas/{id} (backend real,
  // confirmado — ver AUDITORIA_INTEGRACION_BACKEND.md). filtros viaja tal cual al backend
  // (Enumerar ya los soporta) en vez de descargarlo todo y filtrar en el cliente — así la
  // búsqueda encuentra facturas antiguas aunque no quepan en el límite de página.
  abstract listar(filtros?: FiltrosListarRecibidas): Promise<FacturaRecibida[]>;
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
