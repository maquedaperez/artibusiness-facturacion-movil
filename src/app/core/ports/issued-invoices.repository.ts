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
  | 'esSimplificada'
>;

// Fase 7 (Subsanar, blindaje 2026-08-24): campo a campo del contenido fiscal (Desglose/Cuota/
// Importe/Destinatario/Descripción) que cambiaría respecto al último registro confirmado —
// ver FacturaEmitidaAeatService.ExtraerCamposFiscales en el backend. Sin diferencias, subsanar()
// no tiene nada real que corregir y el backend lo rechaza.
export type DiferenciaCampoFiscal = {
  campo: string;
  valorAnterior: string;
  valorNuevo: string;
};

export type PrevisualizacionSubsanacion = {
  hayDiferencias: boolean;
  diferencias: DiferenciaCampoFiscal[];
};

// Cobro de un ticket via Stripe Connect (Fase 3, 2026-09-02): "PENDING" | "PAID" | "FAILED" |
// "CANCELED" | "REFUNDED" — mismo catálogo que Facturacion$FacturasEmitidasCobros.Estado en el
// backend. A diferencia del cobro manual (que crea la fila ya en PAID), aquí SIEMPRE pasa
// primero por PENDING mientras se espera la confirmación real del webhook de Stripe.
export type CobroFactura = {
  id: number;
  proveedor: string;
  medio: string | null;
  estado: string;
  importe: number;
  moneda: string;
  fechaCreacionUtc: string;
  fechaConfirmacionUtc: string | null;
};

// Capacidades de Stripe Connect (2026-09-02): NUNCA se muestra "Cobrar con tarjeta" sin
// consultar esto antes. GET /api/PagosConnect/estado devuelve 503 mientras
// StripeConnect:Enabled=false (todo el MVP, hasta que exista infraestructura real) — cualquier
// fallo al consultarlo (503, red, lo que sea) se interpreta como "no disponible", nunca como un
// error que deba mostrarse: la ausencia de este botón es un estado normal del MVP, no un fallo.
export type EstadoStripeConnect = {
  // true SOLO si el módulo está activo, la empresa tiene una cuenta conectada y esa cuenta ya
  // puede cobrar (chargesEnabled=true) — cualquier otra combinación deja el botón oculto, para
  // no ofrecer una acción que el backend seguiría rechazando con 503.
  disponible: boolean;
};

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
  // Fase 7 (Subsanar, 2026-08-24): NO es un editor de la factura — cliente/líneas/importes no
  // cambian (si de verdad están mal, corresponde una rectificativa, no esto). Vuelve a emitir el
  // registro fiscal a partir de los mismos datos ya guardados, con un motivo obligatorio, y
  // enlaza siempre con el Alta original — nunca con una subsanación anterior.
  abstract subsanar(id: number, motivo: string): Promise<FacturaEmitida>;
  // Blindaje (2026-08-24): recalcula el contenido fiscal SIN llamar a FacturaE ni cambiar nada —
  // deja ver qué campos van a cambiar antes de confirmar, y si no hay ninguno, subsanar() lo
  // rechazará igualmente (esto es solo para no hacer descubrir el rechazo tras confirmar).
  abstract previsualizarSubsanacion(id: number): Promise<PrevisualizacionSubsanacion>;
  abstract estadoAeatLabel(estado?: EstadoAeat): string;
  abstract estadoSubsanacionLabel(estado?: string): string;

  // Política centralizada — la pantalla nunca decide por su cuenta si puede
  // editar/eliminar/copiar/descargar/compartir. Ver docs/SERVICE_CONTRACT_GAPS.md.
  abstract accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas;
  // Fase 6 del plan de integración (2026-08-20): pasan a ser asíncronos — HttpIssuedInvoicesRepository
  // ya habla con el backend real para las dos (DELETE .../{id} y, para duplicar, reutilizando
  // guardar() con un borrador nuevo). Mismo cambio que ya sufrieron listar/obtenerPorId en Fase 2.
  abstract eliminar(id: number): Promise<void>;
  // Facturas simplificadas emitidas (2026-09-02): un borrador puramente local (esBorradorLocal
  // === true, nunca guardado de verdad) todavía no ha consumido ningún número fiscal — puede
  // descartarse sin más. eliminar() SIEMPRE intenta primero un DELETE HTTP real (y solo cae al
  // mock tras un 404), lo cual no tiene sentido para algo que el backend nunca ha visto; el
  // llamador debe usar descartarLocal() en su lugar cuando f.esBorradorLocal es true, para no
  // depender de que el backend responda 404 a una petición que no debería hacerse.
  abstract descartarLocal(id: number): Promise<void>;
  // Cobro de tickets/facturas emitidas (Fase 2, 2026-09-02): "confirmar" y "cobrar" son el mismo
  // acto en manual — no hay un paso asíncrono como en Stripe. NUNCA contabiliza ni genera número
  // ni registro fiscal por sí solo; devuelve la factura actualizada (con cobrada=true) para que
  // la pantalla la refresque sin tener que recargar la lista entera. medio: 'EFECTIVO' |
  // 'TRANSFERENCIA' | 'TPV_EXTERNA' | 'TARJETA' | 'BIZUM'.
  abstract marcarComoCobrado(id: number, medio: string, importe: number): Promise<FacturaEmitida>;

  // Stripe Connect (Fase 3, 2026-09-02) — cobro de un ticket con tarjeta. A diferencia del
  // manual, aquí SIEMPRE hay que consultar obtenerEstadoStripeConnect() antes de ofrecer la
  // acción (ver EstadoStripeConnect): mientras no exista infraestructura real, este método no
  // debe ni intentarse llamar desde la UI. checkoutUrl es null cuando el cobro ya estaba
  // resuelto (pagado/fallido/cancelado) y no hay nada que reabrir.
  abstract obtenerEstadoStripeConnect(): Promise<EstadoStripeConnect>;
  abstract iniciarCobroStripe(id: number): Promise<{ checkoutUrl: string | null }>;
  // Sondeado por la pantalla tras abrir el checkout — el cliente puede pagar desde OTRO
  // dispositivo, así que la confirmación nunca llega por el redirect del navegador, solo por
  // ver aquí un cobro STRIPE en estado PAID (confirmado por el webhook).
  abstract obtenerCobros(id: number): Promise<CobroFactura[]>;

  abstract duplicar(id: number): Promise<FacturaEmitida | undefined>;
  abstract generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }>;
  // PDF real (2026-08-27): solo existe una vez contabilizada/firmada — lo genera y publica
  // FacturaE en Blob Storage al contabilizar, servido por un endpoint propio protegido, nunca
  // una URL pública. A diferencia de generarDocumento (siempre simulado), este SÍ es el
  // documento fiscal real. Ver FacturaEmitidaController.DescargarPdf.
  abstract obtenerPdfReal(id: number): Promise<Blob>;
  // .xsig real (2026-08-27): solo existe una vez firmada — ver FacturaEmitidaController.DescargarXsig.
  abstract obtenerXsigReal(id: number): Promise<Blob>;

  // Facturas simplificadas emitidas (MVP, 2026-08-31): envía (o reenvía) el PDF ya generado por
  // correo — solo existe una vez contabilizada. Reenviar es la MISMA llamada: nunca contabiliza
  // otra vez, nunca genera otro número ni toca el registro VERI*FACTU (el backend no lo hace,
  // ver FacturaEmitidaEmailService). Devuelve la factura actualizada con el nuevo estado de
  // envío para refrescar la UI sin releer aparte.
  abstract enviarPorCorreo(id: number, email: string): Promise<FacturaEmitida>;
}
