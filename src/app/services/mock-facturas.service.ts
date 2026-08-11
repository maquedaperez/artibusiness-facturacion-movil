import { Injectable } from '@angular/core';
import { PaginaResultado } from '../shared/types/pagination';

export type EstadoFactura = 'borrador' | 'contabilizada' | 'firmada';
export type EstadoAeat = 'PendienteEnvio' | 'Correcto' | 'AceptadoConErrores' | 'RechazadoAeat' | 'RequiereRevisionManual';

export type Numerador = {
  id: number;
  nombre: string;
};

// Forma alineada con Clientes/ClienteUsuario del backend real (findbynif/findbyname/insert).
export type ClienteMock = {
  id: number;
  nif: string;
  nombre: string;
  esEmpresa: boolean;
  direccion?: string;
  poblacion?: string;
  cp?: string;
  provincia?: string;
};

export type Destinatario = Omit<ClienteMock, 'id'>;

// Selector ligero de proveedor (buscar + alta rápida), igual que ClienteMock pero
// para el lado de Facturas Recibidas. No es una ficha de proveedor completa
// (eso incluiría mucho más en la web real) — solo lo mínimo para no escribir a
// mano el proveedor y su NIF en cada factura recibida.
export type ProveedorMock = {
  id: number;
  nif: string;
  nombre: string;
  direccion?: string;
  poblacion?: string;
  cp?: string;
  provincia?: string;
};

// Datos fiscales del emisor (nuestra empresa/tenant). Alineado con el modelo real
// Empresa.cs (CifEmpresa, IdDireccion, RegistroMercantil/Hoja/Folio/Tomo, Cnae, Iban, Swift),
// más el toggle autónomo/empresa que pidió el jefe — pendiente de confirmar si el backend
// real lo soporta (Empresa.cs de ARTI Software no lo tenía, pero puede variar por cliente).
export type EmisorFiscal = {
  esEmpresa: boolean;
  nombre: string;
  nif: string;
  direccion: string;
  poblacion: string;
  cp: string;
  provincia: string;
  telefono: string;
  registroMercantil: string;
  cnae: string;
  iban: string;
  swift: string;
};

// Únicos campos que el usuario puede actualizar desde la app — nombre, NIF/CIF y
// esEmpresa son identidad fiscal y llegan de alta/backend, no de este formulario.
// registroMercantil/cnae/iban/swift tampoco están en el contrato de actualización
// aprobado; se muestran de solo lectura hasta que exista un endpoint específico.
export type EmisorContactoEditable = Pick<EmisorFiscal, 'direccion' | 'poblacion' | 'cp' | 'provincia' | 'telefono'>;

// Forma alineada con FacturacionFacturasEmitidasLineas del backend real.
// ivaPct sustituye a IdImpuesto (catálogo de impuestos) mientras no exista el endpoint.
export type LineaFactura = {
  id: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  ivaPct: number;
};

export type FacturaEmitida = {
  id: number;
  numFactura: string;
  numeradorId: number;
  fecha: string;
  vencimiento: string;
  // Obligatorio para el registro fiscal — el servidor FacturaE rechaza la factura
  // con error AEAT 4102 si va vacío. Confirmado contra un caso real de producción.
  concepto: string;
  // Obligatorio en el modelo real (IdMedioPago, no admite nulo).
  medioPago: string;
  destinatario: Destinatario;
  lineas: LineaFactura[];
  estado: EstadoFactura;
  estadoAeat?: EstadoAeat;
  // Campo técnico, no se muestra al usuario: se genera al crear el borrador (no al
  // contabilizar) porque el servidor real lo exige en la petición y lo rechaza sin él.
  operacionId: string;
};

export type DesgloseIva = { pct: number; baseGravada: number; cuota: number };

// La retención (IRPF, alquiler, etc.) no es un dato de la factura ni de una línea —
// la decide la configuración fiscal del emisor/actividad y se calcula al vuelo sobre
// la base imponible ya calculada, nunca la elige el usuario en el formulario.
export type ConfiguracionRetencion = {
  aplicable: boolean;
  // Código interno para identificar la regla (uso interno/futuro, no se muestra).
  tipoCodigo: string;
  // Texto que sí ve el usuario — "IRPF", "Retención alquiler", etc., según lo que
  // devuelva el backend real.
  etiqueta: string;
  porcentaje: number;
  motivoNoAplica?: string;
};

export type RetencionAplicada = {
  aplicable: boolean;
  etiqueta: string;
  porcentaje: number;
  // Base sobre la que se calcula — todos los conceptos satisfechos, excluido el IVA.
  base: number;
  importe: number;
  motivoNoAplica?: string;
};

