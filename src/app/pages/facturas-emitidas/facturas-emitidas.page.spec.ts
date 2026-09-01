import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AlertController } from '@ionic/angular/standalone';
import { FacturasEmitidasPage } from './facturas-emitidas.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { IssuedInvoicesRepository } from '../../core/ports';
import { FacturaEmitida } from '../../services/mock-facturas.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

const TRADUCCIONES_TEST = {
  es: {
    invoices: {
      issued: {
        card: { noNameFallback: 'Cliente no disponible', noConceptFallback: 'Sin concepto' },
      },
    },
  },
};

describe('FacturasEmitidasPage', () => {
  let component: FacturasEmitidasPage;
  let fixture: ComponentFixture<FacturasEmitidasPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS, ...provideTranslocoTesting(TRADUCCIONES_TEST)],
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

  function facturaConFecha(fecha: string): FacturaEmitida {
    return { ...facturaDe('Cliente', 'x'), fecha };
  }

  it('el filtro de fechas incluye solo las facturas dentro del rango desde/hasta', () => {
    component.facturas = [facturaConFecha('2026-01-10'), facturaConFecha('2026-03-15'), facturaConFecha('2026-06-01')];

    component.fechaDesde = '2026-02-01';
    component.fechaHasta = '2026-05-01';

    expect(component.facturasFiltradas.length).toBe(1);
    expect(component.facturasFiltradas[0].fecha).toBe('2026-03-15');
  });

  it('sin fechas, el filtro no excluye nada por fecha', () => {
    component.facturas = [facturaConFecha('2026-01-10'), facturaConFecha('2026-06-01')];
    expect(component.facturasFiltradas.length).toBe(2);
    expect(component.hayFiltrosActivos()).toBeFalse();
  });

  it('hayFiltrosActivos detecta serie o fechas activas', () => {
    expect(component.hayFiltrosActivos()).toBeFalse();
    component.fechaDesde = '2026-01-01';
    expect(component.hayFiltrosActivos()).toBeTrue();
  });

  // Facturas simplificadas emitidas (2026-09-02): un borrador puramente local (esBorradorLocal)
  // todavia no ha consumido ningun numero fiscal — se descarta sin llamar al backend, en vez de
  // depender de que eliminar() reciba un 404 del servidor para caer al mismo sitio.
  describe('confirmarEliminar()', () => {
    function mockearConfirmacionDestructiva() {
      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.role === 'destructive');
        return { present: async () => { await boton.handler(); } } as any;
      });
    }

    it('para un borrador puramente local, descarta sin llamar a invoicesRepo.eliminar() ni al backend', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const eliminarSpy = spyOn(repo, 'eliminar').and.resolveTo();
      const descartarLocalSpy = spyOn(repo, 'descartarLocal').and.resolveTo();
      mockearConfirmacionDestructiva();

      const borradorLocal = { ...facturaDe('Consumidor final', 'Prueba ticket'), id: 555, esBorradorLocal: true };
      await component.confirmarEliminar(new Event('click'), borradorLocal);

      expect(descartarLocalSpy).toHaveBeenCalledWith(555);
      expect(eliminarSpy).not.toHaveBeenCalled();
    });

    it('para una factura ya guardada de verdad, sigue llamando a invoicesRepo.eliminar() (sin cambios)', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const eliminarSpy = spyOn(repo, 'eliminar').and.resolveTo();
      const descartarLocalSpy = spyOn(repo, 'descartarLocal').and.resolveTo();
      mockearConfirmacionDestructiva();

      const facturaReal = { ...facturaDe('Cliente Real SL', 'Servicio'), id: 556, esBorradorLocal: false };
      await component.confirmarEliminar(new Event('click'), facturaReal);

      expect(eliminarSpy).toHaveBeenCalledWith(556);
      expect(descartarLocalSpy).not.toHaveBeenCalled();
    });
  });
});
