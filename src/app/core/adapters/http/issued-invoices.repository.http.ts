import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { CobroFactura, DatosGuardarFacturaEmitida, EstadoStripeConnect, IssuedInvoicesRepository, PrevisualizacionSubsanacion } from '../../ports/issued-invoices.repository';
import { MedioPagoOpcion } from '../../ports/received-invoices.repository';
import { MockIssuedInvoicesRepository } from '../mock/issued-invoices.repository.mock';
import { ApiService } from '../../../services/api.service';
import {
  AccionesPermitidas, Destinatario, EstadoAeat, EstadoFactura, FacturaEmitida, LineaFactura, Numerador, TotalesFactura,
} from '../../../services/mock-facturas.service';

// Mismos endpoints que ya usa el adaptador real de Recibidas (ImpuestoController/
// MediosPagoController) — catálogos genéricos por empresa, no específicos de Recibidas ni
// Emitidas, así que se reutilizan tal cual sin tocar el backend.
const IMPUESTOS_BASE_PATH = '/api/Impuesto';
const MEDIOS_PAGO_BASE_PATH = '/api/MediosPago';
const TIPO_IMPUESTO_IVA = 'IVA';

// Fase 2 del plan de integración (2026-08-20): FacturaEmitidaController ya existía (creado
// para la factura de socio de 1 línea) — se reutiliza el mismo controller/ruta para Enumerar/
// obtenerPorId genéricos, en vez de crear uno nuevo. La ruta resultante es /api/FacturaEmitida
// (singular, como el nombre del controller), NO /api/FacturasEmitidas.
const EMITIDAS_BASE_PATH = '/api/FacturaEmitida';

// Stripe Connect (Fase 3, 2026-09-02) — separado de EMITIDAS_BASE_PATH a propósito: es el
// mismo endpoint de capacidades/estado que usa el resto del módulo de Connect
// (PagosConnectController), no algo propio de Facturas Emitidas.
const PAGOS_CONNECT_BASE_PATH = '/api/PagosConnect';

// Confirmado por código (WebAPIARTIBusiness/Models/ARTIBusinessAPIContext.cs y
// ARTIBusinessCoreDLL/Models/ARTIBusinessCoreDLLContext.cs, idénticos): el backend usa bytes
// mágicos sin enum. 131=Borrador, 132=Contabilizada, 133=Firmada — mismo catálogo que
// Recibidas para 131/132, con 133 adicional porque Emitidas sí pasa por VeriFactu/AEAT.
const ESTADO_BORRADOR_API = 131;
const ESTADO_CONTABILIZADA_API = 132;
const ESTADO_FIRMADA_API = 133;

function estadoDesdeApi(valor: number): EstadoFactura {
  if (valor === ESTADO_BORRADOR_API) return 'borrador';
  if (valor === ESTADO_FIRMADA_API) return 'firmada';
  // Cualquier valor que no sea uno de los tres confirmados (incluido 132) cae en
  // 'contabilizada' — conservador: nunca mostrar como editable ('borrador') ni como ya
  // firmada/enviada algo que no se sabe con certeza que lo esté.
  return 'contabilizada';
}

function estadoHaciaApi(valor: EstadoFactura): number {
  if (valor === 'borrador') return ESTADO_BORRADOR_API;
  if (valor === 'firmada') return ESTADO_FIRMADA_API;
  return ESTADO_CONTABILIZADA_API;
}

// EstadoAeat en el backend real es un string libre que guarda tal cual lo que devuelve
// FacturaE. Confirmado en una prueba real (Fase 7, 2026-08-21) que 'PendienteEnvio' SÍ es un
// valor real (el registro se creó y firmó, pero el despachador de reintentos de FacturaE
// todavía no ha confirmado el envío a la AEAT) — el comentario anterior que decía lo
// contrario ("no hay ninguna cadena real que produzca ese valor") estaba equivocado: sin
// este caso, una factura recién contabilizada/firmada mostraba "Requiere revisión manual"
// (el 'default' de más abajo), un mensaje engañoso para un estado normal y transitorio.
function estadoAeatDesdeApi(valor: string | null | undefined): EstadoAeat | undefined {
  const v = valor?.trim();
  if (!v) return undefined;
  if (v === 'Correcto') return 'Correcto';
  if (v === 'AceptadoConErrores') return 'AceptadoConErrores';
  if (v === 'Incorrecto') return 'RechazadoAeat';
  if (v === 'PendienteEnvio') return 'PendienteEnvio';
  return 'RequiereRevisionManual';
}

// El listado no trae el dato real de "empresa vs particular" (evitaría un lookup extra por
// fila) — se infiere del formato del NIF/CIF español: un CIF de empresa empieza siempre por
// letra, un DNI/NIE de particular por dígito (o X/Y/Z, que igualmente no son dígitos, pero
// aquí caen del lado "empresa" por simplicidad — casos NIE son minoría y el dato es solo
// cosmético, ver factura-detalle.page.html). El detalle (obtenerPorId) sí trae el valor real.
function esEmpresaDesdeNif(nif: string | null | undefined): boolean {
  return !/^\d/.test((nif ?? '').trim());
}

// Límite de facturas a traer en el listado — mismo criterio que Recibidas (PAGINA_TAMANO).
const PAGINA_TAMANO = 50;

function esHttp404(e: unknown): boolean {
  return e instanceof Error && /^HTTP 404\b/.test(e.message);
}

