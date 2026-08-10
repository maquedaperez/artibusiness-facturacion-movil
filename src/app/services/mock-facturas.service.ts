import { Injectable } from '@angular/core';

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
  destinatario: Destinatario;
  lineas: LineaFactura[];
  irpfBase: number;
  estado: EstadoFactura;
  estadoAeat?: EstadoAeat;
};

export type DesgloseIva = { pct: number; baseGravada: number; cuota: number };

export type TotalesFactura = {
  base: number;
  desgloseIva: DesgloseIva[];
  ivaTotal: number;
  total: number;
};

export type FacturaRecibida = {
  id: number;
  proveedor: string;
  numFactura: string;
  fecha: string;
  totalFactura: number;
  estado: 'borrador' | 'contabilizada';
  origenOcr: boolean;
};

const ESTADO_AEAT_LABELS: Record<EstadoAeat, string> = {
  PendienteEnvio: 'Pendiente de envío',
  Correcto: 'Correcto',
  AceptadoConErrores: 'Aceptado con errores',
  RechazadoAeat: 'Rechazado por AEAT',
  RequiereRevisionManual: 'Requiere revisión manual',
};

export const IVA_RATES = [0, 4, 10, 21];

let nextEmitidaId = 100;
let nextLineaId = 1000;
let nextClienteId = 100;
let nextRecibidaId = 100;

@Injectable({ providedIn: 'root' })
export class MockFacturasService {
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

  private emitidas: FacturaEmitida[] = [
    {
      id: 1, numFactura: 'A-2026-014', numeradorId: 1, fecha: '2026-08-05',
      destinatario: this.clientes[0],
      lineas: [
        { id: 1, descripcion: 'Revisión anual instalación', cantidad: 1, precioUnitario: 1200, descuentoPct: 0, ivaPct: 21 },
      ],
      irpfBase: 0, estado: 'borrador',
    },
    {
      id: 2, numFactura: 'A-2026-015', numeradorId: 1, fecha: '2026-08-07',
      destinatario: this.clientes[1],
      lineas: [
        { id: 2, descripcion: 'Servicio de transporte mensual', cantidad: 1, precioUnitario: 850, descuentoPct: 0, ivaPct: 21 },
      ],
      irpfBase: 0, estado: 'borrador',
    },
    {
      id: 3, numFactura: 'A-2026-011', numeradorId: 1, fecha: '2026-07-28',
      destinatario: this.clientes[3],
      lineas: [
        { id: 3, descripcion: 'Asesoría fiscal julio', cantidad: 1, precioUnitario: 600, descuentoPct: 0, ivaPct: 21 },
      ],
      irpfBase: 90, estado: 'contabilizada', estadoAeat: 'PendienteEnvio',
    },
    {
      id: 4, numFactura: 'B-2026-003', numeradorId: 2, fecha: '2026-07-30',
      destinatario: this.clientes[1],
      lineas: [
        { id: 4, descripcion: 'Reparación flota', cantidad: 1, precioUnitario: 2100, descuentoPct: 0, ivaPct: 21 },
        { id: 5, descripcion: 'Tasas de gestoría', cantidad: 1, precioUnitario: 35, descuentoPct: 0, ivaPct: 0 },
      ],
      irpfBase: 0, estado: 'contabilizada', estadoAeat: 'RequiereRevisionManual',
    },
    {
      id: 5, numFactura: 'A-2026-009', numeradorId: 1, fecha: '2026-07-15',
      destinatario: this.clientes[0],
      lineas: [
        { id: 6, descripcion: 'Material fungible', cantidad: 1, precioUnitario: 340, descuentoPct: 0, ivaPct: 21 },
      ],
      irpfBase: 0, estado: 'firmada', estadoAeat: 'Correcto',
    },
    {
      id: 6, numFactura: 'A-2026-008', numeradorId: 2, fecha: '2026-07-10',
      destinatario: this.clientes[3],
      lineas: [
        { id: 7, descripcion: 'Consultoría de proceso A', cantidad: 2, precioUnitario: 50, descuentoPct: 0, ivaPct: 21 },
        { id: 8, descripcion: 'Mantenimiento B', cantidad: 3, precioUnitario: 20, descuentoPct: 8.33, ivaPct: 10 },
      ],
      irpfBase: 147, estado: 'firmada', estadoAeat: 'AceptadoConErrores',
    },
  ];

