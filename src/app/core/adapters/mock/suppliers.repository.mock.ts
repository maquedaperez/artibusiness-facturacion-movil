import { Injectable, inject } from '@angular/core';
import { SuppliersRepository } from '../../ports/suppliers.repository';
import { MockFacturasService, ProveedorMock } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

@Injectable()
export class MockSuppliersRepository extends SuppliersRepository {
  private mock = inject(MockFacturasService);

  buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ProveedorMock>> {
    return this.mock.buscarProveedoresPaginado(query, page, pageSize);
  }

  crearAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock {
    return this.mock.crearProveedorAdHoc(data);
  }
}
