import { Injectable, inject } from '@angular/core';
import { FiltrosListarRecibidas, MedioPagoOpcion, ReceivedInvoicesRepository } from '../../ports/received-invoices.repository';
import { MockReceivedInvoicesRepository } from '../mock/received-invoices.repository.mock';
import { ApiService } from '../../../services/api.service';
import {
  AccionesPermitidas, ConfiguracionRetencion, FacturaRecibida, IRPF_RATES, LineaFactura, TotalesFactura,
  calcularTotalesLineas,
} from '../../../services/mock-facturas.service';
import { formatEuros } from '../../../shared/utils/format-euros';
import { limpiarNombreProveedor } from '../../../shared/utils/limpiar-nombre-proveedor';

// Confirmado contra el código real de WebAPIARTIBusiness (Controllers/DocumentoController.cs
// + Services/DocumentoService.cs): [Authorize] con el mismo esquema JWT que ya usa el login,
// y reenvía el body de la API de OCR sin transformar (`Content = resultado.Json`, el string
// tal cual que devolvió Railway) — coincide exactamente con lo asumido en el mapeo de abajo.
const OCR_ENDPOINT_PATH = '/api/Documento/analizar';

// Subconjunto de AnalyzeDocumentResponse (openapi.json de ARTI-Invoice-Reader-Handoff)
// que realmente se usa aquí — todos los campos son opcionales/nulos según el propio
// esquema, el documento puede venir con extracción parcial.
// address/postal_code/city/province/country: confirmados en el esquema real de la API de
// OCR (ARTI-Invoice-Reader-Handoff/openapi.json, componente "Party") — no se leían hasta
// ahora porque no hacían falta para nada; los necesitamos para poder pre-rellenar la
// pantalla de alta de proveedor en cuanto exista Proveedores/Crear en el backend.
type OcrParty = {
  legal_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
};

type OcrLine = {
  description?: string | null;
  quantity?: string | null;
  unit_price?: string | null;
  discount_percent?: string | null;
  tax_rate?: string | null;
  // "taxable" | "exempt" | "non_subject" | "reverse_charge" | "outside_scope" | "unknown"
  // — cómo se relaciona la línea con el IVA. Necesario para no asumir el 21% por defecto
  // en líneas que explícitamente NO llevan IVA (ej. cánones/tasas de organismos públicos).
  tax_treatment?: string | null;
  // Muchas facturas de servicios/abonos (teléfono, luz...) no traen quantity/unit_price
  // limpios — el OCR da directamente el importe de la línea en taxable_base (preferido,
  // es explícitamente "antes de impuestos", coherente con cómo esta app calcula
  // Base imponible) o, si falta, en line_total.
  taxable_base?: string | null;
  line_total?: string | null;
  withholding_rate?: string | null;
};

type OcrPayment = {
  payment_method?: string | null;
  due_date?: string | null;
};

type OcrTotals = {
  taxable_base?: string | null;
  withholding?: string | null;
  total?: string | null;
};

type OcrInvoice = {
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  issuer?: OcrParty | null;
  lines?: OcrLine[] | null;
  payment?: OcrPayment | null;
  totals?: OcrTotals | null;
};

type OcrAnalyzeResponse = {
  success: boolean;
  document?: {
    invoice?: OcrInvoice | null;
    // Avisos que la propia API de OCR genera sobre su extracción (ej. "no me cuadran
    // los importes internamente") — información real, no algo que debamos descartar.
    warnings?: string[] | null;
  } | null;
  error?: { code: string; message: string };
};

