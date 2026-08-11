import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FacturasEmitidasPage } from './facturas-emitidas.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { FacturaEmitida } from '../../services/mock-facturas.service';

describe('FacturasEmitidasPage', () => {
  let component: FacturasEmitidasPage;
  let fixture: ComponentFixture<FacturasEmitidasPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(FacturasEmitidasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function facturaDe(destinatarioNombre: string, concepto: string): FacturaEmitida {
    return {
      id: 1, numFactura: 'A-2026-999', numeradorId: 1, fecha: '2026-08-11', vencimiento: '',
      concepto, medioPago: 'Transferencia',
      destinatario: { nombre: destinatarioNombre, nif: 'B00000000', esEmpresa: true },
      lineas: [], estado: 'borrador', operacionId: 'x',
    };
  }

  it('el resumen usa el nombre del cliente, nunca la serie/número, como cabecera', () => {
    const f = facturaDe('Clínica Dental Sonrisas SL', 'Revisión anual');
    expect(component.clienteNombre(f)).toBe('Clínica Dental Sonrisas SL');
    expect(component.clienteNombre(f)).not.toContain(f.numFactura);
  });

  it('el resumen muestra el concepto y usa fallbacks accesibles si faltan datos', () => {
    const f = facturaDe('Clínica Dental Sonrisas SL', 'Revisión anual');
    expect(component.conceptoResumen(f)).toBe('Revisión anual');

    const sinDatos = facturaDe('', '');
    expect(component.clienteNombre(sinDatos)).toBe('Cliente no disponible');
    expect(component.conceptoResumen(sinDatos)).toBe('Sin concepto');
  });
});
