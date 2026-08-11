import { Injectable, inject } from '@angular/core';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository';
import { MockFacturasService, Suscripcion } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

@Injectable()
export class MockSubscriptionsRepository extends SubscriptionsRepository {
  private mock = inject(MockFacturasService);

  buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<Suscripcion>> {
    return this.mock.buscarSuscripcionesPaginado(query, page, pageSize);
  }
}
