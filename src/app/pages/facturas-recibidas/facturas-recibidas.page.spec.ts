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
      concepto, baseImponible: 100, ivaPct: 21, iva: 21, irpfPct: 0, irpf: 0, totalFactura: 121,
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
});
