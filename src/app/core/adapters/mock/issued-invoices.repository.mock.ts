import { Injectable, inject } from '@angular/core';
import { IssuedInvoicesRepository } from '../../ports/issued-invoices.repository';
import {
  Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, MockFacturasService, Numerador, TotalesFactura,
} from '../../../services/mock-facturas.service';

@Injectable()
export class MockIssuedInvoicesRepository extends IssuedInvoicesRepository {
  private mock = inject(MockFacturasService);

  getNumeradores(): Numerador[] {
    return this.mock.getNumeradores();
  }

  numeradorNombre(id: number): string {
    return this.mock.numeradorNombre(id);
  }

  listar(estado: EstadoFactura, numeradorId: number | null = null): FacturaEmitida[] {
    return this.mock.getFacturasEmitidas(estado, numeradorId);
  }

  obtenerPorId(id: number): FacturaEmitida | undefined {
    return this.mock.getFacturaById(id);
  }

  crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida {
    return this.mock.crearBorrador(numeradorId, destinatario);
  }

  actualizarBorrador(
    id: number,
    cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>
  ): void {
    this.mock.actualizarBorrador(id, cambios);
  }

  nuevoIdLinea(): number {
    return this.mock.nuevoIdLinea();
  }

  totales(factura: FacturaEmitida): TotalesFactura {
    return this.mock.totalesFactura(factura);
  }

  contabilizar(id: number): void {
    this.mock.contabilizar(id);
  }

  firmar(id: number): void {
    this.mock.firmar(id);
  }

  estadoAeatLabel(estado?: EstadoAeat): string {
    return this.mock.estadoAeatLabel(estado);
  }
}
