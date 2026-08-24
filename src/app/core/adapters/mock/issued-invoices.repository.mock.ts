import { Injectable, inject } from '@angular/core';
import { DatosGuardarFacturaEmitida, IssuedInvoicesRepository, PrevisualizacionSubsanacion } from '../../ports/issued-invoices.repository';
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

  async contabilizar(id: number): Promise<FacturaEmitida> {
    this.mock.contabilizar(id);
    const factura = this.mock.getFacturaById(id);
    if (!factura) throw new Error(`Factura ${id} no encontrada.`);
    return factura;
  }

  async firmar(id: number): Promise<FacturaEmitida> {
    this.mock.firmar(id);
    const factura = this.mock.getFacturaById(id);
    if (!factura) throw new Error(`Factura ${id} no encontrada.`);
    return factura;
  }

  async anular(id: number): Promise<FacturaEmitida> {
    this.mock.anular(id);
    const factura = this.mock.getFacturaById(id);
    if (!factura) throw new Error(`Factura ${id} no encontrada.`);
    return factura;
  }

  async subsanar(id: number, motivo: string): Promise<FacturaEmitida> {
    this.mock.subsanar(id, motivo);
    const factura = this.mock.getFacturaById(id);
    if (!factura) throw new Error(`Factura ${id} no encontrada.`);
    return factura;
  }

  estadoAeatLabel(estado?: EstadoAeat): string {
    return this.mock.estadoAeatLabel(estado);
  }

  estadoSubsanacionLabel(estado?: string): string {
    return this.mock.estadoSubsanacionLabel(estado);
  }

  // Simulación: una factura ya subsanada no tiene, de nuevo, ningún cambio pendiente (nada más
  // ha tocado el catálogo simulado desde entonces); una todavía no subsanada sí lo tiene, para
  // poder probar el flujo completo en modo demo.
  async previsualizarSubsanacion(id: number): Promise<PrevisualizacionSubsanacion> {
    const f = this.mock.getFacturaById(id);
    if (!f) throw new Error(`Factura ${id} no encontrada.`);
    if (f.estado === 'borrador') throw new Error('Solo se puede subsanar una factura ya contabilizada.');
    if (f.anulada) throw new Error('Esta factura está anulada; no se puede subsanar.');
    if (f.subsanada) return { hayDiferencias: false, diferencias: [] };
    return {
      hayDiferencias: true,
      diferencias: [
        { campo: 'Descripción de la operación (simulado)', valorAnterior: f.concepto, valorNuevo: `${f.concepto} (corregido)` },
      ],
    };
  }

  accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas {
    return accionesFacturaEmitida(factura);
  }

  async eliminar(id: number): Promise<void> {
    this.mock.eliminarEmitida(id);
  }

  async duplicar(id: number): Promise<FacturaEmitida | undefined> {
    return this.mock.duplicarEmitida(id);
  }

  generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }> {
    return this.mock.generarDocumentoEmitida(id);
  }
}