export type TotalesFactura = {
  base: number;
  desgloseIva: DesgloseIva[];
  ivaTotal: number;
  retencion: RetencionAplicada;
  total: number;
};

// Regla general de retenciones por alquiler/subarrendamiento de inmuebles urbanos
// sujeto (AEAT, Reglamento IRPF art. 100): 19% sobre todos los conceptos satisfechos
// al arrendador, excluido el IVA. Existen excepciones (vivienda de empleados, renta
// anual ≤ 900€ sin IVA, arrendadores exonerados por epígrafe IAE, reglas territoriales
// y de no residentes) que solo el backend puede resolver caso a caso — por eso esta
// configuración NO se aplica a las facturas del MVP en vivo, solo a tests y fixtures
// aisladas que demuestran que el cálculo/formato son correctos cuando sí aplica.
export const CONFIGURACION_RETENCION_ALQUILER_DEMO: ConfiguracionRetencion = {
  aplicable: true,
  tipoCodigo: 'alquiler_urbano',
  etiqueta: 'Retención alquiler',
  porcentaje: 19,
};

function redondearCentimos(v: number): number {
  return Math.round(v * 100) / 100;
}

export function aplicarRetencion(baseImponible: number, cfg: ConfiguracionRetencion): RetencionAplicada {
  const importe = cfg.aplicable ? redondearCentimos(baseImponible * cfg.porcentaje / 100) : 0;
  return {
    aplicable: cfg.aplicable,
    etiqueta: cfg.etiqueta,
    porcentaje: cfg.porcentaje,
    base: baseImponible,
    importe,
    motivoNoAplica: cfg.aplicable ? undefined : (cfg.motivoNoAplica ?? 'No aplica retención para este emisor.'),
  };
}

export type FacturaRecibida = {
  id: number;
  proveedor: string;
  proveedorNif?: string;
  numFactura: string;
  fecha: string;
  vencimiento?: string;
  concepto?: string;
  formaPago?: string;
  baseImponible: number;
  // % aplicados sobre baseImponible — iva/irpf son el importe ya calculado (para mostrar
  // en el listado y alinear con las columnas reales del backend), no se escriben a mano.
  ivaPct: number;
  iva: number;
  irpfPct: number;
  irpf: number;
  totalFactura: number;
  pagada: boolean;
  estado: 'borrador' | 'contabilizada';
  origenOcr: boolean;
  documentoUrl?: string;
  documentoNombre?: string;
};

const ESTADO_AEAT_LABELS: Record<EstadoAeat, string> = {
  PendienteEnvio: 'Pendiente de envío',
  Correcto: 'Correcto',
  AceptadoConErrores: 'Aceptado con errores',
  RechazadoAeat: 'Rechazado por AEAT',
  RequiereRevisionManual: 'Requiere revisión manual',
};

export const IVA_RATES = [0, 4, 10, 21];
export const IRPF_RATES = [0, 1, 7, 15, 19];
// Placeholder mientras no exista el catálogo real de medios de pago (IdMedioPago).
export const MEDIO_PAGO_OPTIONS = ['Transferencia', 'Domiciliación', 'Tarjeta', 'Efectivo', 'Cheque'];

let nextEmitidaId = 100;
let nextLineaId = 1000;
let nextClienteId = 100;
let nextRecibidaId = 100;
let nextProveedorId = 100;

@Injectable({ providedIn: 'root' })
export class MockFacturasService {
  private emisor: EmisorFiscal = {
    esEmpresa: true,
    nombre: 'Mi Empresa de Ejemplo S.L.',
    nif: 'B00000000',
    direccion: 'Calle de Ejemplo 1',
    poblacion: 'Madrid',
    cp: '28001',
    provincia: 'Madrid',
    telefono: '',
    registroMercantil: '',
    cnae: '',
    iban: '',
    swift: '',
  };

  // Configuración por defecto del MVP: sin retención. La fixture de alquiler urbano
  // (CONFIGURACION_RETENCION_ALQUILER_DEMO) es solo para tests, no se aplica aquí.
  private configuracionRetencion: ConfiguracionRetencion = {
    aplicable: false,
    tipoCodigo: 'ninguna',
    etiqueta: 'Retención',
    porcentaje: 0,
  };

  private numeradores: Numerador[] = [
    { id: 1, nombre: 'Serie A 2026' },
    { id: 2, nombre: 'Serie B 2026' },
  ];