// Cabecera devuelta por Enumerar — sin líneas, ver FacturaEmitidaCabeceraModel.cs.
type FacturaEmitidaCabeceraApi = {
  idFacturaEmitida: number;
  numFactura: string;
  idEmpresa: number;
  idCliente: number;
  clienteVisualizacion: string | null;
  razonSocialNif: string | null;
  concepto: string | null;
  total: number;
  iva: number;
  suplidos: number;
  irpf: number;
  totalFactura: number;
  cobrada: number;
  estado: number;
  estadoAeat: string | null;
  // Blindaje Fase 7 (2026-08-21): mismo motivo real que ya trae el detalle.
  codigoErrorAeat: string | null;
  descripcionErrorAeat: string | null;
  // Fase 7 (Anular, 2026-08-22): mismo criterio que codigoErrorAeat/descripcionErrorAeat — sin
  // esto, una factura anulada se veía en el listado igual que una que no lo está.
  idAnulacionVerifactu: number | null;
  fechaAnulacion: string | null;
  // Fase 7 (Subsanar, 2026-08-24): mismo criterio — sin motivoSubsanacion, que solo trae el detalle.
  idSubsanacionVerifactu: number | null;
  fechaSubsanacion: string | null;
  estadoSubsanacion: string | null;
  fechaFactura: string;
  fechaVencimiento: string;
  idNumerador: number;
  idMedioPago: number;
  // Descarga del PDF real (2026-08-27) — ver FacturaEmitidaCabeceraModel.TienePdf.
  tienePdf: boolean;
  // Descarga del .xsig real (2026-08-27) — ver FacturaEmitidaCabeceraModel.TieneXsig.
  tieneXsig: boolean;
  // Facturas simplificadas emitidas (MVP, 2026-08-31) — ver FacturaEmitidaCabeceraModel.EsSimplificada.
  esSimplificada: boolean;
};

type FacturaEmitidaLineaApi = {
  idFacturaLinea: number;
  referencia: string | null;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  idImpuesto: number;
  esSuplido: boolean;
  precioUnitarioBase: number;
};

// Detalle devuelto por GET /api/FacturaEmitida/{id} — ver FacturaEmitidaDetalleModel.cs. Usa
// razonSocialDenominacion (no clienteVisualizacion, a diferencia de la cabecera del listado) y
// sí trae esEmpresa real (viene de un lookup a Sujeto que Enumerar no hace por fila).
type FacturaEmitidaDetalleApi = {
  idFacturaEmitida: number;
  numFactura: string;
  idEmpresa: number;
  idCliente: number;
  concepto: string | null;
  total: number;
  iva: number;
  suplidos: number;
  irpf: number;
  cobrada: number;
  fechaFactura: string;
  fechaVencimiento: string;
  idNumerador: number;
  idMedioPago: number;
  razonSocialDenominacion: string | null;
  razonSocialNif: string | null;
  estado: number;
  estadoAeat: string | null;
  // Blindaje Fase 7 (2026-08-21): motivo real cuando estadoAeat no es 'Correcto'.
  codigoErrorAeat: string | null;
  descripcionErrorAeat: string | null;
  totalFactura: number;
  esEmpresa: boolean;
  lineas: FacturaEmitidaLineaApi[];
  // Fase 7 (Anular, 2026-08-22): presentes solo si la factura tiene un registro de anulación
  // real en FacturaE/VERI*FACTU — ver FacturaEmitidaDetalleModel.cs.
  idAnulacionVerifactu: number | null;
  fechaAnulacion: string | null;
  // Fase 7 (Subsanar, 2026-08-24): presentes solo si se ha subsanado.
  idSubsanacionVerifactu: number | null;
  fechaSubsanacion: string | null;
  estadoSubsanacion: string | null;
  motivoSubsanacion: string | null;
  // Facturas rectificativas (2026-09-03) — ver FacturaEmitidaDetalleModel.cs. numAbono es el
  // número de la factura rectificada (enlace heredado, ver FacturaEmitidaRectificativaService).
  esRectificativa: number | null;
  numAbono: string | null;
  motivoRectificacion: string | null;
  // Descarga del PDF real (2026-08-27) — ver FacturaEmitidaDetalleModel.TienePdf.
  tienePdf: boolean;
  // Descarga del .xsig real (2026-08-27) — ver FacturaEmitidaDetalleModel.TieneXsig.
  tieneXsig: boolean;
  // Facturas simplificadas emitidas (MVP, 2026-08-31) — ver FacturaEmitidaDetalleModel.cs.
  esSimplificada: boolean;
  urlQr: string | null;
  emailUltimoEnvio: string | null;
  fechaUltimoEnvioCorrecto: string | null;
  estadoUltimoEnvio: string | null;
  errorUltimoEnvio: string | null;
};

// Combina código + descripción del error/aviso de la AEAT en un único texto listo para
// mostrar — undefined si no hay nada que avisar (caso normal, EstadoAeat="Correcto").
function avisoAeatDesdeApi(codigo: string | null, descripcion: string | null): string | undefined {
  const desc = descripcion?.trim();
  const cod = codigo?.trim();
  if (!desc && !cod) return undefined;
  return cod ? `[${cod}] ${desc ?? ''}`.trim() : desc;
}

// Fase 7 (Subsanar, blindaje 2026-08-24): GET /api/FacturaEmitida/{id}/Subsanar/Previsualizar —
// ver PrevisualizarSubsanacionResultadoDto.cs. ASP.NET serializa en camelCase por defecto, así
// que coincide campo a campo con PrevisualizacionSubsanacion del puerto sin necesidad de mapeo.
type PrevisualizarSubsanacionApi = PrevisualizacionSubsanacion;

// Fase 4 del plan de integración (2026-08-20): GET /api/FacturaEmitida/Numeradores —
// catálogo de solo lectura, ver NumeradorDto.cs.
const NUMERADORES_PATH = `${EMITIDAS_BASE_PATH}/Numeradores`;

type NumeradorApi = {
  idNumerador: number;
  nombre: string | null;
};

