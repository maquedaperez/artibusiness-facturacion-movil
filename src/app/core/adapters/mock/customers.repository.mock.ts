import { Injectable, inject } from '@angular/core';
import { CustomersRepository } from '../../ports/customers.repository';
import { ClienteMock, Destinatario, MockFacturasService } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

@Injectable()
export class MockCustomersRepository extends CustomersRepository {
  private mock = inject(MockFacturasService);

  buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ClienteMock>> {
    return this.mock.buscarClientesPaginado(query, page, pageSize);
  }

  async crearAdHoc(data: Destinatario, idMedioPago: number): Promise<ClienteMock> {
    return this.mock.crearClienteAdHoc(data, idMedioPago);
  }
}
