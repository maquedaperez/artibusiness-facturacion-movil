import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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

  // Renombrado visual a "Ticket" (2026-09-01): el título de la cabecera nunca debe mostrar el
  // identificador interno de un borrador local sin guardar (ej. "A-BORRADOR-100") para un
  // ticket — debe leer "Nuevo ticket" hasta que exista un número real (guardado o contabilizado).
  describe('tituloCabecera', () => {
    function ticketLocal(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 1001, numFactura: 'FS-BORRADOR-1001', numeradorId: 1, fecha: '2026-09-01', vencimiento: '',
        concepto: '', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [], estado: 'borrador', operacionId: 'op-1', esSimplificada: true, esBorradorLocal: true,
        ...overrides,
      };
    }

    it('antes de elegir numerador, en modo ticket, muestra "Nuevo ticket"', () => {
      component.esSimplificada = true;
      component.working = null;

      expect(component.tituloCabecera).toBe('invoices.issued.detail.newTicketTitle');
    });

    it('sigue mostrando "Nuevo ticket" tras iniciar un borrador local todavía sin guardar', () => {
      component.working = ticketLocal();

      expect(component.tituloCabecera).toBe('invoices.issued.detail.newTicketTitle');
    });

    it('muestra el número real una vez el ticket ya se guardó de verdad', () => {
      component.working = ticketLocal({ numFactura: 'FS-000123', esBorradorLocal: false });

      expect(component.tituloCabecera).toBe('FS-000123');
    });

    it('una factura completa nueva usa el título genérico, no el de ticket', () => {
      component.esSimplificada = false;
      component.working = null;

      expect(component.tituloCabecera).toBe('invoices.issued.detail.newInvoice');
    });
  });

  // Decisión de negocio (2026-09-02): Guardar ya quema un número real de la serie FS
  // (ARTIBusinessCoreDLL Numerador.Incrementar, dentro de Create()) — así que "Convertir en
  // factura completa" debe DESAPARECER de la pantalla en cuanto el ticket deja de ser un
  // borrador local, no solo fallar al pulsarlo (esa comprobación sigue existiendo en el .ts).
  describe('botón "Convertir en factura completa" en el DOM', () => {
    function ticketRenderizado(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 1001, numFactura: 'FS-BORRADOR-1001', numeradorId: 1, fecha: '2026-09-02', vencimiento: '',
        concepto: '', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [], estado: 'borrador', operacionId: 'op-1', esSimplificada: true, esBorradorLocal: true,
        ...overrides,
      };
    }

    it('se muestra, junto con el aviso de "solo antes de guardar", para un borrador local sin guardar', () => {
      component.working = ticketRenderizado();
      fixture.detectChanges();

      const boton = fixture.debugElement.query(By.css('.convert-to-complete-btn'));
      expect(boton).withContext('el botón debe estar presente').not.toBeNull();
    });

    it('desaparece, y se muestra el mensaje de bloqueo, una vez el ticket ya se guardó de verdad', () => {
      component.working = ticketRenderizado({ esBorradorLocal: false });
      fixture.detectChanges();

      const boton = fixture.debugElement.query(By.css('.convert-to-complete-btn'));
      expect(boton).withContext('el botón NO debe estar presente').toBeNull();

      // Nota: se comprueba solo la presencia del aviso (no su texto renderizado) — Ionic
      // (ion-text, componente Stencil) no garantiza tener el contenido proyectado listo en el
      // DOM real justo tras un único detectChanges() en este entorno de pruebas; la traducción
      // en sí ya está cubierta por i18n-keys.spec.ts.
      const aviso = fixture.debugElement.query(By.css('.convert-blocked-note'));
      expect(aviso).withContext('debe mostrarse el aviso de bloqueo').not.toBeNull();
    });
  });

  // Cobro de tickets/facturas emitidas (Fase 2, 2026-09-02): cobrar NUNCA contabiliza por sí
  // solo — es un acto independiente, disponible solo mientras la factura sigue en borrador y
  // todavía no se ha cobrado.
  describe('cobro manual', () => {
    function facturaBorrador(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 3001, numFactura: 'FS-3001', numeradorId: 1, fecha: '2026-09-02', vencimiento: '2026-09-02',
        concepto: 'Venta', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [{ id: 1, origen: 'manual', descripcion: 'Producto', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }],
        estado: 'borrador', operacionId: 'op-3',
        ...overrides,
      };
    }

    it('puedeCobrar es true para un borrador todavía sin cobrar', () => {
      component.working = facturaBorrador();
      expect(component.puedeCobrar).toBeTrue();
    });

    it('puedeCobrar es false si ya tiene un cobro registrado', () => {
      component.working = facturaBorrador({ cobrada: true });
      expect(component.puedeCobrar).toBeFalse();
    });

    it('puedeCobrar es false si ya no está en borrador', () => {
      component.working = facturaBorrador({ estado: 'contabilizada' });
      expect(component.puedeCobrar).toBeFalse();
    });

    it('confirmarCobro llama a marcarComoCobrado con el importe total real y el medio elegido, y refresca working', async () => {
      component.facturaId = 3001;
      component.working = facturaBorrador();
      const importeEsperado = component.totales().total;

      const repo = TestBed.inject(IssuedInvoicesRepository);
      const spy = spyOn(repo, 'marcarComoCobrado').and.resolveTo(facturaBorrador({ cobrada: true }));

      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.role !== 'cancel');
        return { present: async () => { await boton.handler('EFECTIVO'); } } as any;
      });

      await component.confirmarCobro();

      expect(spy).toHaveBeenCalledWith(3001, 'EFECTIVO', importeEsperado);
      expect(component.working?.cobrada).toBeTrue();
    });

    it('confirmarCobro no hace nada si la factura ya no se puede cobrar', async () => {
      component.facturaId = 3001;
      component.working = facturaBorrador({ cobrada: true });
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const spy = spyOn(repo, 'marcarComoCobrado');

      await component.confirmarCobro();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // Ticket (2026-09-02, reunión con Jose): el pago es inmediato — fecha siempre hoy y no
  // editable, sin concepto de vencimiento, y sin la opción de línea "Suscripción". El backend
  // impone lo mismo de forma independiente (WebAPIARTIBusiness.Tests); esto cubre que el
  // frontend efectivamente oculta/bloquea estos campos para un ticket.
  describe('restricciones de campos para un ticket', () => {
    function ticketEditable(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 2001, numFactura: 'FS-2026-0001', numeradorId: 1, fecha: '2026-09-02', vencimiento: '2026-09-02',
        concepto: 'Venta', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [], estado: 'borrador', operacionId: 'op-2', esSimplificada: true,
        ...overrides,
      };
    }

    it('la fecha queda deshabilitada aunque la factura sea editable', () => {
      component.working = ticketEditable();
      fixture.detectChanges();

      const itemFecha = fixture.debugElement.query(By.css('.fecha-item'));
      expect(itemFecha.componentInstance.disabled).toBeTrue();
    });

    it('el vencimiento no se muestra en absoluto', () => {
      component.working = ticketEditable();
      fixture.detectChanges();

      const itemVencimiento = fixture.debugElement.query(By.css('.vencimiento-item'));
      expect(itemVencimiento).toBeNull();
    });

    it('el editor de líneas no permite añadir una suscripción', () => {
      component.working = ticketEditable();
      fixture.detectChanges();

      const editor = fixture.debugElement.query(By.css('app-lineas-editor'));
      expect(editor.componentInstance.permitirSuscripcion).toBeFalse();
    });

    it('en una factura completa, la fecha sigue editable y el vencimiento sigue visible', () => {
      component.working = ticketEditable({ esSimplificada: false });
      fixture.detectChanges();

      const itemFecha = fixture.debugElement.query(By.css('.fecha-item'));
      expect(itemFecha.componentInstance.disabled).toBeFalse();
      expect(fixture.debugElement.query(By.css('.vencimiento-item'))).not.toBeNull();

      const editor = fixture.debugElement.query(By.css('app-lineas-editor'));
      expect(editor.componentInstance.permitirSuscripcion).toBeTrue();
    });
  });

  // Bug real encontrado en revisión (2026-09-02): antes, Contabilizar/Firmar/Anular/Cobrar
  // compartían una única bandera ('procesandoAeat'). En 'contabilizada' (Firmar+Anular visibles
  // a la vez) y en 'borrador' (Cobrar+Contabilizar visibles a la vez), pulsar uno hacía que el
  // OTRO botón también mostrara su spinner y su propio texto "...ando", aunque no fuera el que
  // se estaba ejecutando de verdad. Cada acción tiene ahora su propia bandera; algoEnCurso()
  // sigue bloqueando cualquier acción mientras otra está en vuelo.
  describe('algoEnCurso — evita spinners/textos cruzados entre botones', () => {
    function facturaContabilizada(): FacturaEmitida {
      return {
        id: 4001, numFactura: 'A-2026-4001', numeradorId: 1, fecha: '2026-09-02', vencimiento: '2026-09-02',
        concepto: 'Servicio', medioPago: 'Transferencia', destinatario: { nombre: 'Cliente SL', nif: 'B1', esEmpresa: true },
        lineas: [], estado: 'contabilizada', operacionId: 'op-4', anulada: false,
      };
    }

    it('algoEnCurso es true si cualquiera de las acciones está en curso', () => {
      expect(component.algoEnCurso).toBeFalse();
      component.anulando = true;
      expect(component.algoEnCurso).toBeTrue();
    });

    it('mientras se firma, NO se activa el flag de anular (antes compartían la misma bandera)', async () => {
      component.facturaId = 4001;
      component.working = facturaContabilizada();
      const repo = TestBed.inject(IssuedInvoicesRepository);

      let resolverFirmar!: (f: FacturaEmitida) => void;
      spyOn(repo, 'firmar').and.returnValue(new Promise<FacturaEmitida>(resolve => { resolverFirmar = resolve; }));

      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.role !== 'cancel');
        return { present: async () => { boton.handler(); } } as any; // sin await: deja la firma "en vuelo"
      });

      await component.confirmarFirmar();
      // firmar() todavía no se ha resuelto en este punto — es justo la ventana donde antes el
      // botón de Anular (visible a la vez en 'contabilizada') mostraba spinner/texto de más.
      expect(component.firmando).toBeTrue();
      expect(component.anulando).toBeFalse();
      expect(component.algoEnCurso).toBeTrue();

      // Se resuelve la promesa para no dejar un handler colgado entre tests, sin más
      // aserciones tras esto: el propio 'finally' del componente ya garantiza mecánicamente
      // que firmando vuelve a false (no es lo que este test necesita demostrar) — comprobarlo
      // aquí exigiría esperar a la cadena completa showToast()/volver() (Router real, sin rutas
      // configuradas en este spec), lo que lo haría frágil sin aportar cobertura nueva.
      resolverFirmar(facturaContabilizada());
    });
  });
});
