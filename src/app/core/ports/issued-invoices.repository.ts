import {
  Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, Numerador, TotalesFactura,
} from '../../services/mock-facturas.service';

/**
 * Puerto tipado para Facturas Emitidas. Incluye Numeradores porque hoy solo se consume
 * desde aquí (selector de serie) — si en el futuro se confirma un endpoint propio de
 * Numeradores (docs/SERVICE_CONTRACT_GAPS.md #7) se puede extraer a su propio puerto sin
 * romper este contrato.
 *
 * El estado AEAT/VeriFactu (`estadoAeatLabel`) es solo lectura de lo que devuelva el
 * servicio externo de FacturaE — este repositorio NUNCA debe calcular ni fabricar ese
 * estado por su cuenta cuando exista el HttpIssuedInvoicesRepository real.
 *
 * Backend real: no existen los endpoints de listar/detalle/editar/contabilizar/firmar
 * todavía — ver docs/SERVICE_CONTRACT_GAPS.md #7, #9, #10, #11, #12, #14.
 */
export abstract class IssuedInvoicesRepository {
  abstract getNumeradores(): Numerador[];
  abstract numeradorNombre(id: number): string;

  abstract listar(estado: EstadoFactura, numeradorId?: number | null): FacturaEmitida[];
  abstract obtenerPorId(id: number): FacturaEmitida | undefined;

  abstract crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida;
  abstract actualizarBorrador(
    id: number,
    cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>
  ): void;
  abstract nuevoIdLinea(): number;

  abstract totales(factura: FacturaEmitida): TotalesFactura;

  abstract contabilizar(id: number): void;
  abstract firmar(id: number): void;
  abstract estadoAeatLabel(estado?: EstadoAeat): string;
}
