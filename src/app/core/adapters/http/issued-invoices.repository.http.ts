import { Injectable, inject } from '@angular/core';
import { DatosGuardarFacturaEmitida, IssuedInvoicesRepository } from '../../ports/issued-invoices.repository';
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
  fechaFactura: string;
  fechaVencimiento: string;
  idNumerador: number;
  idMedioPago: number;
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
  totalFactura: number;
  esEmpresa: boolean;
  lineas: FacturaEmitidaLineaApi[];
};

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
  lineas: {
    idFacturaLinea?: number;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    idImpuesto: number;
  }[];
};

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
      // No existe todavía como columna real en el backend (ver el puerto) — vacío para
      // facturas leídas, solo lo rellena crearBorrador() en el mock por ahora.
      operacionId: '',
      idCliente: dto.idCliente,
      totalesReales: this.totalesDesdeApi(dto.total, dto.iva, dto.irpf, dto.totalFactura),
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
      operacionId: '',
      idCliente: dto.idCliente,
      totalesReales: this.totalesDesdeApi(dto.total, dto.iva, dto.irpf, dto.totalFactura),
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
    const borradorLocal = await this.mockAdapter.obtenerPorId(id);
    if (borradorLocal) {
      const guardada = await this.guardarReal(cambios);
      this.mockAdapter.eliminar(id);
      return guardada;
    }
    return this.guardarReal(cambios, id);
  }

  private async guardarReal(data: DatosGuardarFacturaEmitida, idExistente?: number): Promise<FacturaEmitida> {
    if (!data.idCliente) {
      throw new Error(
        'Selecciona el cliente de la lista antes de guardar — no se puede guardar una ' +
        'factura solo con el nombre en texto.'
      );
    }
    if (!data.idMedioPago) {
      throw new Error('Selecciona una forma de pago del catálogo antes de guardar.');
    }
    if (data.lineas.length === 0) {
      throw new Error('La factura necesita al menos una línea.');
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
    })));

    const body: GuardarFacturaEmitidaApi = {
      idFacturaEmitida: idExistente,
      idCliente: data.idCliente,
      idNumerador: data.numeradorId,
      concepto: data.concepto?.trim() || '',
      fechaFactura: data.fecha,
      fechaVencimiento: data.vencimiento || data.fecha,
      idMedioPago: data.idMedioPago,
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

  // Fase 6 del plan de integración (2026-08-20): un borrador local (todavía sin guardar de
  // verdad) se duplica en local, igual que antes — no tiene sentido reservar ya un número real
  // para una copia de algo que ni siquiera se ha guardado la primera vez. Una factura real
  // (contabilizada, firmada, o un borrador ya guardado) se duplica de verdad: se relee
  // completa (con líneas) y se guarda como alta nueva reutilizando guardarReal() — mismo
  // Numerador real que asigna un número nuevo y limpio, sin heredar estado fiscal ni
  // OperacionId del original.
  async duplicar(id: number): Promise<FacturaEmitida | undefined> {
    const esLocal = await this.mockAdapter.obtenerPorId(id);
    if (esLocal) {
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
    const borradorLocal = await this.mockAdapter.obtenerPorId(id);
    if (borradorLocal) {
      throw new Error('Guarda la factura antes de contabilizarla.');
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Contabilizar`, {}),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  async firmar(id: number): Promise<FacturaEmitida> {
    const borradorLocal = await this.mockAdapter.obtenerPorId(id);
    if (borradorLocal) {
      throw new Error('Esta factura todavía no se ha guardado ni contabilizado — no se puede firmar.');
    }

    const [dto, mediosPago] = await Promise.all([
      this.api.post<FacturaEmitidaDetalleApi>(`${EMITIDAS_BASE_PATH}/${id}/Firmar`, {}),
      this.obtenerMediosPagoApi(),
    ]);
    return this.mapearDetalle(dto, mediosPago ?? []);
  }

  estadoAeatLabel(estado?: EstadoAeat): string {
    return this.mockAdapter.estadoAeatLabel(estado);
  }

  accionesPermitidas(factura: FacturaEmitida): AccionesPermitidas {
    return this.mockAdapter.accionesPermitidas(factura);
  }

  generarDocumento(id: number): Promise<{ blob: Blob; nombre: string }> {
    return this.mockAdapter.generarDocumento(id);
  }
}
