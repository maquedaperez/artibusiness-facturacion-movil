import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { FacturaDetallePage } from './factura-detalle.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';
import { IssuedInvoicesRepository } from '../../core/ports';
import { FacturaEmitida, Numerador } from '../../services/mock-facturas.service';

describe('FacturaDetallePage', () => {
  let component: FacturaDetallePage;
  let fixture: ComponentFixture<FacturaDetallePage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FacturaDetallePage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS, ...provideTranslocoTesting(), provideIonicAngular()],
    });
    fixture = TestBed.createComponent(FacturaDetallePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Facturas simplificadas emitidas — "Convertir en factura completa" (2026-08-31): la
  // conversión no debe dejar ni cliente genérico, ni serie FS, ni InvoiceDocumentType="FA" en
  // una factura ya marcada como completa. Configuración mínima directa sobre el componente
  // (mismo criterio que factura-recibida-detalle.page.spec.ts): no hace falta pasar por todo
  // el flujo real de carga para probar la lógica de conversión en sí.
  describe('convertirEnFacturaCompleta()', () => {
    const NUMERADOR_FS: Numerador = { id: 1, nombre: 'FS' };
    const NUMERADOR_COMPLETA: Numerador = { id: 2, nombre: 'A-2026' };

    function facturaSimplificadaLocal(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 1001,
        numFactura: 'FS-BORRADOR-1001',
        numeradorId: NUMERADOR_FS.id,
        fecha: '2026-08-31',
        vencimiento: '',
        concepto: '',
        medioPago: '',
        destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [],
        estado: 'borrador',
        operacionId: 'op-1',
        esSimplificada: true,
        esBorradorLocal: true,
        idCliente: undefined,
        ...overrides,
      };
    }

    function mockearConfirmacion() {
      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.text !== undefined && b.role !== 'cancel');
        return { present: async () => { await boton.handler(); } } as any;
      });
    }

    function mockearSeleccionDeClienteReal() {
      const modalCtrl = TestBed.inject(ModalController);
      spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({
          data: { cliente: { id: 77, nombre: 'Cliente Real SL', nif: 'B87654321', esEmpresa: true }, esNuevo: false },
          role: 'confirm',
        }),
      } as any);
    }

    beforeEach(() => {
      component.numeradores = [NUMERADOR_FS, NUMERADOR_COMPLETA];
    });

    it('bloquea la conversión si la factura ya se guardó de verdad (número real ya reservado)', async () => {
      component.working = facturaSimplificadaLocal({ esBorradorLocal: false });
      const toastCtrl = TestBed.inject(ToastController);
      const toastSpy = spyOn(toastCtrl, 'create').and.callThrough();
      const alertCtrl = TestBed.inject(AlertController);
      const alertSpy = spyOn(alertCtrl, 'create');

      await component.convertirEnFacturaCompleta();

      expect(alertSpy).not.toHaveBeenCalled(); // ni siquiera pregunta: se bloquea antes
      expect(toastSpy).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'danger' }));
      expect(component.working.esSimplificada).toBeTrue(); // no se toca nada
      expect(component.working.numeradorId).toBe(NUMERADOR_FS.id);
    });

    it('un borrador local todavía sin guardar SÍ puede convertirse: pide confirmación y un cliente real', async () => {
      component.working = facturaSimplificadaLocal();
      mockearConfirmacion();
      mockearSeleccionDeClienteReal();

      await component.convertirEnFacturaCompleta();

      // InvoiceDocumentType = FA -> FC (esSimplificada es el reflejo local de ese campo).
      expect(component.working.esSimplificada).toBeFalse();
    });

    it('la conversión reasigna el numerador: nunca deja la serie FS en una factura completa', async () => {
      component.working = facturaSimplificadaLocal({ numeradorId: NUMERADOR_FS.id });
      mockearConfirmacion();
      mockearSeleccionDeClienteReal();

      await component.convertirEnFacturaCompleta();

      expect(component.working.numeradorId).not.toBe(NUMERADOR_FS.id);
      expect(component.working.numeradorId).toBe(NUMERADOR_COMPLETA.id);
    });

    it('la conversión exige un cliente real: nunca deja el cliente genérico en una factura completa', async () => {
      component.working = facturaSimplificadaLocal();
      mockearConfirmacion();
      mockearSeleccionDeClienteReal();

      await component.convertirEnFacturaCompleta();

      // Ni el nombre ni el NIF del cliente genérico "Consumidor final" quedan en la factura —
      // los datos fiscales son ahora los del cliente real elegido, de forma consistente entre sí.
      expect(component.working.destinatario.nombre).toBe('Cliente Real SL');
      expect(component.working.destinatario.nif).toBe('B87654321');
      expect(component.working.idCliente).toBe(77);
    });

    it('si el numerador ya no era FS (poco probable, pero no debe tocarlo), lo deja tal cual', async () => {
      component.working = facturaSimplificadaLocal({ numeradorId: NUMERADOR_COMPLETA.id });
      mockearConfirmacion();
      mockearSeleccionDeClienteReal();

      await component.convertirEnFacturaCompleta();

      expect(component.working.numeradorId).toBe(NUMERADOR_COMPLETA.id);
    });
  });

  // Pipeline F2 (2026-08-31): Firmar/Subsanar no tienen sentido para una simplificada (no
  // genera XML Facturae) — puedeSubsanar debe excluirla explícitamente. Anular se mantiene.
  describe('disponibilidad de acciones para una factura simplificada ya contabilizada', () => {
    function facturaSimplificadaContabilizada(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 2001, numFactura: 'FS-2026-0001', numeradorId: 1, fecha: '2026-08-31', vencimiento: '',
        concepto: 'Venta', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [], estado: 'contabilizada', operacionId: 'op-2', esSimplificada: true, anulada: false,
        ...overrides,
      };
    }

    it('puedeSubsanar es false para una simplificada, aunque puedeAnular sea true', () => {
      component.working = facturaSimplificadaContabilizada();

      expect(component.puedeAnular).toBeTrue();
      expect(component.puedeSubsanar).toBeFalse();
    });

    it('puedeSubsanar sigue siendo true para una factura completa en las mismas condiciones', () => {
      component.working = facturaSimplificadaContabilizada({ esSimplificada: false });

      expect(component.puedeSubsanar).toBeTrue();
    });
  });

  // Bug real corregido (2026-08-31): si la serie FS no existe todavía para la empresa, el
  // numerador NO debe caer en silencio a cualquier otro (p. ej. uno de facturas completas).
  describe('preselección de numerador en modo simplificado', () => {
    it('numeradoresParaElPasoInicial solo ofrece la serie FS cuando esSimplificada es true', () => {
      component.esSimplificada = true;
      component.numeradores = [{ id: 1, nombre: 'FS' }, { id: 2, nombre: 'FAR/17-' }];

      expect(component.numeradoresParaElPasoInicial).toEqual([{ id: 1, nombre: 'FS' }]);
    });

    it('numeradoresParaElPasoInicial ofrece el catálogo completo para una factura completa', () => {
      component.esSimplificada = false;
      const catalogo = [{ id: 1, nombre: 'FS' }, { id: 2, nombre: 'FAR/17-' }];
      component.numeradores = catalogo;

      expect(component.numeradoresParaElPasoInicial).toEqual(catalogo);
    });

    it('numeradoresParaLaFactura(true) nunca incluye un numerador que no sea de la serie FS', () => {
      component.numeradores = [{ id: 1, nombre: 'FS' }, { id: 2, nombre: 'FAR/17-' }];

      const resultado = component.numeradoresParaLaFactura(true);

      expect(resultado).toEqual([{ id: 1, nombre: 'FS' }]);
      expect(resultado.some(n => n.nombre === 'FAR/17-')).toBeFalse();
    });
  });
});