  private clientes: ClienteMock[] = [
    {
      id: 1, nif: 'B12345678', nombre: 'Clínica Dental Sonrisas SL', esEmpresa: true,
      direccion: 'Calle Mayor 12', poblacion: 'Madrid', cp: '28013', provincia: 'Madrid',
    },
    {
      id: 2, nif: 'A87654321', nombre: 'Transportes Ibáñez SA', esEmpresa: true,
      direccion: 'Polígono Industrial Norte, Nave 4', poblacion: 'Getafe', cp: '28905', provincia: 'Madrid',
    },
    {
      id: 3, nif: '12345678Z', nombre: 'María Fernández López', esEmpresa: false,
      direccion: 'Avenida de la Constitución 5', poblacion: 'Alcorcón', cp: '28921', provincia: 'Madrid',
    },
    {
      id: 4, nif: 'B99887766', nombre: 'Asesoría Martín & Ruiz SL', esEmpresa: true,
      direccion: 'Calle Alcalá 200', poblacion: 'Madrid', cp: '28028', provincia: 'Madrid',
    },
  ];

  private proveedores: ProveedorMock[] = [
    {
      id: 1, nif: 'B11223344', nombre: 'Suministros Oficina Norte SL',
      direccion: 'Calle del Almacén 8', poblacion: 'Madrid', cp: '28022', provincia: 'Madrid',
    },
    {
      id: 2, nif: '44556677Q', nombre: 'Electricidad Vidal e Hijos',
      direccion: 'Polígono Industrial Sur, Nave 12', poblacion: 'Alcobendas', cp: '28108', provincia: 'Madrid',
    },
  ];