// Body de POST /api/FacturaEmitida/Guardar — ver GuardarFacturaEmitidaRequest.cs. Sin
// NumFactura ni Estado a propósito: el número lo asigna siempre el Numerador real al crear, y
// Guardar solo crea/edita borradores (131) — nunca los cambia.
type GuardarFacturaEmitidaApi = {
  idFacturaEmitida?: number;
  idCliente: number;
  idNumerador: number;
  concepto: string;
  fechaFactura: string;
  fechaVencimiento: string;
  idMedioPago: number;
  // Facturas simplificadas emitidas (MVP, 2026-08-31): true = venta sin comprador identificado
  // necesariamente. idCliente puede ir a 0 cuando es true — el backend resuelve el cliente
  // interno "Consumidor final" automáticamente (ver GuardarFacturaEmitidaRequest.cs).
  esSimplificada: boolean;
  lineas: {
    idFacturaLinea?: number;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    idImpuesto: number;
    // Blindaje de backend para tickets (2026-09-02): "catalogo" | "suscripcion" | "manual" — el
    // backend rechaza una linea "suscripcion" cuando EsSimplificada es true (ver
    // GuardarFacturaEmitidaRequest.cs). El frontend ya oculta esa opcion en el editor de lineas
    // para un ticket, pero esto es lo que hace que el backend pueda comprobarlo de verdad.
    origen?: string;
  }[];
};