  private recibidas: FacturaRecibida[] = [
    {
      id: 1, proveedor: 'Suministros Oficina Norte SL', numFactura: 'F-4521', fecha: '2026-08-04',
      totalFactura: 187.32, estado: 'contabilizada', origenOcr: false,
    },
    {
      id: 2, proveedor: 'Electricidad Vidal e Hijos', numFactura: 'FV-2026-0912', fecha: '2026-08-06',
      totalFactura: 542.10, estado: 'borrador', origenOcr: true,
    },
  ];

  // ---------- Numeradores ----------

  getNumeradores(): Numerador[] {
    return [...this.numeradores];
  }

  numeradorNombre(id: number): string {
    return this.numeradores.find(n => n.id === id)?.nombre ?? '—';
  }

  // ---------- Clientes ----------

  buscarClientes(query: string): ClienteMock[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...this.clientes];
    return this.clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q)
    );
  }

  crearClienteAdHoc(data: Destinatario): ClienteMock {
    const nuevo: ClienteMock = { id: nextClienteId++, ...data };
    this.clientes.push(nuevo);
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

  crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida {
    const nueva: FacturaEmitida = {
      id: nextEmitidaId++,
      numFactura: `${this.numeradorNombre(numeradorId).split(' ')[1] ?? 'X'}-BORRADOR-${nextEmitidaId}`,
      numeradorId,
      fecha: new Date().toISOString().slice(0, 10),
      destinatario,
      lineas: [],
      irpfBase: 0,
      estado: 'borrador',
    };
    this.emitidas.unshift(nueva);
    return nueva;
  }

  actualizarBorrador(id: number, cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'destinatario' | 'lineas' | 'irpfBase' | 'numeradorId'>>): void {
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

  totalesFactura(f: FacturaEmitida): TotalesFactura {
    let base = 0;
    const grupos = new Map<number, number>();

    for (const l of f.lineas) {
      const importe = l.cantidad * l.precioUnitario * (1 - l.descuentoPct / 100);
      base += importe;
      grupos.set(l.ivaPct, (grupos.get(l.ivaPct) ?? 0) + importe);
    }

    const desgloseIva: DesgloseIva[] = Array.from(grupos.entries())
      .map(([pct, baseGravada]) => ({ pct, baseGravada, cuota: baseGravada * pct / 100 }))
      .sort((a, b) => b.pct - a.pct);

    const ivaTotal = desgloseIva.reduce((s, d) => s + d.cuota, 0);
    const total = base + ivaTotal - (f.irpfBase || 0);

    return { base, desgloseIva, ivaTotal, total };
  }

  // ---------- Facturas recibidas ----------

  getFacturasRecibidas(): FacturaRecibida[] {
    return [...this.recibidas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async crearDesdeOcr(fileName: string): Promise<FacturaRecibida> {
    await new Promise(resolve => setTimeout(resolve, 1200));

    const nueva: FacturaRecibida = {
      id: nextRecibidaId++,
      proveedor: `Proveedor detectado (${fileName})`,
      numFactura: `OCR-${Math.floor(Math.random() * 9000 + 1000)}`,
      fecha: new Date().toISOString().slice(0, 10),
      totalFactura: Math.round((Math.random() * 500 + 50) * 100) / 100,
      estado: 'borrador',
      origenOcr: true,
    };

    this.recibidas.unshift(nueva);
    return nueva;
  }
}