  private emitidas: FacturaEmitida[] = [
    {
      id: 1, numFactura: 'A-2026-014', numeradorId: 1, fecha: '2026-08-05', vencimiento: '2026-09-04',
      concepto: 'Revisión anual de instalación', medioPago: 'Transferencia',
      destinatario: this.clientes[0],
      lineas: [
        { id: 1, descripcion: 'Revisión anual instalación', cantidad: 1, precioUnitario: 1200, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'borrador', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 2, numFactura: 'A-2026-015', numeradorId: 1, fecha: '2026-08-07', vencimiento: '2026-09-06',
      concepto: 'Servicio de transporte mensual', medioPago: 'Domiciliación',
      destinatario: this.clientes[1],
      lineas: [
        { id: 2, descripcion: 'Servicio de transporte mensual', cantidad: 1, precioUnitario: 850, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'borrador', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 3, numFactura: 'A-2026-011', numeradorId: 1, fecha: '2026-07-28', vencimiento: '2026-08-27',
      concepto: 'Asesoría fiscal — julio 2026', medioPago: 'Transferencia',
      destinatario: this.clientes[3],
      lineas: [
        { id: 3, descripcion: 'Asesoría fiscal julio', cantidad: 1, precioUnitario: 600, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'contabilizada', estadoAeat: 'PendienteEnvio', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 4, numFactura: 'B-2026-003', numeradorId: 2, fecha: '2026-07-30', vencimiento: '2026-08-29',
      concepto: 'Reparación de flota y gestoría asociada', medioPago: 'Transferencia',
      destinatario: this.clientes[1],
      lineas: [
        { id: 4, descripcion: 'Reparación flota', cantidad: 1, precioUnitario: 2100, descuentoPct: 0, ivaPct: 21 },
        { id: 5, descripcion: 'Tasas de gestoría', cantidad: 1, precioUnitario: 35, descuentoPct: 0, ivaPct: 0 },
      ],
      estado: 'contabilizada', estadoAeat: 'RequiereRevisionManual', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 5, numFactura: 'A-2026-009', numeradorId: 1, fecha: '2026-07-15', vencimiento: '2026-08-14',
      concepto: 'Suministro de material fungible', medioPago: 'Tarjeta',
      destinatario: this.clientes[0],
      lineas: [
        { id: 6, descripcion: 'Material fungible', cantidad: 1, precioUnitario: 340, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'firmada', estadoAeat: 'Correcto', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 6, numFactura: 'A-2026-008', numeradorId: 2, fecha: '2026-07-10', vencimiento: '2026-08-09',
      concepto: 'Consultoría de proceso y mantenimiento', medioPago: 'Transferencia',
      destinatario: this.clientes[3],
      lineas: [
        { id: 7, descripcion: 'Consultoría de proceso A', cantidad: 2, precioUnitario: 50, descuentoPct: 0, ivaPct: 21 },
        { id: 8, descripcion: 'Mantenimiento B', cantidad: 3, precioUnitario: 20, descuentoPct: 8.33, ivaPct: 10 },
      ],
      estado: 'firmada', estadoAeat: 'AceptadoConErrores', operacionId: this.nuevoOperacionId(),
    },
  ];

  private recibidas: FacturaRecibida[] = [
    {
      id: 1, proveedor: 'Suministros Oficina Norte SL', proveedorNif: 'B11223344',
      numFactura: 'F-4521', fecha: '2026-08-04', vencimiento: '2026-08-18',
      concepto: 'Material de oficina', formaPago: 'Domiciliación',
      baseImponible: 154.81, ivaPct: 21, iva: 32.51, irpfPct: 0, irpf: 0, totalFactura: 187.32,
      pagada: true, estado: 'contabilizada', origenOcr: false,
    },
    {
      id: 2, proveedor: 'Electricidad Vidal e Hijos', proveedorNif: '44556677Q',
      numFactura: 'FV-2026-0912', fecha: '2026-08-06', vencimiento: '2026-08-20',
      concepto: 'Suministro eléctrico', formaPago: 'Domiciliación',
      baseImponible: 448.02, ivaPct: 21, iva: 94.08, irpfPct: 0, irpf: 0, totalFactura: 542.10,
      pagada: false, estado: 'borrador', origenOcr: true,
    },
  ];

  // ---------- Emisor (datos fiscales de la empresa) ----------

  getEmisor(): EmisorFiscal {
    return { ...this.emisor };
  }

  // Solo admite los campos de contacto — nombre, NIF/CIF y esEmpresa son identidad
  // fiscal y no se pueden reescribir desde aquí, ni aunque el payload los incluyera.
  actualizarEmisor(data: EmisorContactoEditable): void {
    this.emisor = {
      ...this.emisor,
      direccion: data.direccion,
      poblacion: data.poblacion,
      cp: data.cp,
      provincia: data.provincia,
      telefono: data.telefono,
    };
  }

  // ---------- Numeradores ----------

  getNumeradores(): Numerador[] {
    return [...this.numeradores];
  }

  numeradorNombre(id: number): string {
    return this.numeradores.find(n => n.id === id)?.nombre ?? '—';
  }

  // ---------- Clientes ----------

  // Búsqueda bajo demanda: con menos de 2 caracteres no devuelve nada (nunca "todos
  // los clientes") — el mismo mínimo que exige el selector en el componente, pero
  // reforzado aquí para que la regla no dependa solo de la UI.
  async buscarClientesPaginado(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ClienteMock>> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const todos = this.clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q)
    );
    const inicio = (page - 1) * pageSize;
    return { items: todos.slice(inicio, inicio + pageSize), total: todos.length, page, pageSize };
  }

  crearClienteAdHoc(data: Destinatario): ClienteMock {
    const nuevo: ClienteMock = { id: nextClienteId++, ...data };
    this.clientes.push(nuevo);
    return nuevo;
  }

  // ---------- Proveedores ----------

  async buscarProveedoresPaginado(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ProveedorMock>> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const todos = this.proveedores.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.nif.toLowerCase().includes(q)
    );
    const inicio = (page - 1) * pageSize;
    return { items: todos.slice(inicio, inicio + pageSize), total: todos.length, page, pageSize };
  }

  crearProveedorAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock {
    const nuevo: ProveedorMock = { id: nextProveedorId++, ...data };
    this.proveedores.push(nuevo);
    return nuevo;
  }

  // ---------- Facturas emitidas ----------

  estadoAeatLabel(estado?: EstadoAeat): string {
    return estado ? ESTADO_AEAT_LABELS[estado] : '—';
  }

  getFacturasEmitidas(estado: EstadoFactura, numeradorId: number | null = null): FacturaEmitida[] {
    return this.emitidas
      .filter(f => f.estado === estado)
      .filter(f => numeradorId == null || f.numeradorId === numeradorId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  getFacturaById(id: number): FacturaEmitida | undefined {
    return this.emitidas.find(f => f.id === id);
  }

  // Genera un GUID por factura. El servidor real rechaza la petición si no viaja un
  // OperacionId — y tiene que existir ya desde el borrador, no generarse al contabilizar.
  private nuevoOperacionId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida {
    const id = nextEmitidaId++;
    const nueva: FacturaEmitida = {
      id,
      numFactura: `${this.numeradorNombre(numeradorId).split(' ')[1] ?? 'X'}-BORRADOR-${id}`,
      numeradorId,
      fecha: new Date().toISOString().slice(0, 10),
      vencimiento: '',
      concepto: '',
      medioPago: '',
      destinatario,
      lineas: [],
      estado: 'borrador',
      operacionId: this.nuevoOperacionId(),
    };
    this.emitidas.unshift(nueva);
    return nueva;
  }

  actualizarBorrador(id: number, cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f || f.estado !== 'borrador') return;
    Object.assign(f, cambios);
  }

  nuevoIdLinea(): number {
    return nextLineaId++;
  }

  contabilizar(id: number): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) return;
    f.estado = 'contabilizada';
    f.estadoAeat = 'PendienteEnvio';
  }

  firmar(id: number): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) return;
    f.estado = 'firmada';
    f.estadoAeat = 'Correcto';
  }

  private redondear(v: number): number {
    return Math.round(v * 100) / 100;
  }

  totalesFactura(f: FacturaEmitida): TotalesFactura {
    let base = 0;
    const grupos = new Map<number, number>();

    for (const l of f.lineas) {
      // Number(...) por seguridad: ion-input puede entregar el valor como texto.
      const cantidad = Number(l.cantidad) || 0;
      const precioUnitario = Number(l.precioUnitario) || 0;
      const descuentoPct = Number(l.descuentoPct) || 0;
      const importe = cantidad * precioUnitario * (1 - descuentoPct / 100);
      base += importe;
      grupos.set(l.ivaPct, (grupos.get(l.ivaPct) ?? 0) + importe);
    }
    base = this.redondear(base);

    const desgloseIva: DesgloseIva[] = Array.from(grupos.entries())
      .map(([pct, baseGravada]) => ({
        pct,
        baseGravada: this.redondear(baseGravada),
        cuota: this.redondear(baseGravada * pct / 100),
      }))
      .sort((a, b) => b.pct - a.pct);

    const ivaTotal = this.redondear(desgloseIva.reduce((s, d) => s + d.cuota, 0));
    // La retención se calcula sobre la misma base imponible que el IVA (nunca sobre el
    // total con IVA incluido) y la decide la configuración fiscal del emisor, no la factura.
    const retencion = aplicarRetencion(base, this.configuracionRetencion);
    const total = this.redondear(base + ivaTotal - retencion.importe);

    return { base, desgloseIva, ivaTotal, retencion, total };
  }

  // ---------- Facturas recibidas ----------

  getFacturasRecibidas(): FacturaRecibida[] {
    return [...this.recibidas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  getFacturaRecibidaById(id: number): FacturaRecibida | undefined {
    return this.recibidas.find(f => f.id === id);
  }

  private leerComoDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Recibe el File real (no solo el nombre) para que la integración real solo tenga que
  // cambiar el cuerpo de este método por una subida multipart a POST /api/FacturaRecibida/desde-ocr.
  //
  // Sin Math.random(): los importes simulados salen de una lista fija recorrida por el
  // contador de id, para que la demo sea reproducible (mismo id → mismo importe) en vez
  // de generar cifras distintas en cada recarga.
  async crearDesdeOcr(file: File): Promise<FacturaRecibida> {
    const [, documentoUrl] = await Promise.all([
      new Promise(resolve => setTimeout(resolve, 1200)),
      this.leerComoDataUrl(file),
    ]);

    const id = nextRecibidaId++;
    const basesEjemplo = [128.5, 276.4, 92.15, 340.0, 187.65, 214.9];
    const base = basesEjemplo[id % basesEjemplo.length];
    const ivaPct = 21;
    const iva = this.redondear(base * ivaPct / 100);

    const nueva: FacturaRecibida = {
      id,
      proveedor: `Proveedor detectado (${file.name})`,
      numFactura: `OCR-${1000 + id}`,
      fecha: new Date().toISOString().slice(0, 10),
      concepto: 'Pendiente de revisar',
      baseImponible: base,
      ivaPct,
      iva,
      irpfPct: 0,
      irpf: 0,
      totalFactura: this.redondear(base + iva),
      pagada: false,
      estado: 'borrador',
      origenOcr: true,
      documentoUrl: documentoUrl as string,
      documentoNombre: file.name,
    };

    this.recibidas.unshift(nueva);
    return nueva;
  }

  async adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }> {
    const documentoUrl = await this.leerComoDataUrl(file);
    return { documentoUrl, documentoNombre: file.name };
  }

  crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida {
    const nueva: FacturaRecibida = { id: nextRecibidaId++, origenOcr: false, ...data };
    this.recibidas.unshift(nueva);
    return nueva;
  }

  actualizarRecibida(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): void {
    const f = this.recibidas.find(r => r.id === id);
    if (!f) return;
    Object.assign(f, cambios);
  }

  eliminarRecibida(id: number): void {
    this.recibidas = this.recibidas.filter(r => r.id !== id);
  }
}
