import {
  AccionesPermitidas, Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, Numerador, TotalesFactura,
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

  // Fase 2 del plan de integración (2026-08-20): pasan a ser asíncronos porque
  // HttpIssuedInvoicesRepository ya habla con el backend real (FacturaEmitidaController) —
  // mismo cambio que ya sufrió ReceivedInvoicesRepository al conectar Recibidas.
  abstract listar(estado: EstadoFactura, numeradorId?: number | null): Promise<FacturaEmitida[]>;
  abstract obtenerPorId(id: number): Promise<FacturaEmitida | undefined>;

  abstract crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida;
  abstract actualizarBorrador(
    id: number,
    cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>
  ): void;
  abstract nuevoIdLinea(): number;

  abstract totales(factura: FacturaEmitida): TotalesFactura;

  // Fase 1 del plan de integración (2026-08-20): los únicos dos catálogos que ya existen en
  // el backend real y son reutilizables tal cual — mismo ImpuestoController/MediosPagoController
  // que ya usa Recibidas, solo hay que llamarlos. Sustituyen IVA_RATES/MEDIO_PAGO_OPTIONS
  // hardcodeados. medioPago sigue siendo un string libre aquí (no idMedioPago numérico como en
  // Recibidas) — restructurar eso es parte de la fase de Guardar real, no de esta.
  abstract obtenerPorcentajesIva(): Promise<number[]>;
  abstract obtenerMediosPago(): Promise<string[]>;

  abstract contabilizar(id: number): void;
  abstract firmar(id: number): void;
  abstract estadoAeatLabel(estado?: EstadoAeat): string;

  // Política centralizada — la pantalla nunca decide por su cuenta si puede
  // editar/eliminar/copiar/descargar/compartir. Ver docs/SERVICE_CONTRACT_GAPS.md.
  abstract accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas;
  abstract eliminar(id: number): void;
  abstract duplicar(id: number): FacturaEmitida | undefined;
  abstract generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }>;
}
