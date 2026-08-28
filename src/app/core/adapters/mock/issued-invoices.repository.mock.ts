import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DatosGuardarFacturaEmitida, IssuedInvoicesRepository, PrevisualizacionSubsanacion } from '../../ports/issued-invoices.repository';
import { MedioPagoOpcion } from '../../ports/received-invoices.repository';
import {
  AccionesPermitidas, Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, IVA_RATES, MEDIO_PAGO_OPTIONS,
  MockFacturasService, Numerador, TotalesFactura, accionesFacturaEmitida,
} from '../../../services/mock-facturas.service';

@Injectable()
export class MockIssuedInvoicesRepository extends IssuedInvoicesRepository {
  private mock = inject(MockFacturasService);
  private transloco = inject(TranslocoService);

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
    if (!f) throw new Error(this.transloco.translate('invoices.issued.errors.notFoundWithId', { id }));
    if (f.estado === 'borrador') throw new Error(this.transloco.translate('verifactu.errors.subsanarBorrador'));
    if (f.anulada) throw new Error(this.transloco.translate('verifactu.errors.subsanarAnulada'));
    if (f.subsanada) return { hayDiferencias: false, diferencias: [] };
    return {
      hayDiferencias: true,
      diferencias: [
        { campo: this.transloco.translate('invoices.issued.correct.simulatedFieldLabel'), valorAnterior: f.concepto, valorNuevo: `${f.concepto} (corregido)` },
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

  async obtenerPdfReal(id: number): Promise<Blob> {
    // Modo mock puro: no hay backend real ni FacturaE detrás, así que no existe ningún PDF
    // real que traer — se reutiliza el mismo simulado que generarDocumento() para no dejar
    // el modo demo sin nada que mostrar/descargar.
    const { blob } = await this.mock.generarDocumentoEmitida(id);
    return blob;
  }

  async obtenerXsigReal(id: number): Promise<Blob> {
    // Mismo criterio que obtenerPdfReal — modo mock puro, sin .xsig real que traer.
    const { blob } = await this.mock.generarDocumentoEmitida(id);
    return blob;
  }
}
