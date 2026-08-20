import { Injectable, inject } from '@angular/core';
import { DatosGuardarFacturaEmitida, IssuedInvoicesRepository } from '../../ports/issued-invoices.repository';
import { MedioPagoOpcion } from '../../ports/received-invoices.repository';
import {
  AccionesPermitidas, Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, IVA_RATES, MEDIO_PAGO_OPTIONS,
  MockFacturasService, Numerador, TotalesFactura, accionesFacturaEmitida,
} from '../../../services/mock-facturas.service';

@Injectable()
export class MockIssuedInvoicesRepository extends IssuedInvoicesRepository {
  private mock = inject(MockFacturasService);

  getNumeradores(): Numerador[] {
    return this.mock.getNumeradores();
  }

  async obtenerNumeradores(): Promise<Numerador[]> {
    return this.mock.getNumeradores();
  }

  numeradorNombre(id: number): string {
    return this.mock.numeradorNombre(id);
  }

  async listar(estado: EstadoFactura, numeradorId: number | null = null): Promise<FacturaEmitida[]> {
    return this.mock.getFacturasEmitidas(estado, numeradorId);
  }

  async obtenerPorId(id: number): Promise<FacturaEmitida | undefined> {
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

  async obtenerPorcentajesIva(): Promise<number[]> {
    return IVA_RATES;
  }

  async obtenerMediosPago(): Promise<MedioPagoOpcion[]> {
    return MEDIO_PAGO_OPTIONS.map((label, i) => ({ id: i + 1, label }));
  }

  async guardar(id: number, cambios: DatosGuardarFacturaEmitida): Promise<FacturaEmitida> {
    // Object.assign en actualizarBorrador() copia TODAS las claves propias de 'cambios' sobre
    // la factura del almacén (incluidas idMedioPago/idCliente, aunque el Pick del mock no las
    // declare) — no hace falta copiarlas aparte.
    this.mock.actualizarBorrador(id, cambios);
    const guardada = this.mock.getFacturaById(id);
    if (!guardada) throw new Error(`Factura ${id} no encontrada.`);
    return guardada;
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

  accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas {
    return accionesFacturaEmitida(factura);
  }

  eliminar(id: number): void {
    this.mock.eliminarEmitida(id);
  }

  duplicar(id: number): FacturaEmitida | undefined {
    return this.mock.duplicarEmitida(id);
  }

  generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }> {
    return this.mock.generarDocumentoEmitida(id);
  }
}
