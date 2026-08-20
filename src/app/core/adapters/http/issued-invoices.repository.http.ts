import { Injectable, inject } from '@angular/core';
import { IssuedInvoicesRepository } from '../../ports/issued-invoices.repository';
import { MockIssuedInvoicesRepository } from '../mock/issued-invoices.repository.mock';
import { ApiService } from '../../../services/api.service';
import {
  AccionesPermitidas, Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, Numerador, TotalesFactura,
} from '../../../services/mock-facturas.service';

// Mismos endpoints que ya usa el adaptador real de Recibidas (ImpuestoController/
// MediosPagoController) — catálogos genéricos por empresa, no específicos de Recibidas ni
// Emitidas, así que se reutilizan tal cual sin tocar el backend.
const IMPUESTOS_BASE_PATH = '/api/Impuesto';
const MEDIOS_PAGO_BASE_PATH = '/api/MediosPago';
const TIPO_IMPUESTO_IVA = 'IVA';

type ImpuestoApi = {
  idImpuesto: number;
  descripcion: string | null;
  porcentaje: number;
  literalFactura: string | null;
  tipoFacturaE: string | null;
};

type MedioPagoApi = {
  idMedioPago: number;
  descFormaPago: string | null;
  descripcion: string | null;
};

function etiquetaMedioPago(m: MedioPagoApi): string {
  const partes = [m.descFormaPago?.trim(), m.descripcion?.trim()].filter((p): p is string => !!p);
  return partes.length > 0 ? partes.join(' — ') : `Medio de pago ${m.idMedioPago}`;
}

/**
 * Fase 1 del plan de integración de Facturas Emitidas (2026-08-20): arranca el adaptador HTTP
 * real solo con los dos catálogos que ya existen en el backend y son reutilizables sin
 * cambios — sustituyen IVA_RATES/MEDIO_PAGO_OPTIONS hardcodeados. El resto de acciones
 * (listar, guardar, contabilizar, firmar, eliminar, duplicar, generar documento...) sigue
 * delegado al mock hasta que existan sus propios endpoints reales — ver el plan de fases
 * acordado (listado → cliente → guardar → numerador → CRUD → puente FacturaE/VeriFactu).
 *
 * medioPago sigue devolviéndose como string libre (la etiqueta), no como
 * { id, label } con idMedioPago numérico como en Recibidas — restructurar
 * FacturaEmitida.medioPago para llevar el id real es parte de la fase de Guardar, no de esta.
 */
@Injectable()
export class HttpIssuedInvoicesRepository extends IssuedInvoicesRepository {
  private mockAdapter = inject(MockIssuedInvoicesRepository);
  private api = inject(ApiService);

  private impuestosCache: Promise<ImpuestoApi[]> | null = null;
  private mediosPagoCache: Promise<MedioPagoApi[]> | null = null;

  private async obtenerImpuestosApi(): Promise<ImpuestoApi[]> {
    if (!this.impuestosCache) {
      this.impuestosCache = this.api.post<ImpuestoApi[]>(`${IMPUESTOS_BASE_PATH}/Enumerar`, { tipo: TIPO_IMPUESTO_IVA });
    }
    return this.impuestosCache;
  }

  private async obtenerMediosPagoApi(): Promise<MedioPagoApi[]> {
    if (!this.mediosPagoCache) {
      this.mediosPagoCache = this.api.post<MedioPagoApi[]>(`${MEDIOS_PAGO_BASE_PATH}/Enumerar`, {});
    }
    return this.mediosPagoCache;
  }

  async obtenerPorcentajesIva(): Promise<number[]> {
    const catalogo = await this.obtenerImpuestosApi();
    const porcentajes = [...new Set(catalogo.map(i => i.porcentaje))];
    return porcentajes.sort((a, b) => a - b);
  }

  async obtenerMediosPago(): Promise<string[]> {
    const catalogo = await this.obtenerMediosPagoApi();
    return (catalogo ?? []).map(etiquetaMedioPago);
  }

  // --- Todo lo demás sigue delegado al mock hasta su propia fase del plan ---

  getNumeradores(): Numerador[] {
    return this.mockAdapter.getNumeradores();
  }

  numeradorNombre(id: number): string {
    return this.mockAdapter.numeradorNombre(id);
  }

  listar(estado: EstadoFactura, numeradorId: number | null = null): FacturaEmitida[] {
    return this.mockAdapter.listar(estado, numeradorId);
  }

  obtenerPorId(id: number): FacturaEmitida | undefined {
    return this.mockAdapter.obtenerPorId(id);
  }

  crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida {
    return this.mockAdapter.crearBorrador(numeradorId, destinatario);
  }

  actualizarBorrador(
    id: number,
    cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>
  ): void {
    this.mockAdapter.actualizarBorrador(id, cambios);
  }

  nuevoIdLinea(): number {
    return this.mockAdapter.nuevoIdLinea();
  }

  totales(factura: FacturaEmitida): TotalesFactura {
    return this.mockAdapter.totales(factura);
  }

  contabilizar(id: number): void {
    this.mockAdapter.contabilizar(id);
  }

  firmar(id: number): void {
    this.mockAdapter.firmar(id);
  }

  estadoAeatLabel(estado?: EstadoAeat): string {
    return this.mockAdapter.estadoAeatLabel(estado);
  }

  accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas {
    return this.mockAdapter.accionesPermitidas(factura);
  }

  eliminar(id: number): void {
    this.mockAdapter.eliminar(id);
  }

  duplicar(id: number): FacturaEmitida | undefined {
    return this.mockAdapter.duplicar(id);
  }

  generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }> {
    return this.mockAdapter.generarDocumento(id);
  }
}
