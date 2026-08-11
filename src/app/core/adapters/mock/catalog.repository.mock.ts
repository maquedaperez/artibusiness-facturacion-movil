import { Injectable, inject } from '@angular/core';
import { CatalogRepository } from '../../ports/catalog.repository';
import { MockFacturasService, ProductoCatalogo } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

@Injectable()
export class MockCatalogRepository extends CatalogRepository {
  private mock = inject(MockFacturasService);

  buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ProductoCatalogo>> {
    return this.mock.buscarCatalogoPaginado(query, page, pageSize);
  }
}
