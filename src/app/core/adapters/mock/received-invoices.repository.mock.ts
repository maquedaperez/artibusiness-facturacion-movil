import { Injectable, inject } from '@angular/core';
import { ReceivedInvoicesRepository } from '../../ports/received-invoices.repository';
import { FacturaRecibida, MockFacturasService } from '../../../services/mock-facturas.service';

@Injectable()
export class MockReceivedInvoicesRepository extends ReceivedInvoicesRepository {
  private mock = inject(MockFacturasService);

  listar(): FacturaRecibida[] {
    return this.mock.getFacturasRecibidas();
  }

  obtenerPorId(id: number): FacturaRecibida | undefined {
    return this.mock.getFacturaRecibidaById(id);
  }

  crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida {
    return this.mock.crearManual(data);
  }

  actualizar(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): void {
    this.mock.actualizarRecibida(id, cambios);
  }

  eliminar(id: number): void {
    this.mock.eliminarRecibida(id);
  }

  crearDesdeOcr(file: File): Promise<FacturaRecibida> {
    return this.mock.crearDesdeOcr(file);
  }

  adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }> {
    return this.mock.adjuntarDocumento(file);
  }
}