// GET /api/PagosConnect/estado — ver PagosConnectController.Estado. 503 (módulo desactivado) se
// trata en el catch del llamador, nunca llega a construirse este tipo en ese caso.
type EstadoPagosConnectApi = {
  conectado: boolean;
  estado: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

// POST /api/FacturaEmitida/{id}/Cobros/Stripe — ver PagosConnectController.IniciarCobroStripe
// en FacturaEmitidaCobrosController.cs. Nota: NO es el FacturaEmitidaDetalleApi completo (a
// diferencia de Contabilizar/Firmar/Anular/Subsanar/Cobros manual) — mientras el cobro sigue
// PENDING, la factura en sí no cambia; solo lo hace cuando el webhook confirma el pago.
type CobroFacturaApi = {
  id: number;
  proveedor: string;
  medio: string | null;
  estado: string;
  importe: number;
  moneda: string;
  fechaCreacionUtc: string;
  fechaConfirmacionUtc: string | null;
};

type IniciarCobroStripeApi = {
  cobro: CobroFacturaApi;
  checkoutUrl: string | null;
};

function mapearCobro(dto: CobroFacturaApi): CobroFactura {
  return {
    id: dto.id,
    proveedor: dto.proveedor,
    medio: dto.medio,
    estado: dto.estado,
    importe: dto.importe,
    moneda: dto.moneda,
    fechaCreacionUtc: dto.fechaCreacionUtc,
    fechaConfirmacionUtc: dto.fechaConfirmacionUtc,
  };
}

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

// medioPago en FacturaEmitida sigue siendo un string libre (ver comentario en el puerto) —
// se resuelve la etiqueta buscando el id en el catálogo ya cacheado, igual que Recibidas
// resuelve idImpuesto→% en mapearLinea. Sin la entrada (catálogo desalineado con datos
// antiguos), se muestra el id tal cual en vez de dejarlo en blanco.
function etiquetaMedioPagoPorId(id: number, catalogo: MedioPagoApi[]): string {
  const encontrado = catalogo.find(m => m.idMedioPago === id);
  return encontrado ? etiquetaMedioPago(encontrado) : `Medio de pago ${id}`;
}

/**
 * Adaptador real de Facturas Emitidas, construido en fases sobre el mismo
 * FacturaEmitidaController que ya existía (creado para la factura de socio de 1 línea):
 * - Fase 1: catálogos (obtenerPorcentajesIva/obtenerMediosPago).
 * - Fase 2: listar/obtenerPorId — se corrigió de paso obtenerPorId, que antes leía la factura
 *   de CUALQUIER empresa dado el id (fuga real entre tenants).
 * - Fase 3 (customers.repository.http.ts): buscar cliente real.
 * - Fase 4 (2026-08-20): guardar (alta/edición real, con líneas) y obtenerNumeradores. guardar
 *   reutiliza en el backend FacturaEmitidaCabecera.Create() de ARTIBusinessCoreDLL — el mismo
 *   mecanismo de numeración fiscal secuencial ya usado en producción por la factura de socio.
 * - Fase 6 (2026-08-20): eliminar (DELETE real, solo borradores) y duplicar (relee la factura
 *   completa y reutiliza guardarReal() para el alta — número nuevo real, sin heredar estado
 *   fiscal ni OperacionId).
 *
 * - Fase 7 (2026-08-21): contabilizar/firmar llaman de verdad a FacturaEmitidaController, que
 *   a su vez llama al microservicio FacturaE (AEAT/VERI*FACTU) — dejan de estar delegados al
 *   mock. generarDocumento sigue delegado al mock (genera un PDF de ejemplo, no fiscal).
 */
@Injectable()
export class HttpIssuedInvoicesRepository extends IssuedInvoicesRepository {
  private mockAdapter = inject(MockIssuedInvoicesRepository);
  private api = inject(ApiService);
  private transloco = inject(TranslocoService);

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

  async obtenerMediosPago(): Promise<MedioPagoOpcion[]> {
    const catalogo = await this.obtenerMediosPagoApi();
    return (catalogo ?? []).map(m => ({ id: m.idMedioPago, label: etiquetaMedioPago(m) }));
  }

  // Fase 4 del plan de integración (2026-08-20): catálogo real de series — sustituye los 2
  // numeradores fijos del mock. Sin caché: a diferencia de Impuestos/MediosPago (catálogos
  // que no cambian durante la sesión y se piden muchas veces), esto solo se llama una vez por
  // carga de página (cargarCatalogos()), no hace falta.
  async obtenerNumeradores(): Promise<Numerador[]> {
    const catalogo = await this.api.get<NumeradorApi[]>(NUMERADORES_PATH);
    return (catalogo ?? []).map(n => ({ id: n.idNumerador, nombre: n.nombre?.trim() || `Serie ${n.idNumerador}` }));
  }

  // Sentido contrario a mapearDetalle (id→%): aquí ivaPct ya es un dato de confianza (elegido
  // por el usuario), así que basta con encontrar la fila del catálogo con ese porcentaje.
  // Idéntico a resolverIdImpuesto en received-invoices.repository.http.ts.
  private async resolverIdImpuesto(ivaPct: number): Promise<number> {
    const catalogo = await this.obtenerImpuestosApi();
    const encontrado = catalogo.find(i => i.porcentaje === ivaPct);
    if (!encontrado) {
      throw new Error(
        `No existe en el catálogo de impuestos ningún tipo de IVA al ${ivaPct}%. ` +
        'Revisa el IVA de esa línea o pide que se añada ese tipo en el catálogo.'
      );
    }
    return encontrado.idImpuesto;
  }

  private mapearCabecera(dto: FacturaEmitidaCabeceraApi, mediosPago: MedioPagoApi[]): FacturaEmitida {
    return {
      id: dto.idFacturaEmitida,
      numFactura: dto.numFactura,
      numeradorId: dto.idNumerador,
      fecha: dto.fechaFactura.slice(0, 10),
      vencimiento: dto.fechaVencimiento ? dto.fechaVencimiento.slice(0, 10) : '',
      concepto: dto.concepto?.trim() || '',
      medioPago: etiquetaMedioPagoPorId(dto.idMedioPago, mediosPago),
      // Fase 6 (2026-08-20), corrigiendo un hueco real de la Fase 4: faltaba el id numérico
      // — solo se guardaba la etiqueta. Sin esto, reeditar una factura real sin volver a
      // tocar el desplegable de forma de pago (o duplicarla) hacía fallar guardar() con
      // "Selecciona una forma de pago", aunque la factura ya tuviera una asignada de verdad.
      idMedioPago: dto.idMedioPago,
      destinatario: {
        nombre: dto.clienteVisualizacion?.trim() || 'Cliente no disponible',
        nif: dto.razonSocialNif?.trim() || '',
        esEmpresa: esEmpresaDesdeNif(dto.razonSocialNif),
      },
      lineas: [],
      estado: estadoDesdeApi(dto.estado),
      estadoAeat: estadoAeatDesdeApi(dto.estadoAeat),
      avisoAeat: avisoAeatDesdeApi(dto.codigoErrorAeat, dto.descripcionErrorAeat),
      // No existe todavía como columna real en el backend (ver el puerto) — vacío para
      // facturas leídas, solo lo rellena crearBorrador() en el mock por ahora.
      operacionId: '',
      idCliente: dto.idCliente,
      totalesReales: this.totalesDesdeApi(dto.total, dto.iva, dto.irpf, dto.totalFactura),
      anulada: dto.idAnulacionVerifactu != null,
      fechaAnulacion: dto.fechaAnulacion ? dto.fechaAnulacion.slice(0, 10) : undefined,
      subsanada: dto.idSubsanacionVerifactu != null,
      fechaSubsanacion: dto.fechaSubsanacion ? dto.fechaSubsanacion.slice(0, 10) : undefined,
      estadoSubsanacion: dto.estadoSubsanacion ?? undefined,
      tienePdf: dto.tienePdf,
      tieneXsig: dto.tieneXsig,
      esSimplificada: dto.esSimplificada,
      cobrada: dto.cobrada === 1,
    };
  }

  private async mapearDetalle(dto: FacturaEmitidaDetalleApi, mediosPago: MedioPagoApi[]): Promise<FacturaEmitida> {
    const catalogoImpuestos = await this.obtenerImpuestosApi();
    const lineas: LineaFactura[] = (dto.lineas ?? []).map(l => {
      const impuesto = catalogoImpuestos.find(i => i.idImpuesto === l.idImpuesto);
      return {
        id: this.nuevoIdLinea(),
        idLineaBackend: l.idFacturaLinea,
        origen: 'manual',
        descripcion: l.descripcion?.trim() || 'Sin descripción',
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuentoPct: l.descuento,
        // Igual que mapearLinea en Recibidas: si el id_impuesto ya no existe en el catálogo
        // vigente, se cae a 0% en vez de reventar.
        ivaPct: impuesto?.porcentaje ?? 0,
      };
    });

    return {
      id: dto.idFacturaEmitida,
      numFactura: dto.numFactura,
      numeradorId: dto.idNumerador,
      fecha: dto.fechaFactura.slice(0, 10),
      vencimiento: dto.fechaVencimiento ? dto.fechaVencimiento.slice(0, 10) : '',
      concepto: dto.concepto?.trim() || '',
      medioPago: etiquetaMedioPagoPorId(dto.idMedioPago, mediosPago),
      idMedioPago: dto.idMedioPago,
      destinatario: {
        nombre: dto.razonSocialDenominacion?.trim() || 'Cliente no disponible',
        nif: dto.razonSocialNif?.trim() || '',
        esEmpresa: dto.esEmpresa,
      },
      lineas,
      estado: estadoDesdeApi(dto.estado),
      estadoAeat: estadoAeatDesdeApi(dto.estadoAeat),
      avisoAeat: avisoAeatDesdeApi(dto.codigoErrorAeat, dto.descripcionErrorAeat),
      operacionId: '',
      idCliente: dto.idCliente,
      totalesReales: this.totalesDesdeApi(dto.total, dto.iva, dto.irpf, dto.totalFactura),
      anulada: dto.idAnulacionVerifactu != null,
      fechaAnulacion: dto.fechaAnulacion ? dto.fechaAnulacion.slice(0, 10) : undefined,
      subsanada: dto.idSubsanacionVerifactu != null,
      fechaSubsanacion: dto.fechaSubsanacion ? dto.fechaSubsanacion.slice(0, 10) : undefined,
      estadoSubsanacion: dto.estadoSubsanacion ?? undefined,
      motivoSubsanacion: dto.motivoSubsanacion ?? undefined,
      esRectificativa: dto.esRectificativa === 1,
      numFacturaRectificada: dto.numAbono ?? undefined,
      motivoRectificacion: dto.motivoRectificacion ?? undefined,
      tienePdf: dto.tienePdf,
      tieneXsig: dto.tieneXsig,
      esSimplificada: dto.esSimplificada,
      urlQr: dto.urlQr ?? undefined,
      emailUltimoEnvio: dto.emailUltimoEnvio ?? undefined,
      fechaUltimoEnvioCorrecto: dto.fechaUltimoEnvioCorrecto ? dto.fechaUltimoEnvioCorrecto.slice(0, 10) : undefined,
      estadoUltimoEnvio: dto.estadoUltimoEnvio === 'Enviado' || dto.estadoUltimoEnvio === 'Fallido' ? dto.estadoUltimoEnvio : undefined,
      errorUltimoEnvio: dto.errorUltimoEnvio ?? undefined,
      cobrada: dto.cobrada === 1,
    };
  }

  // dto.total (backend) es la BASE IMPONIBLE, igual que en Recibidas — no el importe final.
  private totalesDesdeApi(total: number, iva: number, irpf: number, totalFactura: number): TotalesFactura {
    return {
      base: total,
      desgloseIva: [],
      ivaTotal: iva,
      retencion: {
        aplicable: irpf > 0,
        etiqueta: 'IRPF',
        porcentaje: 0, // el % real no viaja en la cabecera, solo el importe ya calculado — ver gap #12/#248 en SERVICE_CONTRACT_GAPS.md/AUDITORIA
        base: total,
        importe: irpf,
      },
      total: totalFactura,
    };
  }


  // BUG REAL Y GRAVE encontrado en revision (2026-09-02, reportado como "hay que dar dos veces
  // a Contabilizar"): estos metodos usaban la mera PRESENCIA del id en el almacen del mock como
  // definicion de "esto es un borrador local todavia sin guardar". Pero ese almacen no contiene
  // solo los borradores locales de la sesion: tambien tiene las facturas de EJEMPLO fijas del
  // modo demo, con ids 1, 2, 3, 4, 5... — exactamente el rango en el que caen los ids reales de
  // una empresa que acaba de empezar a emitir (los primeros tickets FS de esta demo, sin ir mas
  // lejos).
  //
  // Con un id real que coincidiera con uno de ejemplo, la secuencia era:
  //   1er intento -> contabilizar() creia que era un borrador local y lanzaba "guarda la factura
  //                  antes de contabilizar", sin contabilizar nada.
  //   2o intento  -> guardar() creia lo mismo, entraba por la rama de ALTA y creaba una factura
  //                  DUPLICADA con un numero fiscal nuevo, ademas de borrar del mock la de
  //                  ejemplo; ya sin colision, el contabilizar posterior si funcionaba.
  // De ahi la sensacion de "hay que darle dos veces": el primer intento fallaba y el segundo
  // duplicaba la factura en silencio, consumiendo un numero fiscal real.
  //
  // El criterio correcto es la marca esBorradorLocal, que SOLO pone crearBorrador() — es el
  // mismo que ya usaba listar() para decidir que borradores locales mezclar con los reales; el
  // resto de metodos se habia quedado atras. Ver ademas el nuevo rango de ids locales en
  // mock-facturas.service.ts, que hace la colision estructuralmente imposible.
  private async esBorradorLocalSinGuardar(id: number): Promise<boolean> {
    const enMemoria = await this.mockAdapter.obtenerPorId(id);
    return enMemoria?.esBorradorLocal === true;
  }

  async listar(estado: EstadoFactura, numeradorId: number | null = null): Promise<FacturaEmitida[]> {
    const body: Record<string, unknown> = { top: PAGINA_TAMANO, estado: estadoHaciaApi(estado) };
    if (numeradorId != null) body['idNumerador'] = numeradorId;

    const [cabeceras, mediosPago, locales] = await Promise.all([
      this.api.post<FacturaEmitidaCabeceraApi[]>(`${EMITIDAS_BASE_PATH}/Enumerar`, body),
      this.obtenerMediosPagoApi(),
      // Mismos filtros que la petición real — un borrador local recién creado con
      // crearBorrador() ya nace con el numerador elegido por el usuario, así que filtrar
      // igual no lo oculta salvo que de verdad no encaje con lo que se está mirando.
      this.mockAdapter.listar(estado, numeradorId),
    ]);

    const cabecerasRecortadas = (cabeceras ?? []).slice(0, PAGINA_TAMANO);
    const reales = cabecerasRecortadas.map(c => this.mapearCabecera(c, mediosPago ?? []));

    // Solo los borradores locales de esta sesión (crearBorrador) — nunca los 4 registros de
    // ejemplo fijos del mock, que son solo demo. Mismo criterio que Recibidas.
    const borradoresLocales = locales.filter(f => f.esBorradorLocal === true);

    const todas = [...reales, ...borradoresLocales];
    todas.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return todas;
  }

  async obtenerPorId(id: number): Promise<FacturaEmitida | undefined> {
    try {
      const [dto, mediosPago] = await Promise.all([
        this.api.get<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}`),
        this.obtenerMediosPagoApi(),
      ]);
      if (dto) {
        return await this.mapearDetalle(dto, mediosPago ?? []);
      }
    } catch (e) {
      // Solo un 404 real (no existe para esta empresa, o el id es de un borrador local
      // todavía sin guardar) cae al almacén local — mismo criterio que Recibidas.
      if (!esHttp404(e)) throw e;
    }
    return this.mockAdapter.obtenerPorId(id);
  }

  totales(factura: FacturaEmitida): TotalesFactura {
    // Facturas leídas del backend real ya traen sus totales oficiales — se usan tal cual en
    // vez de recalcular desde 'lineas' (el listado ni siquiera las trae).
    if (factura.totalesReales) return factura.totalesReales;
    return this.mockAdapter.totales(factura);
  }

  // Fase 4 del plan de integración (2026-08-20): guarda de verdad contra el backend — mismo
  // criterio que ReceivedInvoicesRepository.actualizar(): si 'id' todavía existe en el
  // almacén local (mockAdapter), es la primera vez que se guarda de verdad (alta); si ya no
  // está, es un id real (se guardó antes en esta sesión, o se leyó de obtenerPorId) y toca
  // actualizar esa misma fila.
  async guardar(id: number, cambios: DatosGuardarFacturaEmitida): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      const guardada = await this.guardarReal(cambios);
      this.mockAdapter.eliminar(id);
      return guardada;
    }
    return this.guardarReal(cambios, id);
  }

  private async guardarReal(data: DatosGuardarFacturaEmitida, idExistente?: number): Promise<FacturaEmitida> {
    // Facturas simplificadas emitidas (MVP): sin comprador identificado, idCliente puede faltar
    // — el backend resuelve el cliente interno "Consumidor final" automáticamente. Para una
    // completa sigue siendo obligatorio, igual que antes.
    if (!data.esSimplificada && !data.idCliente) {
      throw new Error(this.transloco.translate('invoices.issued.errors.clientRequired'));
    }
    if (!data.idMedioPago) {
      throw new Error(this.transloco.translate('invoices.issued.errors.paymentMethodRequired'));
    }
    if (data.lineas.length === 0) {
      throw new Error(this.transloco.translate('invoices.issued.errors.lineRequired'));
    }

    const lineasConImpuesto = await Promise.all(data.lineas.map(async l => ({
      // Se manda el id real de la línea cuando existe (viene de leer una factura real del
      // backend) — así Guardar la actualiza en vez de borrarla y crear una nueva. Una línea
      // añadida a mano en esta sesión no lo tiene: undefined, que JSON.stringify omite, y el
      // backend la trata como alta.
      idFacturaLinea: l.idLineaBackend,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuento: l.descuentoPct,
      idImpuesto: await this.resolverIdImpuesto(l.ivaPct),
      origen: l.origen,
    })));

    const body: GuardarFacturaEmitidaApi = {
      idFacturaEmitida: idExistente,
      idCliente: data.idCliente ?? 0,
      idNumerador: data.numeradorId,
      concepto: data.concepto?.trim() || '',
      fechaFactura: data.fecha,
      fechaVencimiento: data.vencimiento || data.fecha,
      idMedioPago: data.idMedioPago,
      esSimplificada: !!data.esSimplificada,
      lineas: lineasConImpuesto,
    };

    const dto = await this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/Guardar`, body);

    // No pasa por mapearDetalle a propósito (igual que guardarReal en Recibidas): esa función
    // está pensada para leer una factura ya guardada desde cero (obtenerPorId), y generaría un
    // id de línea NUEVO para cada línea con this.nuevoIdLinea() — perdiendo la identidad local
    // que ya tenían (rompe el trackBy del editor de líneas justo después de guardar). Aquí ya
    // tenemos los datos en 'data' tal cual los eligió el usuario; solo se completa con el id
    // real de cabecera/línea que acaba de asignar el backend.
    const lineas = data.lineas.map((l, i) => ({ ...l, idLineaBackend: dto.lineas?.[i]?.idFacturaLinea }));

    return {
      ...data,
      lineas,
      id: dto.idFacturaEmitida,
      numFactura: dto.numFactura,
      estado: estadoDesdeApi(dto.estado),
      estadoAeat: estadoAeatDesdeApi(dto.estadoAeat),
      operacionId: '',
      totalesReales: this.totalesDesdeApi(dto.total, dto.iva, dto.irpf, dto.totalFactura),
      // Bug real encontrado en revisión (2026-08-31): sin este override, una simplificada
      // creada con "Consumidor final" (idCliente sin definir en el request) se quedaba con
      // idCliente indefinido en el estado local tras guardar, aunque el backend ya hubiera
      // resuelto y persistido el cliente genérico real — un segundo Guardar de la misma
      // factura (p. ej. el que hace confirmarContabilizar() antes de contabilizar) volvía a
      // mandar idCliente=0, y la rama de EDICIÓN de GuardarAsync no vuelve a resolver el
      // cliente genérico (solo lo hace al crear), sobrescribiendo el cliente ya asignado con 0.
      idCliente: dto.idCliente,
      esSimplificada: dto.esSimplificada,
      // Bug real encontrado en revisión (2026-09-02): 'data' es DatosGuardarFacturaEmitida (un
      // Pick sin 'cobrada'), así que sin este override cualquier Guardar posterior a marcar un
      // ticket como cobrado borraba ese dato en pantalla (el aviso "Pagado, pendiente de
      // contabilizar" desaparecía y "Marcar como cobrado" reaparecía), aunque el backend seguía
      // teniendo el cobro bien registrado. dto.cobrada siempre viaja en la respuesta real de
      // Guardar (GuardarFacturaEmitidaRequest -> FacturaEmitidaDetalleModel), así que esto solo
      // faltaba aquí.
      cobrada: dto.cobrada === 1,
    };
  }

  // Fase 6 del plan de integración (2026-08-20): elimina de verdad — mismo criterio 404→mock
  // que el resto de métodos reales (id de un borrador local todavía sin guardar).
  async eliminar(id: number): Promise<void> {
    try {
      await this.api.delete(`${EMITIDAS_BASE_PATH}/${id}`);
      return;
    } catch (e) {
      if (!esHttp404(e)) throw e;
    }
    this.mockAdapter.eliminar(id);
  }

  // Facturas simplificadas emitidas (2026-09-02): descarte de un borrador puramente local — a
  // diferencia de eliminar(), NUNCA intenta un DELETE HTTP (nada que borrar en el backend, ese
  // número/id no existe ahí todavía). El llamador es responsable de comprobar antes
  // f.esBorradorLocal; este método no lo vuelve a comprobar por su cuenta.
  async descartarLocal(id: number): Promise<void> {
    this.mockAdapter.eliminar(id);
  }

  // Fase 6 del plan de integración (2026-08-20): un borrador local (todavía sin guardar de
  // verdad) se duplica en local, igual que antes — no tiene sentido reservar ya un número real
  // para una copia de algo que ni siquiera se ha guardado la primera vez. Una factura real
  // (contabilizada, firmada, o un borrador ya guardado) se duplica de verdad: se relee
  // completa (con líneas) y se guarda como alta nueva reutilizando guardarReal() — mismo
  // Numerador real que asigna un número nuevo y limpio, sin heredar estado fiscal ni
  // OperacionId del original.
  async duplicar(id: number): Promise<FacturaEmitida | undefined> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      return this.mockAdapter.duplicar(id);
    }

    const original = await this.obtenerPorId(id);
    if (!original) return undefined;

    return this.guardarReal({
      fecha: new Date().toISOString().slice(0, 10),
      vencimiento: '',
      concepto: original.concepto,
      medioPago: original.medioPago,
      idMedioPago: original.idMedioPago,
      destinatario: { ...original.destinatario },
      lineas: original.lineas.map(l => ({ ...l, id: this.nuevoIdLinea(), idLineaBackend: undefined })),
      numeradorId: original.numeradorId,
      idCliente: original.idCliente,
      // Bug real encontrado en revisión (2026-08-31): sin esto, duplicar una factura
      // simplificada la convertía silenciosamente en completa (esSimplificada quedaba en
      // undefined → false dentro de guardarReal), perdiendo el tipo fiscal "FA" y dejando de
      // estar sujeta al límite de 400 €.
      esSimplificada: original.esSimplificada,
    });
  }

  // --- Todo lo demás sigue delegado al mock hasta su propia fase del plan ---

  getNumeradores(): Numerador[] {
    return this.mockAdapter.getNumeradores();
  }

  numeradorNombre(id: number): string {
    return this.mockAdapter.numeradorNombre(id);
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

  // Fase 7 del plan de integración (2026-08-21): llaman de verdad a
  // FacturaEmitidaController.Contabilizar/Firmar (FacturaEmitidaAeatService), que a su vez
  // llama al microservicio FacturaE (AEAT/VERI*FACTU) y devuelve la factura ya actualizada
  // (mismo FacturaEmitidaDetalleModel que GET /{id}) — se reutiliza mapearDetalle tal cual.
  //
  // Bug real encontrado por los tests existentes al conectar esto: un borrador LOCAL (creado
  // con crearBorrador(), nunca guardado de verdad) puede aparecer en el listado (listar() ya
  // mezcla reales + borradoresLocales) — contabilizarlo directamente contra el backend
  // reventaba, porque esa factura no existe ahí todavía. Mismo criterio que guardar() para
  // distinguir un id local de uno real: si sigue en el almacén del mock, hay que guardarla
  // primero (la pantalla de detalle ya lo hace; aquí se deja como error explícito para
  // cualquier otro punto de entrada, como el botón directo del listado).
  async contabilizar(id: number): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.guardarAntesDeContabilizar'));
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Contabilizar`, {}),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  async firmar(id: number): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.firmarBorrador'));
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Firmar`, {}),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  // Fase 7 (Anular, 2026-08-22): llama de verdad a FacturaEmitidaController.Anular
  // (FacturaEmitidaAeatService.AnularAsync), que crea un RegistroAnulacion nuevo en
  // FacturaE/VERI*FACTU — el Alta original (IdFacturaVerifactu) no se toca. Mismas guardas de
  // borrador local que contabilizar/firmar; las guardas de negocio (factura nunca contabilizada,
  // ya anulada) las hace el backend y llegan aquí como HTTP 400 (ver BadRequest en el
  // controller), que ApiService ya convierte en Error con el mensaje real.
  // Refresco del estado AEAT (2026-09-04). Se traga CUALQUIER fallo y devuelve null a propósito:
  // esto se llama solo, sin que el usuario lo pida, al abrir una factura que quedó pendiente. Un
  // error aquí no debe interrumpir nada — la factura ya se ha cargado y se ve igual de bien con
  // el estado viejo.
  //
  // Eso es además lo que permite desplegarlo SIN coordinar con el backend: mientras el endpoint
  // no esté publicado responde 404, se ignora, y todo sigue exactamente como antes. El día que
  // se publique empieza a funcionar solo, sin tener que acordarse de encender ningún flag.
  async refrescarEstadoAeat(id: number): Promise<FacturaEmitida | null> {
    if (await this.esBorradorLocalSinGuardar(id)) return null;

    try {
      const [dto, mediosPago] = await Promise.all([
        this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/RefrescarEstadoAeat`, {}),
        this.obtenerMediosPagoApi(),
      ]);
      return this.mapearDetalle(dto, mediosPago ?? []);
    } catch {
      return null;
    }
  }

  async anular(id: number): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.anularBorrador'));
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Anular`, {}),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  // Fase 7 (Subsanar, 2026-08-24): llama de verdad a FacturaEmitidaController.Subsanar
  // (FacturaEmitidaAeatService.SubsanarAsync). No manda "campos corregidos": el backend
  // reconstruye el registro a partir de los mismos datos de la factura ya guardados — solo se
  // envía el motivo, obligatorio.
  async rectificar(id: number, motivo: string): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.rectificarBorrador'));
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Rectificar`, { motivo }),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  async subsanar(id: number, motivo: string): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.subsanarBorrador'));
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Subsanar`, { motivo }),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  // Cobro de tickets/facturas emitidas (Fase 2, 2026-09-02): en manual, "confirmar" y "cobrar"
  // son el mismo acto — el backend marca el cobro directamente como PAID y devuelve la factura
  // completa ya actualizada (mismo patrón que contabilizar/firmar/anular/subsanar). Un borrador
  // puramente local no puede cobrarse (todavía no existe en el backend) — mismo criterio que
  // contabilizar/firmar/anular/subsanar. idempotencyKey generada aquí mismo: un doble-tap en el
  // botón de confirmar reintenta con la MISMA clave (crypto.randomUUID por intento de usuario,
  // no por click) — ver confirmarCobro() en factura-detalle.page.ts.
  async marcarComoCobrado(id: number, medio: string, importe: number): Promise<FacturaEmitida> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.guardarAntesDeCobrar'));
    }

    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${id}-${Date.now()}`;
    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Cobros`, { medio, importe, idempotencyKey }),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  // Stripe Connect (Fase 3, 2026-09-02): fuente de verdad de si "Cobrar con tarjeta" puede
  // ofrecerse. CUALQUIER fallo (503 con StripeConnect:Enabled=false, sin conexión, lo que sea)
  // se trata como "no disponible" — nunca se deja que el error se propague hacia la pantalla,
  // porque la ausencia de esta función es el estado normal del MVP mientras no exista
  // infraestructura real (Azure Table Storage + cuenta Stripe Connect), no un fallo a mostrar.
  async obtenerEstadoStripeConnect(): Promise<EstadoStripeConnect> {
    try {
      const dto = await this.api.get<EstadoPagosConnectApi>(`${PAGOS_CONNECT_BASE_PATH}/estado`);
      return { disponible: !!dto?.conectado && !!dto?.chargesEnabled };
    } catch {
      return { disponible: false };
    }
  }

  async iniciarCobroStripe(id: number): Promise<{ checkoutUrl: string | null }> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.guardarAntesDeCobrar'));
    }

    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${id}-${Date.now()}`;
    const respuesta = await this.api.post<IniciarCobroStripeApi>(`${EMITIDAS_BASE_PATH}/${id}/Cobros/Stripe`, { idempotencyKey });
    return { checkoutUrl: respuesta.checkoutUrl };
  }

  async obtenerCobros(id: number): Promise<CobroFactura[]> {
    const cobros = await this.api.get<CobroFacturaApi[]>(`${EMITIDAS_BASE_PATH}/${id}/Cobros`);
    return (cobros ?? []).map(mapearCobro);
  }

  // Facturas simplificadas emitidas (MVP, 2026-08-31): mismo patrón que contabilizar/anular/
  // subsanar — reenviar es la MISMA llamada (el backend no distingue "primer envío" de
  // "reenvío", ver FacturaEmitidaEmailService). Un fallo de correo (502) se propaga como error
  // — la factura sigue contabilizada tal cual estaba, la pantalla solo necesita mostrar el
  // aviso, no hace falta releerla aparte para eso.
  async enviarPorCorreo(id: number, email: string): Promise<FacturaEmitida> {
    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/EnviarCorreo`, { email }),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  estadoAeatLabel(estado?: EstadoAeat): string {
    return this.mockAdapter.estadoAeatLabel(estado);
  }

  estadoSubsanacionLabel(estado?: string): string {
    return this.mockAdapter.estadoSubsanacionLabel(estado);
  }

  async previsualizarSubsanacion(id: number): Promise<PrevisualizacionSubsanacion> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      throw new Error(this.transloco.translate('verifactu.errors.subsanarBorrador'));
    }
    return this.api.get<PrevisualizarSubsanacionApi>(`${EMITIDAS_BASE_PATH}/${id}/Subsanar/Previsualizar`);
  }

  accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas {
    return this.mockAdapter.accionesPermitidas(factura);
  }

  // Bug real encontrado en revision (2026-09-02, reportado como "un borrador no se puede
  // compartir"): esto delegaba sin mas en el mock, que solo sabe buscar en SU almacen — un
  // borrador ya guardado en el backend no esta ahi, asi que compartirlo (y descargarlo)
  // fallaba SIEMPRE con "Factura no encontrada". Un borrador no tiene todavia PDF fiscal (se
  // genera al contabilizar), asi que lo que se comparte es el mismo documento simulado y
  // claramente marcado como no fiscal que ya se usaba para los borradores locales — pero ahora
  // construido con los datos reales de la factura.
  async generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }> {
    if (await this.esBorradorLocalSinGuardar(id)) {
      return this.mockAdapter.generarDocumento(id);
    }
    const factura = await this.obtenerPorId(id);
    if (!factura) throw new Error(this.transloco.translate('invoices.issued.detail.notFound'));
    return this.mockAdapter.generarDocumentoDesde(factura);
  }

  obtenerPdfReal(id: number): Promise<Blob> {
    return this.api.getBlob(`${EMITIDAS_BASE_PATH}/${id}/Pdf`);
  }

  obtenerXsigReal(id: number): Promise<Blob> {
    return this.api.getBlob(`${EMITIDAS_BASE_PATH}/${id}/Xsig`);
  }
}
