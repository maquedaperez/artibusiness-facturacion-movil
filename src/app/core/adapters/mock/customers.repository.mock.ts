import { Injectable, inject } from '@angular/core';
import { CustomersRepository } from '../../ports/customers.repository';
import { ClienteMock, Destinatario, MockFacturasService } from '../../../services/mock-facturas.service';

@Injectable()
export class MockCustomersRepository extends CustomersRepository {
  private mock = inject(MockFacturasService);

  buscar(query: string): ClienteMock[] {
    return this.mock.buscarClientes(query);
  }

  crearAdHoc(data: Destinatario): ClienteMock {
    return this.mock.crearClienteAdHoc(data);
  }
}
