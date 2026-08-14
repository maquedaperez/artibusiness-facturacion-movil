import { AccionesPermitidas, FacturaRecibida, TotalesFactura } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para Facturas Recibidas, incluido OCR y documento adjunto — hoy solo se
 * consumen desde este flujo. Si se confirma que OCR es un servicio propio con contrato
 * independiente (docs/SERVICE_CONTRACT_GAPS.md #21), se puede extraer a su propio
 * OcrRepository sin romper este contrato.
 *
 * Backend real (FacturasRecibidasController, confirmado en código — ver
 * AUDITORIA_INTEGRACION_BACKEND.md): listar/obtener/eliminar/crear/actualizar ya están
 * conectados (2026-08-14: Impuestos, Proveedores/Crear y Facturas Recibidas/Eliminar ya
 * publicados). Reeditar una factura YA existente en el backend real sigue bloqueado en la
 * UI (accountingLocked) porque no se puede reconstruir el IVA real por línea de algo ya
 * guardado — ver received-invoices.repository.http.ts.
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

  // Async a propósito — HttpReceivedInvoicesRepository las resuelve contra
  // POST /api/FacturasRecibidas/Guardar de verdad. 'actualizar' recibe la factura completa,
  // no un parche parcial: el backend no admite parches, cada Guardar manda el documento
  // entero. Devuelve la factura ya guardada (con su id real) porque, alcanzable hoy desde
  // la UI, "actualizar" siempre es en realidad "primer guardado real de un borrador local"
  // (reeditar una factura YA real está bloqueado) — el id puede cambiar, así que quien
  // llama necesita el resultado, no basta con asumir que el id de entrada se mantiene.
  abstract crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida>;
  abstract actualizar(id: number, data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida>;
  abstract eliminar(id: number): Promise<void>;

  abstract nuevoIdLinea(): number;
  abstract totales(factura: FacturaRecibida): TotalesFactura;

  abstract crearDesdeOcr(file: File): Promise<FacturaRecibida>;
  abstract adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }>;

  abstract accionesPermitidas(factura: FacturaRecibida): AccionesPermitidas;
  // Recibe la factura completa, no solo el id — a propósito: BUG real encontrado y
  // corregido el 2026-08-13. Con la firma anterior (duplicar(id)), HttpReceivedInvoicesRepository
  // delegaba en el mock, que buscaba el id en su propio almacén en memoria — y las facturas
  // reales del backend NUNCA están ahí (solo viven en la respuesta de Enumerar/Obtener), así
  // que "Copiar" sobre cualquier factura real fallaba en silencio (sin toast, sin error,
  // simplemente no pasaba nada). El caso de llamada siempre tiene ya el objeto completo a
  // mano, así que pasarlo directamente evita la búsqueda y el fallo.
  abstract duplicar(factura: FacturaRecibida): FacturaRecibida;
}
