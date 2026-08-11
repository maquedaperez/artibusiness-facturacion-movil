import { Injectable, inject } from '@angular/core';
import { EmisorRepository } from '../../ports/emisor.repository';
import { EmisorFiscal, MockFacturasService } from '../../../services/mock-facturas.service';

@Injectable()
export class MockEmisorRepository extends EmisorRepository {
  private mock = inject(MockFacturasService);

  getEmisor(): EmisorFiscal {
    return this.mock.getEmisor();
  }

  actualizarEmisor(data: EmisorFiscal): void {
    this.mock.actualizarEmisor(data);
  }
}
