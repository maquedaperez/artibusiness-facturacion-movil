import { Injectable, inject } from '@angular/core';
import { FiltrosListarRecibidas, ReceivedInvoicesRepository } from '../../ports/received-invoices.repository';
import { MockReceivedInvoicesRepository } from '../mock/received-invoices.repository.mock';
import { ApiService } from '../../../services/api.service';
import {
  AccionesPermitidas, FacturaRecibida, IRPF_RATES, LineaFactura, TotalesFactura,
  calcularTotalesLineas,
} from '../../../services/mock-facturas.service';
import { formatEuros } from '../../../shared/utils/format-euros';

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

// El backend no expone (todavía) un catálogo de Impuestos que traduzca id_impuesto → %,
// así que no podemos reconstruir con garantías el IVA real de cada línea — inventar un
// porcentaje sería exactamente el tipo de número "posiblemente incorrecto sin más" que
// avisosOcr existe para evitar. En su lugar: totalesReales usa los importes ya calculados
// por el backend (fiables), y el desglose por tipo se sustituye por un aviso con el
// importe total de IVA en texto. Cuando el backend publique el catálogo de Impuestos, este
// mapeo puede reconstruir 'lineas' con ivaPct real y dejar de necesitar el aviso.
function mapearCabecera(dto: FacturaRecibidaCabeceraApi): FacturaRecibida {
  const base = dto.total;
  const retencionPctAprox = base > 0 ? Math.round((dto.irpf / base) * 100) : 0;

  const avisos: string[] = [];
  if (dto.iva > 0) {
    avisos.push(
      `IVA total de esta factura: ${formatEuros(dto.iva)}. El desglose por tipo no está ` +
      'disponible todavía: el backend aún no expone el catálogo de impuestos.'
    );
  }
  if (dto.suplidos > 0) {
    avisos.push(`Incluye ${formatEuros(dto.suplidos)} en suplidos, ya sumados al total a pagar.`);
  }
  avisos.push(
    'Esta factura viene del sistema real. Todavía no se puede editar ni eliminar desde aquí: ' +
    'falta que el backend publique los catálogos de impuestos, tipos de factura y proveedores.'
  );

  return {
    id: dto.idFacturaRecibida,
    proveedor: dto.nombreProveedor?.trim() || 'Proveedor no disponible',
    numFactura: dto.numFacRec,
    fecha: dto.fechaFactura.slice(0, 10),
    vencimiento: dto.fechaVencimiento ? dto.fechaVencimiento.slice(0, 10) : undefined,
    concepto: dto.concepto?.trim() || undefined,
    lineas: [],
    retencionPct: retencionPctAprox,
    pagada: dto.pagada,
    estado: estadoDesdeApi(dto.estado),
    origenOcr: dto.escaneada,
    accountingLocked: true,
    accountingLockReason: 'Factura del sistema real: edición pendiente del catálogo de impuestos/proveedores.',
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

/**
 * Adaptador híbrido: `listar`/`obtenerPorId` y `crearDesdeOcr` hablan con el backend real
 * (FacturasRecibidasController y DocumentoController respectivamente — ver
 * docs/OCR_BACKEND_INTEGRATION.md y AUDITORIA_INTEGRACION_BACKEND.md). El resto
 * (crearManual/actualizar/eliminar/adjuntarDocumento) sigue delegado al mismo almacén en
 * memoria que usa MockReceivedInvoicesRepository, porque el backend todavía no expone los
 * catálogos (Impuestos, TipoFactura, Proveedores) que exige POST .../Guardar — conectar en
 * cuanto existan. Mientras tanto, toda factura leída del backend real se marca
 * accountingLocked para que la UI no ofrezca editarla/eliminarla (ver mapearCabecera).
 */
@Injectable()
export class HttpReceivedInvoicesRepository extends ReceivedInvoicesRepository {
  private mockAdapter = inject(MockReceivedInvoicesRepository);
  private api = inject(ApiService);

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
    // nextRecibidaId): todavía no hay endpoint para persistirlos contra el backend (Guardar
    // exige catálogos de impuestos/proveedores que no existen aún), así que sin este merge
    // desaparecerían de la lista nada más crearlos.
    const borradoresLocales = locales.filter(f => f.id >= 100);

    return [...cabecerasRecortadas.map(mapearCabecera), ...borradoresLocales];
  }

  async obtenerPorId(id: number): Promise<FacturaRecibida | undefined> {
    try {
      const dto = await this.api.get<FacturaRecibidaDetalleApi>(`${RECIBIDAS_BASE_PATH}/${id}`);
      if (dto) {
        const factura = mapearCabecera(dto);
        factura.lineas = (dto.lineas ?? []).map(l => mapearLinea(l, () => this.nuevoIdLinea()));
        return factura;
      }
    } catch {
      // 404 del backend (no existe para esta empresa) o el id pertenece a un borrador
      // local todavía sin endpoint de guardado (OCR/manual/duplicar) — en ambos casos
      // caemos al almacén local, igual que hace listar() con los borradores de sesión.
    }
    return this.mockAdapter.obtenerPorId(id);
  }

  crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida {
    return this.mockAdapter.crearManual(data);
  }

  actualizar(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): void {
    this.mockAdapter.actualizar(id, cambios);
  }

  eliminar(id: number): void {
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

  duplicar(id: number): FacturaRecibida | undefined {
    return this.mockAdapter.duplicar(id);
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
      // Dirección del emisor — no se usa todavía para nada (Proveedores/Crear no existe en
      // el backend aún), solo se guarda ya lista para cuando exista, en vez de tener que
      // volver a tocar este mapeo entonces.
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
}
