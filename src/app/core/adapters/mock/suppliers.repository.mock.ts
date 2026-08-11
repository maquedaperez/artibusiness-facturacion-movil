import { Injectable, inject } from '@angular/core';
import { SuppliersRepository } from '../../ports/suppliers.repository';
import { MockFacturasService, ProveedorMock } from '../../../services/mock-facturas.service';

@Injectable()
export class MockSuppliersRepository extends SuppliersRepository {
  private mock = inject(MockFacturasService);

  buscar(query: string): ProveedorMock[] {
    return this.mock.buscarProveedores(query);
  }

  crearAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock {
    return this.mock.crearProveedorAdHoc(data);
  }
}