// Los importes/cantidades de la API de OCR llegan como string (para no perder
// precisión decimal) y pueden venir null cuando no se ha podido leer el dato.
function numeroDesde(valor: string | null | undefined, porDefecto: number): number {
  if (valor == null || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

// Como numeroDesde, pero sin valor por defecto — hace falta distinguir "no viene el
// dato" de "vale 0" para decidir si usamos unit_price o caemos a taxable_base/line_total.
function numeroOpcional(valor: string | null | undefined): number | null {
  if (valor == null || valor.trim() === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Redondea a la tarifa de IRPF válida más cercana — el <ion-select> de retención solo
// admite los valores de IRPF_RATES, así que un porcentaje calculado (ej. 19.03%) que no
// coincida exactamente con ninguno dejaría el selector sin nada marcado.
function irpfMasCercano(pct: number): number {
  return IRPF_RATES.reduce((mejor, r) => (Math.abs(r - pct) < Math.abs(mejor - pct) ? r : mejor));
}

// Tratamientos en los que la línea, por definición, NO lleva IVA — un tax_rate ausente
// aquí significa "0%", nunca "no lo sé, asumo el tipo general". Bug real detectado con
// una factura de Aguas de Alicante: el Canon de Saneamiento (Generalitat Valenciana) es
// "non_subject" con tax_rate null, y caía al 21% por defecto, inflando el total.
const TRATAMIENTOS_SIN_IVA = new Set(['exempt', 'non_subject', 'outside_scope', 'reverse_charge']);

function ivaPctDesdeLinea(l: OcrLine): number {
  if (l.tax_treatment && TRATAMIENTOS_SIN_IVA.has(l.tax_treatment)) return 0;
  return numeroDesde(l.tax_rate, 21);
}

// Confirmado contra el código real de WebAPIARTIBusiness (Controllers/FacturasRecibidasController.cs
// + Services/FacturaRecibidaService.cs): [Authorize] con el mismo esquema JWT que ya usa el
// login, y la empresa se resuelve del claim "EmpresaId" del propio token si no se manda
// idEmpresa explícito (confirmado en TokenServiceEmployee.cs, línea 41 — el login que ya
// usa la app incluye ese claim). JSON en camelCase, igual que el resto de la API (confirmado
// también: Startup.cs no fija PropertyNamingPolicy, así que aplica el default Web de
// System.Text.Json).
const RECIBIDAS_BASE_PATH = '/api/FacturasRecibidas';

// OJO: el controlador se llama "ImpuestoController" (singular) — la ruta resultante es
// /api/Impuesto, no /api/Impuestos como el resto de catálogos plurales de esta API
// (Proveedores, MediosPago). Confirmado leyendo el atributo [Route] directamente.
const IMPUESTOS_BASE_PATH = '/api/Impuesto';

// Único tipo que usamos hoy — Facturas Recibidas nunca declara IPSI/IGIC por ahora (eso
// solo aplicaría a proveedores de Canarias/Ceuta/Melilla, fuera de alcance del MVP). El
// campo 'tipo' es obligatorio en Enumerar, así que hay que mandarlo siempre.
const TIPO_IMPUESTO_IVA = 'IVA';

// Confirmado en Controllers/MediosPagoController.cs (2026-08-14): a diferencia de
// Proveedores/Enumerar, aquí 'idEmpresa' SÍ es int? con fallback normal al claim del JWT —
// no hace falta mandarlo explícito.
const MEDIOS_PAGO_BASE_PATH = '/api/MediosPago';

// Límite de facturas a traer en el listado — Enumerar hoy no pagina (ver comentario en
// listar()), así que esto es una petición al backend para cuando lo soporte, no una
// garantía todavía.
const PAGINA_TAMANO = 50;

// Confirmado con el jefe: Recibidas reutiliza los mismos códigos de Estado que Emitidas.
// Aquí solo existen estos dos (nunca 133/"firmada" — Recibidas no pasa por Verifactu/AEAT).
const ESTADO_BORRADOR_API = 131;
const ESTADO_REVISADA_API = 132;

function estadoDesdeApi(valor: number): 'borrador' | 'revisada' {
  // Cualquier valor que no sea uno de los dos confirmados cae en 'revisada' — mismo
  // criterio conservador que antes de conocer el mapeo: no bloquear la factura por un
  // estado que no reconocemos, nunca tratarlo como "necesita repaso" sin motivo.
  return valor === ESTADO_BORRADOR_API ? 'borrador' : 'revisada';
}

function estadoHaciaApi(valor: 'borrador' | 'revisada'): number {
  return valor === 'borrador' ? ESTADO_BORRADOR_API : ESTADO_REVISADA_API;
}

// ApiService da el status siempre al principio del mensaje ("HTTP 404 ..." en nativo,
// "HTTP 404 - ..." en web) — mirar solo ese prefijo evita depender del resto del formato.
function esHttp404(e: unknown): boolean {
  return e instanceof Error && /^HTTP 404\b/.test(e.message);
}

// Ojo con los nombres: "total" en el backend es la BASE IMPONIBLE (antes de IVA/suplidos/
// retención), no el importe final — así lo define la propia fórmula SQL del servicio:
// importe = total + iva + suplidos - irpf. "importe" es el total final a pagar.
type FacturaRecibidaCabeceraApi = {
  idFacturaRecibida: number;
  numFacRec: string;
  idProveedor: number;
  nombreProveedor: string | null;
  concepto: string | null;
  total: number;
  iva: number;
  suplidos: number;
  irpf: number;
  importe: number;
  pagada: boolean;
  estado: number;
  escaneada: boolean;
  fechaFactura: string;
  fechaVencimiento: string;
  idMedioPago: number | null;
  idTipoFactura: number;
};

type FacturaRecibidaLineaApi = {
  idFacturaRecibidaLinea: number;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  importe: number;
  idImpuesto: number;
};

type FacturaRecibidaDetalleApi = FacturaRecibidaCabeceraApi & {
  lineas: FacturaRecibidaLineaApi[];
};

type CrearDesdeDocumentoApi = {
  factura: FacturaRecibidaDetalleApi;
  avisos: string[];
};

// El catálogo de Impuestos YA existe (Enumerar/{id}), pero deliberadamente no se usa aquí
// para reconstruir el IVA real por línea de facturas YA GUARDADAS en el backend — solo se
// usa en sentido contrario (ivaPct → idImpuesto) al CREAR/EDITAR líneas nuevas, donde el
// % ya es un dato de confianza (elegido por el usuario o extraído por el OCR). Reconstruir
// hacia atrás aquí exigiría volver a sumar el desglose por línea y compararlo contra
// dto.iva (el importe ya fiable que da el backend) para no arriesgarse a mostrar un
// desglose que no cuadre con el total — trabajo real, pendiente, no un simple lookup.
// Mientras tanto: totalesReales usa los importes ya calculados por el backend (fiables), y
// el desglose por tipo se sustituye por un aviso con el importe total de IVA en texto.
function mapearCabecera(dto: FacturaRecibidaCabeceraApi): FacturaRecibida {
  const base = dto.total;
  const retencionPctAprox = base > 0 ? Math.round((dto.irpf / base) * 100) : 0;

  const avisos: string[] = [];
  if (dto.iva > 0) {
    avisos.push(
      `IVA total de esta factura: ${formatEuros(dto.iva)}. El desglose por tipo no se ` +
      'recalcula aquí para no arriesgarse a que no cuadre con este importe, que ya es el real.'
    );
  }
  if (dto.suplidos > 0) {
    avisos.push(`Incluye ${formatEuros(dto.suplidos)} en suplidos, ya sumados al total a pagar.`);
  }
  avisos.push(
    'Esta factura viene del sistema real. Todavía no se puede editar desde aquí: no se puede ' +
    'reconstruir con garantías el IVA real de cada línea ya guardada. Si necesitas corregirla, ' +
    'bórrala y créala de nuevo.'
  );

  return {
    id: dto.idFacturaRecibida,
    proveedor: limpiarNombreProveedor(dto.nombreProveedor?.trim() || 'Proveedor no disponible'),
    // El backend ya resuelve este id para poder darnos nombreProveedor (hace el JOIN él
    // mismo) — nos lo da gratis, tiene sentido guardarlo ahora que el modelo lo admite.
    idProveedor: dto.idProveedor,
    numFactura: dto.numFacRec,
    fecha: dto.fechaFactura.slice(0, 10),
    vencimiento: dto.fechaVencimiento ? dto.fechaVencimiento.slice(0, 10) : undefined,
    concepto: dto.concepto?.trim() || undefined,
    // Sin etiqueta aquí (mapearCabecera es síncrono, resolver el label exige la caché
    // async de obtenerMediosPago) — la página de detalle resuelve el label a partir de
    // este id una vez ha cargado el catálogo, igual que hace con el proveedor.
    idMedioPago: dto.idMedioPago ?? undefined,
    lineas: [],
    retencionPct: retencionPctAprox,
    pagada: dto.pagada,
    estado: estadoDesdeApi(dto.estado),
    origenOcr: dto.escaneada,
    accountingLocked: true,
    accountingLockReason: 'Factura del sistema real: no se puede reconstruir el IVA real por línea para reeditarla.',
    avisosOcr: avisos,
    totalesReales: {
      base,
      desgloseIva: [],
      ivaTotal: dto.iva,
      retencion: {
        aplicable: dto.irpf > 0,
        etiqueta: 'Retención',
        porcentaje: retencionPctAprox,
        base,
        importe: dto.irpf,
      },
      total: dto.importe,
    },
  };
}

function mapearLinea(l: FacturaRecibidaLineaApi, nuevoId: () => number): LineaFactura {
  return {
    id: nuevoId(),
    origen: 'manual',
    descripcion: l.descripcion?.trim() || 'Sin descripción',
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    descuentoPct: 0,
    // No reconstruible sin el catálogo de Impuestos (ver mapearCabecera) — el importe de
    // IVA real de la factura completa sí se ve en el aviso de totalesReales.
    ivaPct: 0,
  };
}

type ImpuestoApi = {
  idImpuesto: number;
  descripcion: string | null;
  porcentaje: number;
  literalFactura: string | null;
  tipoFacturaE: string | null;
};

type TipoFacturaApi = {
  idTipoFactura: number;
  descriTipoNumerador: string | null;
  textoMail: string | null;
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
 * Adaptador híbrido: `listar`/`obtenerPorId`/`crearDesdeOcr`/`eliminar`/`crearManual`/
 * `actualizar` hablan con el backend real (FacturasRecibidasController, DocumentoController,
 * ImpuestoController — ver docs/OCR_BACKEND_INTEGRATION.md y
 * AUDITORIA_INTEGRACION_BACKEND.md). Solo `adjuntarDocumento` sigue delegado al mismo
 * almacén en memoria que usa MockReceivedInvoicesRepository (no existe endpoint de subida
 * de blobs todavía). `crearManual`/`actualizar` comparten `guardarReal()`, que resuelve
 * idProveedor/TipoFactura/Impuestos y llama a POST Guardar — siempre como alta (nunca
 * update): reeditar una factura YA guardada en el backend real está bloqueado en la UI
 * (accountingLocked, ver mapearCabecera) porque no se puede reconstruir con garantías el
 * IVA real de cada línea ya persistida — eliminar sí es real y no depende de este bloqueo,
 * ver eliminarRecibida() en mock-facturas.service.ts.
 */
@Injectable()
export class HttpReceivedInvoicesRepository extends ReceivedInvoicesRepository {
  private mockAdapter = inject(MockReceivedInvoicesRepository);
  private api = inject(ApiService);

  // Catálogos de referencia (Impuestos, TipoFactura): se resuelven una sola vez por sesión
  // — no cambian sin cerrar sesión, así que no tiene sentido pedirlos antes de cada línea o
  // cada guardado. Cacheadas como Promise (no como valor ya resuelto) para que llamadas
  // simultáneas mientras la primera todavía está en vuelo no disparen una segunda petición.
  private impuestosCache: Promise<ImpuestoApi[]> | null = null;
  private tipoFacturaCache: Promise<TipoFacturaApi> | null = null;
  private mediosPagoCache: Promise<MedioPagoApi[]> | null = null;

  async listar(filtros?: FiltrosListarRecibidas): Promise<FacturaRecibida[]> {
    // 'top' todavía no lo soporta el backend (Enumerar no pagina, devuelve todo lo que haya
    // para la empresa) — se manda ya para que, en cuanto lo soporte, empiece a limitar sin
    // tener que tocar nada más aquí. Mientras tanto no tiene efecto (el binding de ASP.NET
    // ignora campos que no existen en EnumerarFacturasRecibidasRequest).
    //
    // nombreProveedor/pagada/estado SÍ los soporta ya Enumerar — se mandan tal cual en vez
    // de descargarlo todo y filtrar en el cliente, así una búsqueda encuentra facturas
    // antiguas aunque no quepan en 'top'. Las fechas se quedan fuera a propósito (ver
    // FiltrosListarRecibidas: Enumerar solo admite año+mes, no un rango arbitrario) y se
    // siguen filtrando en la página, sobre lo que devuelva esto.
    const body: Record<string, unknown> = { top: PAGINA_TAMANO };
    if (filtros?.query?.trim()) body['nombreProveedor'] = filtros.query.trim();
    if (filtros?.pagada !== undefined) body['pagada'] = filtros.pagada;
    if (filtros?.estado !== undefined) body['estado'] = estadoHaciaApi(filtros.estado);

    const [cabeceras, locales] = await Promise.all([
      this.api.post<FacturaRecibidaCabeceraApi[]>(`${RECIBIDAS_BASE_PATH}/Enumerar`, body),
      // Sin filtros aquí a propósito: los borradores locales (OCR/manual/duplicar) tienen
      // que seguir viéndose aunque haya una búsqueda o un filtro de Pagada activo de antes
      // — si no, un usuario que acaba de escanear una factura la vería "desaparecer" de la
      // lista nada más crearla, solo porque no encajaba con un filtro que ni sabía que
      // seguía puesto. Son pocos y recientes, el coste de mostrarlos siempre es bajo.
      this.mockAdapter.listar(),
    ]);

    // Recorte también en el cliente: mientras el backend no soporte 'top' de verdad,
    // Enumerar sigue devolviendo la tabla entera de la empresa por red — esto NO arregla
    // esa descarga, pero sí evita renderizar/filtrar sobre cientos de tarjetas una vez ya
    // ha llegado la respuesta. Ya viene ordenado por fecha DESC desde el backend, así que
    // cortar los primeros PAGINA_TAMANO sigue siendo "las más recientes".
    const cabecerasRecortadas = (cabeceras ?? []).slice(0, PAGINA_TAMANO);

    // Los 2 registros de ejemplo del mock (id 1 y 2, fijos en MockFacturasService) son solo
    // demo y no tiene sentido mezclarlos con datos reales del backend. Los creados en esta
    // sesión sí (OCR/duplicar/manual, siempre id >= 100 por la convención ya existente de
    // nextRecibidaId): aunque Guardar ya es real, siguen siendo solo locales hasta que el
    // usuario pulsa "Guardar" en el detalle — sin este merge desaparecerían de la lista
    // nada más crearlas, antes de que a nadie le haya dado tiempo a revisarlas y guardarlas.
    const borradoresLocales = locales.filter(f => f.id >= 100);

    // BUG real encontrado en pruebas manuales (2026-08-14): antes se devolvían las reales
    // primero y los borradores locales anexados al final sin más, así que un borrador recién
    // creado (OCR/manual/duplicar) quedaba enterrado después de hasta 50 facturas reales —
    // el usuario veía el toast de "borrador creado" pero no lo encontraba en la lista sin
    // hacer scroll hasta el final. Se ordena todo junto por fecha DESC para que lo más
    // reciente (normalmente el borrador que se acaba de crear) aparezca arriba de verdad.
    const todas = [...cabecerasRecortadas.map(mapearCabecera), ...borradoresLocales];
    todas.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return todas;
  }

  async obtenerPorId(id: number): Promise<FacturaRecibida | undefined> {
    try {
      const dto = await this.api.get<FacturaRecibidaDetalleApi>(`${RECIBIDAS_BASE_PATH}/${id}`);
      if (dto) {
        const factura = mapearCabecera(dto);
        factura.lineas = (dto.lineas ?? []).map(l => mapearLinea(l, () => this.nuevoIdLinea()));
        return factura;
      }
    } catch (e) {
      // Solo un 404 real (no existe para esta empresa, o el id pertenece a un borrador
      // local todavía sin guardar) cae al almacén local — mismo criterio que eliminar().
      // BUG real encontrado en auditoría 2026-08-14: antes cualquier fallo (timeout, 500,
      // problema de red) caía aquí también, y si por casualidad existía un borrador local
      // con ese mismo id numérico, se mostraba esa factura equivocada sin ningún aviso de
      // que hubo un error real. Ahora cualquier error que no sea 404 se propaga tal cual.
      if (!esHttp404(e)) throw e;
    }
    return this.mockAdapter.obtenerPorId(id);
  }

  async crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida> {
    return this.guardarReal(data);
  }

  async actualizar(id: number, data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida> {
    // Alcanzable hoy SOLO sobre borradores locales (OCR/manual/duplicar): reeditar una
    // factura YA real está bloqueado en la UI (accountingLocked, ver mapearCabecera), así
    // que esto es siempre "primer guardado real de un borrador local", nunca una
    // actualización de verdad — se manda como alta (sin id), igual que crearManual, y
    // después se borra el borrador local, que deja de tener sentido una vez que ya existe
    // la versión real con su propio id (evita verla duplicada en la lista).
    const guardada = await this.guardarReal(data);
    this.mockAdapter.eliminar(id);
    return guardada;
  }

  async eliminar(id: number): Promise<void> {
    try {
      await this.api.delete(`${RECIBIDAS_BASE_PATH}/${id}`);
      return;
    } catch (e) {
      // Solo un 404 real (no existe para esta empresa, o el id es de un borrador local
      // todavía sin guardar) cae al almacén local. BUG real corregido 2026-08-14: antes se
      // tragaba CUALQUIER error aquí — si el backend llega a rechazar un borrado por una
      // regla de negocio (factura pagada / con analítica asociada, mencionada por el jefe
      // en reunión — a día de hoy EliminarAsync todavía no la implementa, pero puede
      // llegar en cualquier momento), el usuario veía "Factura eliminada" como si hubiera
      // ido bien, cuando en realidad la factura seguía existiendo en el backend.
      if (!esHttp404(e)) throw e;
    }
    this.mockAdapter.eliminar(id);
  }

  nuevoIdLinea(): number {
    return this.mockAdapter.nuevoIdLinea();
  }

  totales(factura: FacturaRecibida): TotalesFactura {
    // Facturas leídas del backend real ya traen sus totales oficiales (ver mapearCabecera)
    // — se usan tal cual en vez de recalcular desde 'lineas', que aquí no lleva el IVA real.
    if (factura.totalesReales) return factura.totalesReales;
    return this.mockAdapter.totales(factura);
  }

  adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }> {
    return this.mockAdapter.adjuntarDocumento(file);
  }

  accionesPermitidas(factura: FacturaRecibida): AccionesPermitidas {
    return this.mockAdapter.accionesPermitidas(factura);
  }

  duplicar(factura: FacturaRecibida): FacturaRecibida {
    // Recibe el objeto completo, no un id — así funciona igual para facturas locales
    // (mock) y para facturas reales del backend, que nunca están en el almacén del mock
    // (ver el comentario en el puerto: bug real corregido el 2026-08-13).
    return this.mockAdapter.duplicar(factura);
  }

  async crearDesdeOcr(file: File): Promise<FacturaRecibida> {
    const [respuesta, documento] = await Promise.all([
      this.api.postMultipart<OcrAnalyzeResponse>(OCR_ENDPOINT_PATH, file, 'file'),
      // El adjunto se queda igual que en el mock: guardado en local (Data URL) en el
      // propio dispositivo — la API de OCR no devuelve el fichero original (ni en
      // base64 ni de ninguna otra forma), así que esto no depende de su respuesta.
      // Ver la sección correspondiente en docs/OCR_BACKEND_INTEGRATION.md.
      this.mockAdapter.adjuntarDocumento(file),
    ]);

    if (!respuesta?.success || !respuesta.document?.invoice) {
      throw new Error('No se pudo extraer información del documento. Inténtalo de nuevo o crea la factura manualmente.');
    }

    const inv = respuesta.document.invoice;

    const lineas: LineaFactura[] = (inv.lines ?? []).map(l => {
      // Preferimos SIEMPRE taxable_base/line_total (el importe de la línea que ya calculó
      // el OCR) sobre reconstruirlo nosotros multiplicando cantidad × unit_price. Motivo,
      // detectado con una factura real de Iberdrola: unit_price suele venir redondeado a
      // menos decimales de los que usó el emisor internamente (ej. una tarifa
      // "0,120743 €/kW día"), así que cantidad × unit_price puede no coincidir con el
      // importe real de la línea — y sumado a lo largo de 8-9 líneas, ese pequeño desvío
      // se acumula y descuadra el total final. taxable_base/line_total, en cambio, es el
      // importe que el propio documento ya declara para esa línea, sin recalcular nada.
      const importeCalculado = numeroOpcional(l.taxable_base) ?? numeroOpcional(l.line_total);
      let cantidad: number;
      let precioUnitario: number;
      if (importeCalculado != null) {
        cantidad = 1;
        precioUnitario = importeCalculado;
      } else {
        // Último recurso: ni taxable_base ni line_total — solo entonces reconstruimos con
        // cantidad × precio, asumiendo el riesgo de imprecisión de arriba.
        cantidad = numeroDesde(l.quantity, 1);
        precioUnitario = numeroDesde(l.unit_price, 0);
      }

      return {
        id: this.nuevoIdLinea(),
        origen: 'manual' as const,
        descripcion: l.description?.trim() || 'Pendiente de revisar',
        cantidad,
        precioUnitario,
        descuentoPct: numeroDesde(l.discount_percent, 0),
        ivaPct: ivaPctDesdeLinea(l),
      };
    });

    if (lineas.length === 0) {
      lineas.push({
        id: this.nuevoIdLinea(),
        origen: 'manual',
        descripcion: 'Pendiente de revisar',
        cantidad: 1,
        precioUnitario: 0,
        descuentoPct: 0,
        ivaPct: 21,
      });
    }

    const retencionPct = this.retencionDesdeOcr(inv);

    // Blindaje: comparamos nuestro total calculado contra el que declara el propio
    // documento (totals.total del OCR) ANTES de dar la factura por buena. Detectado con 3
    // facturas reales distintas que descuadraban por motivos diferentes cada vez (orden de
    // redondeo, IVA por defecto en líneas exentas, recálculo impreciso de cantidad×precio)
    // — en vez de intentar anticipar el próximo caso raro de los ~100 modelos de factura
    // que existen, dejamos que cualquier futuro descuadre se detecte solo y avise al
    // usuario, en lugar de mostrar un número posiblemente incorrecto sin más.
    const avisosOcr: string[] = [...(respuesta.document.warnings ?? [])
      .filter((w): w is string => !!w?.trim())
      .map(w => `Aviso del motor de extracción: ${w}`)];

    const totalDeclarado = numeroOpcional(inv.totals?.total);
    if (totalDeclarado != null) {
      const cfgRetencion = { aplicable: retencionPct > 0, tipoCodigo: 'recibida', etiqueta: 'Retención', porcentaje: retencionPct };
      const totalCalculado = calcularTotalesLineas(lineas, cfgRetencion).total;
      // Comparación en céntimos enteros, no en el float directamente — 121.01 - 121 da
      // 0.010000000000005116 en JS, no 0.01 exacto, y una comparación ">" ingenua contra
      // 0.01 dispararía el aviso en un caso de redondeo normal que no es un error real.
      const diferenciaEnCentimos = Math.round((totalCalculado - totalDeclarado) * 100);
      if (Math.abs(diferenciaEnCentimos) > 1) {
        avisosOcr.push(
          `El total calculado a partir de las líneas (${formatEuros(totalCalculado)}) no coincide con el ` +
          `total declarado en el documento original (${formatEuros(totalDeclarado)}). Revisa las líneas antes de guardar.`
        );
      }
    }

    return this.mockAdapter.registrarRecibidaExtraida({
      proveedor: inv.issuer?.legal_name?.trim() || `Proveedor detectado (${file.name})`,
      proveedorNif: inv.issuer?.tax_id?.trim() || undefined,
      // Dirección del emisor — se usa para pre-rellenar la pantalla de alta de proveedor
      // (modo "Proveedor nuevo" de ProveedorSelectorComponent) cuando el NIF del OCR no
      // coincide con ningún proveedor ya existente.
      proveedorDireccion: inv.issuer?.address?.trim() || undefined,
      proveedorPoblacion: inv.issuer?.city?.trim() || undefined,
      proveedorCp: inv.issuer?.postal_code?.trim() || undefined,
      proveedorProvincia: inv.issuer?.province?.trim() || undefined,
      numFactura: inv.invoice_number?.trim() || '',
      fecha: inv.issue_date?.trim() || new Date().toISOString().slice(0, 10),
      // El vencimiento puede venir a nivel de factura o dentro de "payment" según el
      // documento — se prefiere el de payment por ser el más específico al pago en sí.
      vencimiento: inv.payment?.due_date?.trim() || inv.due_date?.trim() || undefined,
      formaPago: inv.payment?.payment_method?.trim() || undefined,
      concepto: 'Pendiente de revisar',
      lineas,
      retencionPct,
      pagada: false,
      estado: 'borrador',
      origenOcr: true,
      documentoUrl: documento.documentoUrl,
      documentoNombre: documento.documentoNombre,
      avisosOcr: avisosOcr.length > 0 ? avisosOcr : undefined,
    });
  }

  // "Guardado rápido" (pedido por el jefe, reunión 2026-08-14): el backend hace todo de una
  // vez (OCR + guardar + subir el PDF a Blob Storage) y devuelve la factura ya real — se
  // mapea igual que obtenerPorId/listar (mapearCabecera/mapearLinea), con el mismo
  // accountingLocked=true de cualquier factura leída del sistema real. Los avisos propios
  // del endpoint (total que no cuadra, fallo al subir el documento) se añaden a avisosOcr,
  // junto a la explicación habitual de por qué las líneas no traen el IVA real reconstruido.
  async crearDesdeDocumentoDirecto(file: File): Promise<FacturaRecibida> {
    const resultado = await this.api.postMultipart<CrearDesdeDocumentoApi>(
      `${RECIBIDAS_BASE_PATH}/CrearDesdeDocumento`, file, 'file',
    );

    const factura = mapearCabecera(resultado.factura);
    factura.lineas = (resultado.factura.lineas ?? []).map(l => mapearLinea(l, () => this.nuevoIdLinea()));
    if (resultado.avisos?.length) {
      factura.avisosOcr = [...(factura.avisosOcr ?? []), ...resultado.avisos];
    }
    return factura;
  }

  // Preferimos un withholding_rate ya explícito en alguna línea (lo habitual: la misma
  // retención aplica a toda la factura de un proveedor). Si no hay ninguno, lo calculamos
  // a partir de los importes totales (withholding / taxable_base) — solo si ambos vienen.
  // Sin ninguno de los dos, 0 (sin retención), igual que antes.
  private retencionDesdeOcr(inv: OcrInvoice): number {
    const tasaDeLinea = (inv.lines ?? [])
      .map(l => numeroOpcional(l.withholding_rate))
      .find((v): v is number => v != null);
    if (tasaDeLinea != null) return irpfMasCercano(tasaDeLinea);

    const retenido = numeroOpcional(inv.totals?.withholding);
    const base = numeroOpcional(inv.totals?.taxable_base);
    if (retenido != null && base != null && base > 0) {
      return irpfMasCercano((retenido / base) * 100);
    }

    return 0;
  }

  // Catálogo de Impuestos (id_impuesto → %), confirmado en Controllers/ImpuestoController.cs
  // + Services/ImpuestoService.cs (2026-08-14). El controlador se llama "Impuesto"
  // (singular) — la ruta es /api/Impuesto, no /api/Impuestos. 'tipo' es obligatorio en
  // Enumerar (el backend devuelve 400 sin él); aquí solo pedimos IVA — Recibidas no maneja
  // IPSI/IGIC (Canarias/Ceuta/Melilla) todavía.
  private async obtenerImpuestos(): Promise<ImpuestoApi[]> {
    if (!this.impuestosCache) {
      this.impuestosCache = this.api.post<ImpuestoApi[]>(
        `${IMPUESTOS_BASE_PATH}/Enumerar`,
        { tipo: TIPO_IMPUESTO_IVA },
      );
    }
    return this.impuestosCache;
  }

  // Sentido contrario a la lectura: aquí ivaPct ya es un dato de confianza (elegido por el
  // usuario o extraído por el OCR), así que basta con encontrar la fila del catálogo con
  // ese porcentaje. Confirmado con el jefe: puede haber más de un id_impuesto con el mismo
  // porcentaje para la misma empresa — en ese caso, se usa el primero tal cual lo devuelve
  // el backend (decisión suya, no arbitraria de aquí).
  private async resolverIdImpuesto(ivaPct: number): Promise<number> {
    const catalogo = await this.obtenerImpuestos();
    const encontrado = catalogo.find(i => i.porcentaje === ivaPct);
    if (!encontrado) {
      throw new Error(
        `No existe en el catálogo de impuestos ningún tipo de IVA al ${ivaPct}%. ` +
        'Revisa el IVA de esa línea o pide que se añada ese tipo en el catálogo.'
      );
    }
    return encontrado.idImpuesto;
  }

  // GET /api/FacturasRecibidas/TipoFactura?idEmpresa=X — no es un catálogo seleccionable,
  // es el único TipoFactura configurado para "Facturas" en esta empresa (fijo, no varía
  // durante el uso de la app).
  private async obtenerTipoFactura(): Promise<TipoFacturaApi> {
    if (!this.tipoFacturaCache) {
      this.tipoFacturaCache = this.api.get<TipoFacturaApi>(`${RECIBIDAS_BASE_PATH}/TipoFactura`);
    }
    return this.tipoFacturaCache;
  }

  private async obtenerMediosPagoApi(): Promise<MedioPagoApi[]> {
    if (!this.mediosPagoCache) {
      this.mediosPagoCache = this.api.post<MedioPagoApi[]>(`${MEDIOS_PAGO_BASE_PATH}/Enumerar`, {});
    }
    return this.mediosPagoCache;
  }

  // Catálogo seleccionable para el desplegable "Forma de pago" del detalle — a diferencia
  // de Impuestos/TipoFactura (que se resuelven solos, sin que el usuario elija nada), este
  // sí hay que listarlo entero para que la persona pueda escoger una opción.
  async obtenerMediosPago(): Promise<MedioPagoOpcion[]> {
    const catalogo = await this.obtenerMediosPagoApi();
    return (catalogo ?? []).map(m => ({ id: m.idMedioPago, label: etiquetaMedioPago(m) }));
  }

  // Reutiliza el mismo catálogo de Impuestos que resuelve idImpuesto al guardar — así el
  // desplegable de % de IVA de cada línea solo ofrece porcentajes que de verdad existen
  // para esta empresa, en vez de la lista fija [0, 4, 10, 21] que se usaba antes (podía no
  // coincidir con el catálogo real y hacer fallar el guardado con un % inexistente).
  async obtenerPorcentajesIva(): Promise<number[]> {
    const catalogo = await this.obtenerImpuestos();
    const porcentajes = [...new Set(catalogo.map(i => i.porcentaje))];
    return porcentajes.sort((a, b) => a - b);
  }

  // El guardado real, común a crearManual (siempre alta) y actualizar (alta también, ver
  // el comentario en ese método — reeditar una factura ya real está bloqueado hoy).
  private async guardarReal(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): Promise<FacturaRecibida> {
    if (!data.idProveedor) {
      throw new Error(
        'Selecciona el proveedor de la lista (o créalo) antes de guardar — no se puede ' +
        'guardar una factura solo con el nombre en texto.'
      );
    }
    if (!data.numFactura?.trim()) {
      throw new Error('El número de factura es obligatorio.');
    }
    if (data.lineas.length === 0) {
      throw new Error('La factura necesita al menos una línea.');
    }

    const [tipoFactura, lineasConImpuesto] = await Promise.all([
      this.obtenerTipoFactura(),
      Promise.all(data.lineas.map(async l => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        idImpuesto: await this.resolverIdImpuesto(l.ivaPct),
      }))),
    ]);

    const cfgRetencion: ConfiguracionRetencion = {
      aplicable: data.retencionPct > 0, tipoCodigo: 'recibida', etiqueta: 'Retención', porcentaje: data.retencionPct,
    };
    const totales = calcularTotalesLineas(data.lineas, cfgRetencion);

    const body = {
      idProveedor: data.idProveedor,
      numFacRec: data.numFactura.trim(),
      // concepto es obligatorio en Guardar; si el usuario lo dejó vacío, usamos el número
      // de factura como mínimo válido en vez de bloquear el guardado por esto.
      concepto: data.concepto?.trim() || data.numFactura.trim(),
      total: totales.base,
      iva: totales.ivaTotal,
      suplidos: 0, // esta app no maneja suplidos en Recibidas todavía
      irpf: totales.retencion.importe,
      pagada: data.pagada,
      fechaFactura: data.fecha,
      fechaVencimiento: data.vencimiento || data.fecha,
      idMedioPago: data.idMedioPago ?? null,
      idTipoFactura: tipoFactura.idTipoFactura,
      estado: estadoHaciaApi(data.estado),
      escaneada: !!data.documentoUrl,
      lineas: lineasConImpuesto,
    };

    const dto = await this.api.post<FacturaRecibidaDetalleApi>(`${RECIBIDAS_BASE_PATH}/Guardar`, body);

    // No pasa por mapearCabecera/mapearLinea a propósito: esas funciones asumen que no
    // conocemos el IVA real por línea (el caso de leer algo ya existente vía Enumerar/
    // Obtener). Aquí SÍ lo conocemos — acabamos de resolverlo nosotros mismos — así que se
    // devuelve la factura tal cual la teníamos, solo con el id real que ha asignado el
    // backend. Tampoco se marca accountingLocked: no hay motivo para bloquear reeditar algo
    // que acabamos de guardar en la misma sesión con datos que sí conocemos bien.
    return { ...data, id: dto.idFacturaRecibida, origenOcr: !!data.documentoUrl };
  }
}
