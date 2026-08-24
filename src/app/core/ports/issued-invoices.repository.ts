import {
  AccionesPermitidas, Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, Numerador, TotalesFactura,
} from '../../services/mock-facturas.service';
import { MedioPagoOpcion } from './received-invoices.repository';

// Fase 4 del plan de integración (2026-08-20): campos que de verdad viajan a Guardar. Un
// subconjunto de FacturaEmitida — nunca el objeto completo (id/estado/estadoAeat/operacionId
// los decide el backend, no el cliente).
export type DatosGuardarFacturaEmitida = Pick<
  FacturaEmitida,
  'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'idMedioPago' | 'destinatario' | 'lineas' | 'numeradorId' | 'idCliente'
>;

/**
 * Puerto tipado para Facturas Emitidas. Incluye Numeradores porque hoy solo se consume
 * desde aquí (selector de serie) — si en el futuro se confirma un endpoint propio de
 * Numeradores (docs/SERVICE_CONTRACT_GAPS.md #7) se puede extraer a su propio puerto sin
 * romper este contrato.
 *
 * El estado AEAT/VeriFactu (`estadoAeatLabel`) es solo lectura de lo que devuelva el
 * servicio externo de FacturaE — este repositorio NUNCA debe calcular ni fabricar ese
 * estado por su cuenta cuando exista el HttpIssuedInvoicesRepository real.
 */
export abstract class IssuedInvoicesRepository {
  // getNumeradores() sigue siendo síncrono y respaldado por el mock (2 series de ejemplo) —
  // se usa para no bloquear el primer render. obtenerNumeradores() (Fase 4) es el catálogo
  // real, asíncrono, que sustituye esos valores en cuanto carga — mismo patrón ya usado en
  // Fase 1 con ivaRates/medioPagoOptions.
  abstract getNumeradores(): Numerador[];
  abstract obtenerNumeradores(): Promise<Numerador[]>;
  abstract numeradorNombre(id: number): string;

  // Fase 2 del plan de integración (2026-08-20): pasan a ser asíncronos porque
  // HttpIssuedInvoicesRepository ya habla con el backend real (FacturaEmitidaController) —
  // mismo cambio que ya sufrió ReceivedInvoicesRepository al conectar Recibidas.
  abstract listar(estado: EstadoFactura, numeradorId?: number | null): Promise<FacturaEmitida[]>;
  abstract obtenerPorId(id: number): Promise<FacturaEmitida | undefined>;

  // crearBorrador/actualizarBorrador siguen siendo el borrador LOCAL, sin guardar — mismo rol
  // que crearBorrador en el flujo del mock puro. guardar() (Fase 4) es quien persiste de
  // verdad contra el backend: recibe el id local o real y decide alta vs actualización, igual
  // que ReceivedInvoicesRepository.actualizar().
  abstract crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida;
  abstract actualizarBorrador(
    id: number,
    cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>
  ): void;
  abstract guardar(id: number, cambios: DatosGuardarFacturaEmitida): Promise<FacturaEmitida>;
  abstract nuevoIdLinea(): number;

  abstract totales(factura: FacturaEmitida): TotalesFactura;

  // Fase 1 del plan de integración (2026-08-20): catálogos reales — mismo
  // ImpuestoController/MediosPagoController que ya usa Recibidas. obtenerMediosPago pasa a
  // devolver {id, label} en vez de string[] (Fase 4): Guardar exige idMedioPago numérico, no
  // basta con la etiqueta.
  abstract obtenerPorcentajesIva(): Promise<number[]>;
  abstract obtenerMediosPago(): Promise<MedioPagoOpcion[]>;

  // Fase 7 del plan de integración (2026-08-21): pasan a ser asíncronos —
  // HttpIssuedInvoicesRepository ya llama de verdad a FacturaEmitidaController.Contabilizar/
  // Firmar (que a su vez llama a FacturaE/AEAT), y devuelve la factura con el EstadoAeat real
  // que haya contestado FacturaE, no uno inventado en el cliente.
  abstract contabilizar(id: number): Promise<FacturaEmitida>;
  abstract firmar(id: number): Promise<FacturaEmitida>;
  // Fase 7 (Anular, 2026-08-22): crea un registro de anulación real en FacturaE/VERI*FACTU —
  // el Alta original nunca se modifica ni se borra. Solo tiene sentido sobre una factura ya
  // contabilizada (con registro VERI*FACTU); el backend rechaza cualquier otro caso.
  abstract anular(id: number): Promise<FacturaEmitida>;
  abstract estadoAeatLabel(estado?: EstadoAeat): string;

  // Política centralizada — la pantalla nunca decide por su cuenta si puede
  // editar/eliminar/copiar/descargar/compartir. Ver docs/SERVICE_CONTRACT_GAPS.md.
  abstract accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas;
  // Fase 6 del plan de integración (2026-08-20): pasan a ser asíncronos — HttpIssuedInvoicesRepository
  // ya habla con el backend real para las dos (DELETE .../{id} y, para duplicar, reutilizando
  // guardar() con un borrador nuevo). Mismo cambio que ya sufrieron listar/obtenerPorId en Fase 2.
  abstract eliminar(id: number): Promise<void>;
  abstract duplicar(id: number): Promise<FacturaEmitida | undefined>;
  abstract generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }>;
}
