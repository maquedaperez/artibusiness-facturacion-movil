import { Injectable, inject } from '@angular/core';
import { FiltrosListarRecibidas, ReceivedInvoicesRepository } from '../../ports/received-invoices.repository';
import {
  AccionesPermitidas, FacturaRecibida, MockFacturasService, TotalesFactura,
  accionesFacturaRecibida,
} from '../../../services/mock-facturas.service';

@Injectable()
export class MockReceivedInvoicesRepository extends ReceivedInvoicesRepository {
  private mock = inject(MockFacturasService);

  // Replica en memoria el mismo filtrado que hace Enumerar en el backend real (por
  // proveedor y pagada) — así el comportamiento no cambia al pasar de mock a real.
  async listar(filtros?: FiltrosListarRecibidas): Promise<FacturaRecibida[]> {
    const todas = this.mock.getFacturasRecibidas();
    if (!filtros) return todas;

    const query = filtros.query?.trim().toLowerCase();
    return todas.filter(f => {
      if (query && !f.proveedor.toLowerCase().includes(query)) return false;
      if (filtros.pagada !== undefined && f.pagada !== filtros.pagada) return false;
      return true;
    });
  }

  async obtenerPorId(id: number): Promise<FacturaRecibida | undefined> {
    return this.mock.getFacturaRecibidaById(id);
  }

  crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida {
    return this.mock.crearManual(data);
  }

  // No forma parte del puerto ReceivedInvoicesRepository — la usa directamente el
  // adaptador HTTP real de OCR (received-invoices.repository.ocr-http.ts) para
  // persistir una extracción real en el mismo almacén en memoria que sigue sirviendo
  // al resto de Recibidas mientras esos endpoints no existan (gap #13).
  registrarRecibidaExtraida(data: Omit<FacturaRecibida, 'id'>): FacturaRecibida {
    return this.mock.registrarRecibidaExtraida(data);
  }

  actualizar(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): void {
    this.mock.actualizarRecibida(id, cambios);
  }

  eliminar(id: number): void {
    this.mock.eliminarRecibida(id);
  }

  nuevoIdLinea(): number {
    return this.mock.nuevoIdLineaRecibida();
  }

  totales(factura: FacturaRecibida): TotalesFactura {
    return this.mock.totalesFacturaRecibida(factura);
  }

  crearDesdeOcr(file: File): Promise<FacturaRecibida> {
    return this.mock.crearDesdeOcr(file);
  }

  adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }> {
    return this.mock.adjuntarDocumento(file);
  }

  accionesPermitidas(factura: FacturaRecibida): AccionesPermitidas {
    return accionesFacturaRecibida(factura);
  }

  duplicar(id: number): FacturaRecibida | undefined {
    return this.mock.duplicarRecibida(id);
  }
}
