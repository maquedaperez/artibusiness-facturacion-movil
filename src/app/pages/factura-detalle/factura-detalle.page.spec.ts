import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
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

  // Stripe Connect (Fase 3, 2026-09-02): mientras no exista infraestructura real
  // (StripeConnect:Enabled=false), obtenerEstadoStripeConnect() devuelve disponible=false y el
  // botón "Cobrar con tarjeta" debe permanecer OCULTO — nunca visible y fallando con un 503 al
  // pulsarlo. Cubre ambos estados: desactivado (por defecto) y activado.
  describe('cobro con Stripe Connect', () => {
    function facturaBorrador(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 3001, numFactura: 'FS-3001', numeradorId: 1, fecha: '2026-09-02', vencimiento: '2026-09-02',
        concepto: 'Venta', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [{ id: 1, origen: 'manual', descripcion: 'Producto', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }],
        estado: 'borrador', operacionId: 'op-3',
        ...overrides,
      };
    }

    describe('desactivado (estado por defecto del MVP)', () => {
      it('puedeCobrarStripe es false aunque la factura sí se pueda cobrar', () => {
        component.working = facturaBorrador();
        component.stripeConnectDisponible = false;

        expect(component.puedeCobrarStripe).toBeFalse();
      });

      it('el botón "Cobrar con tarjeta" no se renderiza en el DOM', () => {
        component.working = facturaBorrador();
        component.stripeConnectDisponible = false;
        fixture.detectChanges();

        const boton = fixture.debugElement.query(By.css('.boton-cobrar-stripe'));
        expect(boton).withContext('el botón no debe existir mientras Stripe Connect no esté disponible').toBeNull();
      });

      it('iniciarCobroStripe() no llama al repositorio si no está disponible', async () => {
        component.facturaId = 3001;
        component.working = facturaBorrador();
        component.stripeConnectDisponible = false;
        const repo = TestBed.inject(IssuedInvoicesRepository);
        const spy = spyOn(repo, 'iniciarCobroStripe');

        await component.iniciarCobroStripe();

        expect(spy).not.toHaveBeenCalled();
      });
    });

    describe('activado (módulo configurado y cuenta lista para cobrar)', () => {
      it('puedeCobrarStripe es true para un borrador cobrable', () => {
        component.working = facturaBorrador();
        component.stripeConnectDisponible = true;

        expect(component.puedeCobrarStripe).toBeTrue();
      });

      it('el botón "Cobrar con tarjeta" se renderiza en el DOM', () => {
        component.working = facturaBorrador();
        component.stripeConnectDisponible = true;
        fixture.detectChanges();

        const boton = fixture.debugElement.query(By.css('.boton-cobrar-stripe'));
        expect(boton).withContext('el botón debe existir cuando Stripe Connect sí está disponible').not.toBeNull();
      });

      it('iniciarCobroStripe() llama al repositorio y muestra el enlace de pago', async () => {
        component.facturaId = 3001;
        component.working = facturaBorrador();
        component.stripeConnectDisponible = true;
        const repo = TestBed.inject(IssuedInvoicesRepository);
        const spy = spyOn(repo, 'iniciarCobroStripe').and.resolveTo({ checkoutUrl: 'https://checkout.stripe.com/session_1' });

        await component.iniciarCobroStripe();

        expect(spy).toHaveBeenCalledWith(3001);
        expect(component.checkoutUrlStripe).toBe('https://checkout.stripe.com/session_1');
      });

      it('iniciarCobroStripe() no muestra ningún enlace si el cobro ya estaba resuelto', async () => {
        component.facturaId = 3001;
        component.working = facturaBorrador();
        component.stripeConnectDisponible = true;
        const repo = TestBed.inject(IssuedInvoicesRepository);
        spyOn(repo, 'iniciarCobroStripe').and.resolveTo({ checkoutUrl: null });

        await component.iniciarCobroStripe();

        expect(component.checkoutUrlStripe).toBeNull();
      });
    });

    // Bug real encontrado en revisión (2026-09-02): el texto de "instrucciones" pide compartir
    // el enlace con el cliente, pero antes de esto no había ningún control real para hacerlo.
    describe('compartir/abrir el enlace de pago', () => {
      beforeEach(() => {
        component.checkoutUrlStripe = 'https://checkout.stripe.com/session_1';
      });

      it('abrirPagoStripe() en nativo abre el navegador del sistema, no el WebView', () => {
        spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
        const openSpy = spyOn(window, 'open');

        component.abrirPagoStripe();

        expect(openSpy).toHaveBeenCalledWith('https://checkout.stripe.com/session_1', '_system');
      });

      it('abrirPagoStripe() en web abre una pestaña nueva', () => {
        spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
        const openSpy = spyOn(window, 'open');

        component.abrirPagoStripe();

        expect(openSpy).toHaveBeenCalledWith('https://checkout.stripe.com/session_1', '_blank', 'noopener');
      });

      // La rama nativa (Capacitor.isNativePlatform() === true) llama al plugin Share de
      // Capacitor, que no se puede interceptar de forma fiable con spyOn en este entorno de
      // test (mismo límite ya asumido en compartir-documento.spec.ts, que tampoco prueba esa
      // rama) — se cubre en su lugar la rama web (Web Share API / portapapeles), que sí usa
      // APIs del navegador mockeables directamente.
      it('compartirPagoStripe() en web con Web Share API disponible la usa', async () => {
        spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
        const nav = navigator as any;
        const canShareOriginal = nav.canShare;
        const shareOriginal = nav.share;
        nav.canShare = () => true;
        nav.share = jasmine.createSpy('share').and.resolveTo();

        await component.compartirPagoStripe();

        expect(nav.share).toHaveBeenCalledWith(jasmine.objectContaining({ url: 'https://checkout.stripe.com/session_1' }));
        nav.canShare = canShareOriginal;
        nav.share = shareOriginal;
      });

      it('compartirPagoStripe() cae a copiar en el portapapeles si no hay diálogo de compartir', async () => {
        spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
        const nav = navigator as any;
        const canShareOriginal = nav.canShare;
        nav.canShare = () => false;
        const clipboardSpy = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
        const toastCtrl = TestBed.inject(ToastController);
        const toastSpy = spyOn(toastCtrl, 'create').and.callThrough();

        await component.compartirPagoStripe();

        expect(clipboardSpy).toHaveBeenCalledWith('https://checkout.stripe.com/session_1');
        expect(toastSpy).toHaveBeenCalled();
        nav.canShare = canShareOriginal;
      });

      it('sin checkoutUrlStripe, ninguno de los dos hace nada', async () => {
        component.checkoutUrlStripe = null;
        const openSpy = spyOn(window, 'open');
        const clipboardSpy = spyOn(navigator.clipboard, 'writeText');

        component.abrirPagoStripe();
        await component.compartirPagoStripe();

        expect(openSpy).not.toHaveBeenCalled();
        expect(clipboardSpy).not.toHaveBeenCalled();
      });
    });
  });

  // Bug real encontrado en revisión (2026-09-02): esEditable nunca miraba 'cobrada' — un
  // ticket ya cobrado (mientras sigue en borrador) se podía seguir editando (líneas, importe,
  // cliente) sin ningún aviso. El backend (FacturaEmitidaService.GuardarAsync) es quien de
  // verdad lo impone con un 409; esto cubre que el frontend oculta el formulario de edición.
  describe('esEditable respeta cobrada', () => {
    function facturaBorrador(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 3001, numFactura: 'FS-3001', numeradorId: 1, fecha: '2026-09-02', vencimiento: '2026-09-02',
        concepto: 'Venta', medioPago: '', destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [{ id: 1, origen: 'manual', descripcion: 'Producto', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }],
        estado: 'borrador', operacionId: 'op-3',
        ...overrides,
      };
    }

    it('un borrador ya cobrado deja de ser editable', () => {
      component.working = facturaBorrador({ cobrada: true });
      expect(component.esEditable).toBeFalse();
    });

    it('un borrador sin cobrar sigue siendo editable con normalidad', () => {
      component.working = facturaBorrador({ cobrada: false });
      expect(component.esEditable).toBeTrue();
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
  // Correcciones de la revision de la auditoria (2026-09-02) — cada test cubre un bug real
  // confirmado contra el codigo, no un riesgo teorico.
  describe('correcciones de la revision de la auditoria (2026-09-02)', () => {
    const NUMERADOR_FS: Numerador = { id: 1, nombre: 'FS' };
    const NUMERADOR_COMPLETA: Numerador = { id: 2, nombre: 'A-2026' };

    function borradorLocal(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 1001,
        numFactura: 'FS-BORRADOR-1001',
        numeradorId: NUMERADOR_FS.id,
        fecha: '2026-09-02',
        vencimiento: '',
        concepto: 'Consumicion',
        medioPago: 'Efectivo',
        idMedioPago: 1,
        destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [],
        estado: 'borrador',
        operacionId: 'op-1',
        esSimplificada: true,
        esBorradorLocal: true,
        ...overrides,
      };
    }

    function confirmarEnElAlert() {
      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.role !== 'cancel');
        return { present: async () => { await boton.handler(); } } as any;
      });
    }

    // G01 — un borrador puramente local no tiene id real en el backend: su id sale de un
    // contador propio del mock (arranca en 100), asi que un DELETE con ese id puede acertar
    // por casualidad con una factura REAL de la misma empresa. La lista ya lo hacia bien.
    it('eliminar un borrador local lo descarta en memoria, sin DELETE HTTP', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const descartarSpy = spyOn(repo, 'descartarLocal').and.resolveTo();
      const eliminarSpy = spyOn(repo, 'eliminar').and.resolveTo();
      spyOn(component, 'volver');
      component.working = borradorLocal({ esBorradorLocal: true });
      confirmarEnElAlert();

      await component.confirmarEliminar();

      expect(descartarSpy).toHaveBeenCalledWith(1001);
      expect(eliminarSpy).not.toHaveBeenCalled();
    });

    it('eliminar una factura ya guardada de verdad si llama a eliminar() (DELETE real)', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const descartarSpy = spyOn(repo, 'descartarLocal').and.resolveTo();
      const eliminarSpy = spyOn(repo, 'eliminar').and.resolveTo();
      spyOn(component, 'volver');
      component.working = borradorLocal({ id: 55, esBorradorLocal: false });
      confirmarEnElAlert();

      await component.confirmarEliminar();

      expect(eliminarSpy).toHaveBeenCalledWith(55);
      expect(descartarSpy).not.toHaveBeenCalled();
    });

    // M03 — hasta que llega el catalogo real no se sabe cual es la serie FS; arrancar antes
    // creaba el ticket con el numerador de ejemplo del mock ('Serie A 2026').
    it('no deja arrancar un ticket mientras el catalogo de series todavia se esta cargando', () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const crearSpy = spyOn(repo, 'crearBorrador');
      component.cargandoCatalogos = true;
      component.numeradorSeleccionado = NUMERADOR_COMPLETA.id;

      component.iniciarSimplificada();

      expect(crearSpy).not.toHaveBeenCalled();
      expect(component.working).toBeNull();
    });

    it('no deja arrancar un ticket si la empresa no tiene serie FS configurada', () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const crearSpy = spyOn(repo, 'crearBorrador');
      component.cargandoCatalogos = false;
      component.serieSimplificadaNoConfigurada = true;
      component.numeradorSeleccionado = NUMERADOR_COMPLETA.id;

      component.iniciarSimplificada();

      expect(crearSpy).not.toHaveBeenCalled();
    });

    it('con la serie FS ya resuelta, arranca el ticket con ESA serie', () => {
      component.cargandoCatalogos = false;
      component.serieSimplificadaNoConfigurada = false;
      component.numeradores = [NUMERADOR_FS, NUMERADOR_COMPLETA];
      component.numeradorSeleccionado = NUMERADOR_FS.id;

      component.iniciarSimplificada();

      expect(component.working).not.toBeNull();
      expect(component.working!.numeradorId).toBe(NUMERADOR_FS.id);
      expect(component.working!.esSimplificada).toBeTrue();
    });

    // Bug encontrado en la revision y no recogido por la auditoria: el cambio se aplicaba
    // ANTES de abrir el selector, asi que cancelarlo dejaba el ticket convertido a medias
    // (factura completa, sin cliente, imposible de guardar y sin vuelta atras en la UI).
    it('cancelar el selector de cliente deja el ticket como estaba (no lo convierte a medias)', async () => {
      component.numeradores = [NUMERADOR_FS, NUMERADOR_COMPLETA];
      component.working = borradorLocal({ numeradorId: NUMERADOR_FS.id });
      confirmarEnElAlert();
      const modalCtrl = TestBed.inject(ModalController);
      spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({ data: undefined, role: 'cancel' }),
      } as any);

      await component.convertirEnFacturaCompleta();

      expect(component.working!.esSimplificada).toBeTrue();
      expect(component.working!.numeradorId).toBe(NUMERADOR_FS.id);
    });

    // M04 — Guardar y Contabilizar son visibles a la vez en un borrador; pulsar Contabilizar
    // durante un guardado en curso salia por 'if (!guardadoOk) return' sin ningun mensaje.
    it('algoEnCurso incluye guardando, para que Contabilizar no sea un no-op silencioso', () => {
      expect(component.algoEnCurso).toBeFalse();
      component.guardando = true;
      expect(component.algoEnCurso).toBeTrue();
    });

    // M05 — ni el frontend ni el backend comprobaban el signo ni el tope de estos campos.
    it('marca como invalidas las lineas con cantidad, precio o descuento fuera de rango', () => {
      const linea = (o: Partial<FacturaEmitida['lineas'][number]>) => ({
        id: 1, origen: 'manual' as const, descripcion: 'x',
        cantidad: 1, precioUnitario: 10, descuentoPct: 0, ivaPct: 21, ...o,
      });

      component.working = borradorLocal({ lineas: [linea({ cantidad: -1 })] });
      expect(component.hayLineasInvalidas).toBeTrue();

      component.working = borradorLocal({ lineas: [linea({ precioUnitario: -5 })] });
      expect(component.hayLineasInvalidas).toBeTrue();

      component.working = borradorLocal({ lineas: [linea({ descuentoPct: 120 })] });
      expect(component.hayLineasInvalidas).toBeTrue();

      component.working = borradorLocal({ lineas: [linea({})] });
      expect(component.hayLineasInvalidas).toBeFalse();
    });

    it('una linea recien anadida (todo a cero) no se considera invalida', () => {
      component.working = borradorLocal({
        lineas: [{ id: 1, origen: 'manual', descripcion: '', cantidad: 0, precioUnitario: 0, descuentoPct: 0, ivaPct: 21 }],
      });
      expect(component.hayLineasInvalidas).toBeFalse();
    });

    it('faltaConcepto refleja el concepto vacio o solo con espacios', () => {
      component.working = borradorLocal({ concepto: '' });
      expect(component.faltaConcepto).toBeTrue();
      component.working = borradorLocal({ concepto: '   ' });
      expect(component.faltaConcepto).toBeTrue();
      component.working = borradorLocal({ concepto: 'Consumicion' });
      expect(component.faltaConcepto).toBeFalse();
    });
  });
  // G04 de la auditoria (2026-09-02): editar concepto o lineas y salir descartaba el trabajo en
  // silencio. La proteccion vive en un guard de ruta que pregunta a puedeSalir().
  describe('cambios sin guardar (G04)', () => {
    function facturaBorrador(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 42,
        numFactura: 'A-2026-42',
        numeradorId: 2,
        fecha: '2026-09-02',
        vencimiento: '',
        concepto: 'Servicios',
        medioPago: 'Transferencia',
        idMedioPago: 3,
        destinatario: { nombre: 'Cliente SL', nif: 'B12345678', esEmpresa: true },
        lineas: [],
        estado: 'borrador',
        operacionId: 'op-42',
        ...overrides,
      };
    }

    // Coloca el componente en el estado "recien cargada del backend", que es cuando el
    // snapshot de referencia queda fijado.
    async function cargarFactura(f: FacturaEmitida) {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'obtenerPorId').and.resolveTo(f);
      TestBed.inject(ActivatedRoute).snapshot.params = { id: String(f.id) };
      await component['cargarFactura'](f.id);
    }

    it('una factura recien cargada no tiene cambios pendientes', async () => {
      await cargarFactura(facturaBorrador());
      expect(component.hayCambiosSinGuardar).toBeFalse();
    });

    it('editar el concepto marca cambios pendientes', async () => {
      await cargarFactura(facturaBorrador());
      component.working!.concepto = 'Otro concepto';
      expect(component.hayCambiosSinGuardar).toBeTrue();
    });

    it('anadir una linea marca cambios pendientes', async () => {
      await cargarFactura(facturaBorrador());
      component.working!.lineas.push({
        id: 1, origen: 'manual', descripcion: 'Mano de obra',
        cantidad: 1, precioUnitario: 50, descuentoPct: 0, ivaPct: 21,
      });
      expect(component.hayCambiosSinGuardar).toBeTrue();
    });

    // Los campos que rellena el backend por su cuenta cambian sin que el usuario haya tocado
    // nada: si entraran en la comparacion, saldria el aviso al salir de una factura que solo
    // se ha mirado.
    it('un cambio del backend en campos no editables NO cuenta como cambio pendiente', async () => {
      await cargarFactura(facturaBorrador());
      component.working!.estadoAeat = 'Correcto';
      component.working!.urlQr = 'https://ejemplo/qr';
      expect(component.hayCambiosSinGuardar).toBeFalse();
    });

    // Una factura ya contabilizada se muestra en modo lectura: nada de lo que se ve ahi puede
    // haberse tocado, asi que nunca debe preguntar al salir.
    it('una factura no editable nunca tiene cambios pendientes', async () => {
      await cargarFactura(facturaBorrador({ estado: 'contabilizada' }));
      component.working!.concepto = 'Manipulado a mano en el test';
      expect(component.hayCambiosSinGuardar).toBeFalse();
    });

    it('guardar deja la pantalla sin cambios pendientes', async () => {
      await cargarFactura(facturaBorrador());
      component.working!.concepto = 'Otro concepto';
      expect(component.hayCambiosSinGuardar).toBeTrue();

      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'guardar').and.callFake(async () => ({ ...component.working! }));

      await component.guardar(false);

      expect(component.hayCambiosSinGuardar).toBeFalse();
    });

    describe('puedeSalir()', () => {
      it('deja salir sin preguntar si no hay nada que perder', async () => {
        await cargarFactura(facturaBorrador());
        const alertCtrl = TestBed.inject(AlertController);
        const alertSpy = spyOn(alertCtrl, 'create');

        await expectAsync(component.puedeSalir()).toBeResolvedTo(true);
        expect(alertSpy).not.toHaveBeenCalled();
      });

      it('con cambios pendientes pregunta, y "Seguir editando" cancela la salida', async () => {
        await cargarFactura(facturaBorrador());
        component.working!.concepto = 'Otro concepto';
        const alertCtrl = TestBed.inject(AlertController);
        spyOn(alertCtrl, 'create').and.resolveTo({
          present: async () => {},
          onDidDismiss: async () => ({ role: 'cancel' }),
        } as any);

        await expectAsync(component.puedeSalir()).toBeResolvedTo(false);
      });

      it('con cambios pendientes, "Salir sin guardar" deja salir', async () => {
        await cargarFactura(facturaBorrador());
        component.working!.concepto = 'Otro concepto';
        const alertCtrl = TestBed.inject(AlertController);
        spyOn(alertCtrl, 'create').and.resolveTo({
          present: async () => {},
          onDidDismiss: async () => ({ role: 'salir' }),
        } as any);

        await expectAsync(component.puedeSalir()).toBeResolvedTo(true);
      });

      // Cerrar tocando fuera del dialogo o con Escape llega tambien como rol 'backdrop':
      // ante la duda, quedarse es lo seguro — nunca perder el trabajo por un toque accidental.
      it('cerrar el dialogo sin elegir no se interpreta como salir', async () => {
        await cargarFactura(facturaBorrador());
        component.working!.concepto = 'Otro concepto';
        const alertCtrl = TestBed.inject(AlertController);
        spyOn(alertCtrl, 'create').and.resolveTo({
          present: async () => {},
          onDidDismiss: async () => ({ role: 'backdrop' }),
        } as any);

        await expectAsync(component.puedeSalir()).toBeResolvedTo(false);
      });
    });
  });
  // Bugs encontrados probando la demo con datos reales (2026-09-02).
  describe('bugs encontrados probando la demo (2026-09-02)', () => {
    function ticketGuardado(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
      return {
        id: 3,
        numFactura: 'FS7',
        numeradorId: 1,
        fecha: '2026-09-02',
        vencimiento: '2026-09-02',
        concepto: 'prueba 32413',
        medioPago: 'Contado — Caja',
        idMedioPago: 1,
        destinatario: { nombre: 'Consumidor final', nif: '', esEmpresa: false },
        lineas: [{ id: 1, origen: 'manual', descripcion: 'prueba 1231', cantidad: 1, precioUnitario: 5, descuentoPct: 0, ivaPct: 21 }],
        estado: 'borrador',
        operacionId: 'op-3',
        esSimplificada: true,
        esBorradorLocal: false,
        ...overrides,
      };
    }

    function confirmarEnElAlert() {
      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.role !== 'cancel');
        return { present: async () => { await boton.handler(); } } as any;
      });
    }

    async function cargar(f: FacturaEmitida) {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'obtenerPorId').and.resolveTo(f);
      await component['cargarFactura'](f.id);
    }

    // El backend rechaza CUALQUIER edicion de una factura ya cobrada con un 409, asi que el
    // guardado previo incondicional hacia imposible contabilizar un ticket cobrado — justo el
    // flujo que la propia pantalla invita a seguir con "Pagado — pendiente de contabilizar".
    it('contabilizar un ticket ya cobrado NO intenta guardarlo antes', async () => {
      await cargar(ticketGuardado({ cobrada: true }));
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const guardarSpy = spyOn(repo, 'guardar').and.rejectWith(new Error('HTTP 409 - no se puede editar'));
      const contabilizarSpy = spyOn(repo, 'contabilizar').and.resolveTo(ticketGuardado({ cobrada: true, estado: 'contabilizada' }));
      spyOn(component, 'volver');
      confirmarEnElAlert();

      await component.confirmarContabilizar();

      expect(guardarSpy).not.toHaveBeenCalled();
      expect(contabilizarSpy).toHaveBeenCalledWith(3);
    });

    it('contabilizar con cambios sin guardar SI guarda antes', async () => {
      await cargar(ticketGuardado());
      component.working!.concepto = 'editado a mano';
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const guardarSpy = spyOn(repo, 'guardar').and.callFake(async () => ({ ...component.working! }));
      const contabilizarSpy = spyOn(repo, 'contabilizar').and.resolveTo(ticketGuardado({ estado: 'contabilizada' }));
      spyOn(component, 'volver');
      confirmarEnElAlert();

      await component.confirmarContabilizar();

      expect(guardarSpy).toHaveBeenCalled();
      expect(contabilizarSpy).toHaveBeenCalled();
    });

    it('un borrador local siempre se guarda antes de contabilizar', async () => {
      component.working = ticketGuardado({ esBorradorLocal: true });
      component.facturaId = component.working.id;
      component['marcarSinCambiosPendientes']();
      const repo = TestBed.inject(IssuedInvoicesRepository);
      const guardarSpy = spyOn(repo, 'guardar').and.callFake(async () => ({ ...component.working!, esBorradorLocal: false }));
      spyOn(repo, 'contabilizar').and.resolveTo(ticketGuardado({ estado: 'contabilizada' }));
      spyOn(component, 'volver');
      confirmarEnElAlert();

      await component.confirmarContabilizar();

      expect(guardarSpy).toHaveBeenCalled();
    });

    // Firmar el documento de una factura ya dada de baja no tiene sentido fiscal, y el backend
    // tampoco lo impide hoy: la unica barrera es esta.
    it('no deja firmar una factura contabilizada que ya esta anulada', async () => {
      await cargar(ticketGuardado({ estado: 'contabilizada', esSimplificada: false, anulada: true }));
      expect(component.puedeFirmar).toBeFalse();
    });

    it('si deja firmar una contabilizada no anulada', async () => {
      await cargar(ticketGuardado({ estado: 'contabilizada', esSimplificada: false, anulada: false }));
      expect(component.puedeFirmar).toBeTrue();
    });

    it('una simplificada nunca se firma, aunque no este anulada', async () => {
      await cargar(ticketGuardado({ estado: 'contabilizada', esSimplificada: true }));
      expect(component.puedeFirmar).toBeFalse();
    });

    // En un ticket el medio real se registra en el cobro; pedir ademas la forma de pago de
    // cabecera preguntaba dos veces por lo mismo y bloqueaba el guardado si no se elegia.
    describe('forma de pago de un ticket', () => {
      it('se autoselecciona, prefiriendo una entrada de pago al contado', () => {
        component.mediosPago = [
          { id: 9, label: 'Transferencia' },
          { id: 4, label: 'Contado — Caja' },
        ];
        component.working = ticketGuardado({ idMedioPago: undefined, medioPago: '' });
        component['autoseleccionarFormaDePagoDeUnTicket']();

        expect(component.working.idMedioPago).toBe(4);
        expect(component.working.medioPago).toBe('Contado — Caja');
      });

      it('si no hay ninguna de contado, usa la primera del catalogo real', () => {
        component.mediosPago = [{ id: 9, label: 'Transferencia' }, { id: 11, label: 'Cheque' }];
        component.working = ticketGuardado({ idMedioPago: undefined, medioPago: '' });
        component['autoseleccionarFormaDePagoDeUnTicket']();

        expect(component.working.idMedioPago).toBe(9);
      });

      it('nunca pisa una forma de pago ya elegida', () => {
        component.mediosPago = [{ id: 4, label: 'Contado — Caja' }];
        component.working = ticketGuardado({ idMedioPago: 7, medioPago: 'Bizum' });
        component['autoseleccionarFormaDePagoDeUnTicket']();

        expect(component.working.idMedioPago).toBe(7);
      });

      it('no toca una factura completa: ahi la forma de pago la elige el usuario', () => {
        component.mediosPago = [{ id: 4, label: 'Contado — Caja' }];
        component.working = ticketGuardado({ esSimplificada: false, idMedioPago: undefined, medioPago: '' });
        component['autoseleccionarFormaDePagoDeUnTicket']();

        expect(component.working.idMedioPago).toBeUndefined();
      });

      it('no inventa nada si el catalogo todavia no ha llegado', () => {
        component.mediosPago = [];
        component.working = ticketGuardado({ idMedioPago: undefined, medioPago: '' });
        component['autoseleccionarFormaDePagoDeUnTicket']();

        expect(component.working.idMedioPago).toBeUndefined();
      });

      // La eleccion la hace el sistema, no el usuario: no debe disparar el aviso de salida
      // en un ticket que solo se ha abierto y no se ha tocado.
      it('la autoseleccion no cuenta como cambio sin guardar', () => {
        component.mediosPago = [{ id: 4, label: 'Contado — Caja' }];
        component.working = ticketGuardado({ idMedioPago: undefined, medioPago: '' });
        component['marcarSinCambiosPendientes']();

        component['autoseleccionarFormaDePagoDeUnTicket']();

        expect(component.hayCambiosSinGuardar).toBeFalse();
      });
    });
  });
});
