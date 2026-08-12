import { Injectable, inject } from '@angular/core';
import { ReceivedInvoicesRepository } from '../../ports/received-invoices.repository';
import { MockReceivedInvoicesRepository } from '../mock/received-invoices.repository.mock';
import { ApiService } from '../../../services/api.service';
import { AccionesPermitidas, FacturaRecibida, IRPF_RATES, LineaFactura, TotalesFactura } from '../../../services/mock-facturas.service';

// Confirmado contra el código real de WebAPIARTIBusiness (Controllers/DocumentoController.cs
// + Services/DocumentoService.cs): [Authorize] con el mismo esquema JWT que ya usa el login,
// y reenvía el body de la API de OCR sin transformar (`Content = resultado.Json`, el string
// tal cual que devolvió Railway) — coincide exactamente con lo asumido en el mapeo de abajo.
const OCR_ENDPOINT_PATH = '/api/Documento/analizar';

// Subconjunto de AnalyzeDocumentResponse (openapi.json de ARTI-Invoice-Reader-Handoff)
// que realmente se usa aquí — todos los campos son opcionales/nulos según el propio
// esquema, el documento puede venir con extracción parcial.
type OcrParty = {
  legal_name?: string | null;
  tax_id?: string | null;
};

type OcrLine = {
  description?: string | null;
  quantity?: string | null;
  unit_price?: string | null;
  discount_percent?: string | null;
  tax_rate?: string | null;
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

/**
 * Adaptador híbrido: solo `crearDesdeOcr` habla con el backend real (que a su vez
 * llama a la API de OCR guardando el token en el servidor — ver
 * docs/OCR_BACKEND_INTEGRATION.md). El resto de operaciones de Recibidas
 * (listar/crear-manual/editar/eliminar) siguen sin tener endpoint propio en el backend
 * (gap #13 de SERVICE_CONTRACT_GAPS.md), así que se delegan al mismo almacén en
 * memoria que usa MockReceivedInvoicesRepository — la factura extraída de verdad se
 * guarda ahí mismo mediante registrarRecibidaExtraida.
 *
 * Todavía NO está enchufado en mock.providers.ts — activar solo cuando el backend
 * confirme la URL del endpoint y el formato de respuesta.
 */
@Injectable()
export class HttpReceivedInvoicesRepository extends ReceivedInvoicesRepository {
  private mockAdapter = inject(MockReceivedInvoicesRepository);
  private api = inject(ApiService);

  listar(): FacturaRecibida[] {
    return this.mockAdapter.listar();
  }

  obtenerPorId(id: number): FacturaRecibida | undefined {
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
      const unitPrice = numeroOpcional(l.unit_price);
      // Con unit_price presente, respetamos cantidad × precio tal cual venga. Sin él
      // (habitual en facturas de servicios/abonos sin desglose por unidad), tratamos la
      // línea como 1 unidad cuyo "precio" es el importe que el OCR ya calculó para toda
      // la línea — si además tomáramos una quantity suelta aquí, multiplicaríamos el
      // importe por error.
      const cantidad = unitPrice != null ? numeroDesde(l.quantity, 1) : 1;
      const precioUnitario = unitPrice ?? numeroDesde(l.taxable_base ?? l.line_total, 0);

      return {
        id: this.nuevoIdLinea(),
        origen: 'manual' as const,
        descripcion: l.description?.trim() || 'Pendiente de revisar',
        cantidad,
        precioUnitario,
        descuentoPct: numeroDesde(l.discount_percent, 0),
        ivaPct: numeroDesde(l.tax_rate, 21),
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

    return this.mockAdapter.registrarRecibidaExtraida({
      proveedor: inv.issuer?.legal_name?.trim() || `Proveedor detectado (${file.name})`,
      proveedorNif: inv.issuer?.tax_id?.trim() || undefined,
      numFactura: inv.invoice_number?.trim() || '',
      fecha: inv.issue_date?.trim() || new Date().toISOString().slice(0, 10),
      // El vencimiento puede venir a nivel de factura o dentro de "payment" según el
      // documento — se prefiere el de payment por ser el más específico al pago en sí.
      vencimiento: inv.payment?.due_date?.trim() || inv.due_date?.trim() || undefined,
      formaPago: inv.payment?.payment_method?.trim() || undefined,
      concepto: 'Pendiente de revisar',
      lineas,
      retencionPct: this.retencionDesdeOcr(inv),
      pagada: false,
      estado: 'borrador',
      origenOcr: true,
      documentoUrl: documento.documentoUrl,
      documentoNombre: documento.documentoNombre,
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
