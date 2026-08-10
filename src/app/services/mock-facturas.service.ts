import { Injectable } from '@angular/core';

export type EstadoFactura = 'borrador' | 'contabilizada' | 'firmada';
export type EstadoAeat = 'PendienteEnvio' | 'Correcto' | 'AceptadoConErrores' | 'RechazadoAeat' | 'RequiereRevisionManual';

export type Numerador = {
  id: number;
  nombre: string;
};

export type FacturaEmitida = {
  id: number;
  numFactura: string;
  cliente: string;
  fecha: string;
  totalBase: number;
  ivaBase: number;
  suplidosBase: number;
  irpfBase: number;
  totalFactura: number;
  estado: EstadoFactura;
  estadoAeat?: EstadoAeat;
  numeradorId: number;
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

let nextRecibidaId = 100;

@Injectable({ providedIn: 'root' })
export class MockFacturasService {
  private numeradores: Numerador[] = [
    { id: 1, nombre: 'Serie A 2026' },
    { id: 2, nombre: 'Serie B 2026' },
  ];

  private emitidas: FacturaEmitida[] = [
    {
      id: 1, numFactura: 'A-2026-014', cliente: 'Clínica Dental Sonrisas SL', fecha: '2026-08-05',
      totalBase: 1200, ivaBase: 252, suplidosBase: 0, irpfBase: 0, totalFactura: 1452,
      estado: 'borrador', numeradorId: 1,
    },
    {
      id: 2, numFactura: 'A-2026-015', cliente: 'Transportes Ibáñez SA', fecha: '2026-08-07',
      totalBase: 850, ivaBase: 178.5, suplidosBase: 0, irpfBase: 0, totalFactura: 1028.5,
      estado: 'borrador', numeradorId: 1,
    },
    {
      id: 3, numFactura: 'A-2026-011', cliente: 'Asesoría Martín & Ruiz', fecha: '2026-07-28',
      totalBase: 600, ivaBase: 126, suplidosBase: 0, irpfBase: 90, totalFactura: 636,
      estado: 'contabilizada', estadoAeat: 'PendienteEnvio', numeradorId: 1,
    },
    {
      id: 4, numFactura: 'B-2026-003', cliente: 'Talleres Robledo', fecha: '2026-07-30',
      totalBase: 2100, ivaBase: 441, suplidosBase: 35, irpfBase: 0, totalFactura: 2576,
      estado: 'contabilizada', estadoAeat: 'RequiereRevisionManual', numeradorId: 2,
    },
    {
      id: 5, numFactura: 'A-2026-009', cliente: 'Panadería Los Hornos SL', fecha: '2026-07-15',
      totalBase: 340, ivaBase: 71.4, suplidosBase: 0, irpfBase: 0, totalFactura: 411.4,
      estado: 'firmada', estadoAeat: 'Correcto', numeradorId: 1,
    },
    {
      id: 6, numFactura: 'A-2026-008', cliente: 'Gestoría Fernández', fecha: '2026-07-10',
      totalBase: 980, ivaBase: 205.8, suplidosBase: 0, irpfBase: 147, totalFactura: 1038.8,
      estado: 'firmada', estadoAeat: 'AceptadoConErrores', numeradorId: 2,
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

  estadoAeatLabel(estado?: EstadoAeat): string {
    return estado ? ESTADO_AEAT_LABELS[estado] : '—';
  }

  getNumeradores(): Numerador[] {
    return [...this.numeradores];
  }

  numeradorNombre(id: number): string {
    return this.numeradores.find(n => n.id === id)?.nombre ?? '—';
  }

  getFacturasEmitidas(estado: EstadoFactura, numeradorId: number | null = null): FacturaEmitida[] {
    return this.emitidas
      .filter(f => f.estado === estado)
      .filter(f => numeradorId == null || f.numeradorId === numeradorId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
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
