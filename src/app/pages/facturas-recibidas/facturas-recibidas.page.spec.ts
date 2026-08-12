import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FacturasRecibidasPage } from './facturas-recibidas.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { FacturaRecibida } from '../../services/mock-facturas.service';

describe('FacturasRecibidasPage', () => {
  let component: FacturasRecibidasPage;
  let fixture: ComponentFixture<FacturasRecibidasPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(FacturasRecibidasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function facturaDe(proveedor: string, concepto: string): FacturaRecibida {
    return {
      id: 1, proveedor, proveedorNif: 'B00000000', numFactura: 'F-999', fecha: '2026-08-11',
      concepto,
      lineas: [{ id: 1, origen: 'manual', descripcion: concepto, cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }],
      retencionPct: 0,
      pagada: false, estado: 'borrador', origenOcr: false,
    };
  }

  it('el resumen usa el nombre del proveedor, nunca la serie/número, como cabecera', () => {
    const f = facturaDe('Suministros Oficina Norte SL', 'Material de oficina');
    expect(component.proveedorResumen(f)).toBe('Suministros Oficina Norte SL');
    expect(component.proveedorResumen(f)).not.toContain(f.numFactura);
  });

  it('el resumen muestra el concepto y usa fallbacks accesibles si faltan datos', () => {
    const f = facturaDe('Suministros Oficina Norte SL', 'Material de oficina');
    expect(component.conceptoResumen(f)).toBe('Material de oficina');

    const sinDatos = facturaDe('', '');
    expect(component.proveedorResumen(sinDatos)).toBe('Proveedor no disponible');
    expect(component.conceptoResumen(sinDatos)).toBe('Sin concepto');
  });

  it('el filtro de proveedor/concepto no distingue mayúsculas y busca en ambos campos', () => {
    component.facturas = [facturaDe('Suministros Oficina Norte SL', 'Material'), facturaDe('Otro Proveedor', 'papel y tóner')];

    component.searchQuery = 'oficina';
    expect(component.facturasFiltradas.length).toBe(1);

    component.searchQuery = 'TÓNER';
    expect(component.facturasFiltradas.length).toBe(1);
    expect(component.facturasFiltradas[0].proveedor).toBe('Otro Proveedor');
  });

  it('el filtro de estado y de pago se combinan (AND, no OR)', () => {
    const revisadaYPagada = { ...facturaDe('A', 'x'), estado: 'revisada' as const, pagada: true };
    const revisadaSinPagar = { ...facturaDe('B', 'x'), estado: 'revisada' as const, pagada: false };
    const borradorPagada = { ...facturaDe('C', 'x'), estado: 'borrador' as const, pagada: true };
    component.facturas = [revisadaYPagada, revisadaSinPagar, borradorPagada];

    component.estadoFiltro = 'revisada';
    component.pagadaFiltro = 'si';

    expect(component.facturasFiltradas.length).toBe(1);
    expect(component.facturasFiltradas[0].proveedor).toBe('A');
  });

  it('el filtro de fechas incluye solo las facturas dentro del rango desde/hasta', () => {
    component.facturas = [
      { ...facturaDe('A', 'x'), fecha: '2026-01-10' },
      { ...facturaDe('B', 'x'), fecha: '2026-03-15' },
      { ...facturaDe('C', 'x'), fecha: '2026-06-01' },
    ];

    component.fechaDesde = '2026-02-01';
    component.fechaHasta = '2026-05-01';

    expect(component.facturasFiltradas.length).toBe(1);
    expect(component.facturasFiltradas[0].proveedor).toBe('B');
  });

  it('hayFiltrosActivos detecta estado, pago o fechas activos', () => {
    expect(component.hayFiltrosActivos()).toBeFalse();
    component.pagadaFiltro = 'no';
    expect(component.hayFiltrosActivos()).toBeTrue();
  });
});
