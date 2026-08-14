import { Injectable, inject } from '@angular/core';
import { FiltrosListarRecibidas, MedioPagoOpcion, ReceivedInvoicesRepository } from '../../ports/received-invoices.repository';
import {
  AccionesPermitidas, FacturaRecibida, IVA_RATES, MEDIO_PAGO_OPTIONS, MockFacturasService, TotalesFactura,
  accionesFacturaRecibida,
} from '../../../services/mock-facturas.service';

@Injectable()
export class MockReceivedInvoicesRepository extends ReceivedInvoicesRepository {
  private mock = inject(MockFacturasService);

  // Replica en memoria el mismo filtrado que hace Enumerar en el backend real (por
  // proveedor, pagada y estado) — así el comportamiento no cambia al pasar de mock a real.
  async listar(filtros?: FiltrosListarRecibidas): Promise<FacturaRecibida[]> {
    const todas = this.mock.getFacturasRecibidas();
    if (!filtros) return todas;

    const query = filtros.query?.trim().toLowerCase();
    return todas.filter(f => {
      if (query && !f.proveedor.toLowerCase().includes(query)) return false;
      if (filtros.pagada !== undefined && f.pagada !== filtros.pagada) return false;
      if (filtros.estado !== undefined && f.estado !== filtros.estado) return false;
      return true;
    });
  }

  async obtenerPorId(id: number): Promise<FacturaRecibida | undefined> {
    return this.mock.getFacturaRecibidaById(id);
  }

  async crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida> {
    return this.mock.crearManual(data);
  }

  // No forma parte del puerto ReceivedInvoicesRepository — la usa directamente el
  // adaptador HTTP real de OCR (received-invoices.repository.ocr-http.ts) para
  // persistir una extracción real en el mismo almacén en memoria que sigue sirviendo
  // al resto de Recibidas mientras esos endpoints no existan (gap #13).
  registrarRecibidaExtraida(data: Omit<FacturaRecibida, 'id'>): FacturaRecibida {
    return this.mock.registrarRecibidaExtraida(data);
  }

  async actualizar(id: number, data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida> {
    const actualizada = this.mock.actualizarRecibida(id, data);
    if (!actualizada) throw new Error(`No se pudo actualizar la factura ${id}: no existe o está bloqueada.`);
    return actualizada;
  }

  async eliminar(id: number): Promise<void> {
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

  duplicar(factura: FacturaRecibida): FacturaRecibida {
    return this.mock.duplicarRecibida(factura);
  }

  // Sin backend real detrás en modo mock: se simula el catálogo con ids secuenciales fijos
  // a partir de la misma lista de nombres que ya usaba el campo de texto libre.
  async obtenerMediosPago(): Promise<MedioPagoOpcion[]> {
    return MEDIO_PAGO_OPTIONS.map((label, i) => ({ id: i + 1, label }));
  }

  async obtenerPorcentajesIva(): Promise<number[]> {
    return IVA_RATES;
  }
}
