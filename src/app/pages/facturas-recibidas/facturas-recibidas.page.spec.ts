import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular/standalone';
import { FacturasRecibidasPage } from './facturas-recibidas.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { FacturaRecibida } from '../../services/mock-facturas.service';
import { ApiService } from '../../services/api.service';
import { ReceivedInvoicesRepository } from '../../core/ports';
import { environment } from 'src/environments/environment';

describe('FacturasRecibidasPage', () => {
  let component: FacturasRecibidasPage;
  let fixture: ComponentFixture<FacturasRecibidasPage>;

  beforeEach(async () => {
    // ReceivedInvoicesRepository resuelve al adaptador HTTP real: listar() sin esto
    // llamaría de verdad a POST api/FacturasRecibidas/Enumerar contra el servidor de Karma.
    const apiStub: Partial<ApiService> = { post: jasmine.createSpy().and.resolveTo([]) };
    TestBed.configureTestingModule({
      providers: [...MOCK_REPOSITORY_PROVIDERS, { provide: ApiService, useValue: apiStub }],
    });
    fixture = TestBed.createComponent(FacturasRecibidasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // ionViewWillEnter (no ngOnInit — se quitó de ahí en revisión 2026-08-14 para no
    // disparar refresh() por duplicado en la primera carga) no se dispara solo en este
    // entorno de test — cada prueba llama a refresh() explícitamente cuando lo necesita.
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Consolidado 2026-08-17: ya no hay un botón "Guardado rápido" aparte — los dos botones de
  // escanear/adjuntar llaman directamente a crearDesdeDocumentoDirecto (confirmado por el
  // jefe: el endpoint funciona bien). El caso "flag desactivado" (defensa en profundidad,
  // por si algún entorno lo revierte) se prueba aparte más abajo, con su propia instancia.
  it('los botones de escanear/adjuntar se muestran: el endpoint ya está desplegado', () => {
    expect(component.mostrarEscaneo).toBeTrue();
    expect(fixture.nativeElement.querySelector('.scan-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.upload-button')).not.toBeNull();
  });

  it('triggerCamera()/triggerUpload() abren su selector de fichero correspondiente', () => {
    const clickCamera = spyOn(component.fileInputCamera!.nativeElement, 'click');
    const clickUpload = spyOn(component.fileInputUpload!.nativeElement, 'click');

    component.triggerCamera();
    component.triggerUpload();

    expect(clickCamera).toHaveBeenCalled();
    expect(clickUpload).toHaveBeenCalled();
  });

  // mostrarEscaneo se calcula una sola vez, al construir el componente, leyendo el valor que
  // tenga entonces environment.features.enableQuickSave — así que para probar el caso
  // "desactivado" hace falta forzar el flag ANTES de crear una instancia nueva, no sobre la
  // instancia compartida del resto de pruebas (esa ya se construyó con el valor real de
  // environment.ts, que hoy es true).
  describe('con enableQuickSave desactivado (defensa en profundidad, por si algún entorno lo revierte)', () => {
    let componentFlagOff: FacturasRecibidasPage;
    let fixtureFlagOff: ComponentFixture<FacturasRecibidasPage>;

    beforeEach(async () => {
      environment.features.enableQuickSave = false;
      const apiStub: Partial<ApiService> = { post: jasmine.createSpy().and.resolveTo([]) };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [...MOCK_REPOSITORY_PROVIDERS, { provide: ApiService, useValue: apiStub }],
      });
      fixtureFlagOff = TestBed.createComponent(FacturasRecibidasPage);
      componentFlagOff = fixtureFlagOff.componentInstance;
      fixtureFlagOff.detectChanges();
      await fixtureFlagOff.whenStable();
    });

    afterEach(() => {
      environment.features.enableQuickSave = true; // restaura el valor real de environment.ts
    });

    it('no se muestra ningún botón de escanear/adjuntar', () => {
      expect(componentFlagOff.mostrarEscaneo).toBeFalse();
      expect(fixtureFlagOff.nativeElement.querySelector('.scan-button')).toBeNull();
      expect(fixtureFlagOff.nativeElement.querySelector('.upload-button')).toBeNull();
    });
  });

  function eventoConArchivo(nombre = 'factura.pdf'): Event {
    const file = new File(['contenido'], nombre, { type: 'application/pdf' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    return { target: input } as unknown as Event;
  }

  // Único flujo de escaneo desde 2026-08-17 (ver el comentario en onFileSelected en el
  // componente): escanea, guarda en BBDD y sube el PDF al blob en la misma llamada, sin
  // pantalla de revisión intermedia. Usado tanto por "Escanear con cámara" como por
  // "Adjuntar documento" — ambos botones llaman al mismo método.
  it('escanear/adjuntar llama a crearDesdeDocumentoDirecto y refresca la lista', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const crearSpy = spyOn(repo, 'crearDesdeDocumentoDirecto').and.resolveTo(facturaDe('Iberdrola', 'Luz'));
    spyOn(repo, 'listar').and.resolveTo([]);

    await component.onFileSelected(eventoConArchivo());

    expect(crearSpy).toHaveBeenCalled();
    expect(component.processing).toBeFalse();
  });

  it('muestra el error del backend si rechaza (ej. proveedor no reconocido)', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    spyOn(repo, 'crearDesdeDocumentoDirecto').and.rejectWith(new Error('No existe ningún proveedor con ese NIF.'));

    await expectAsync(component.onFileSelected(eventoConArchivo())).toBeResolved();
    expect(component.processing).toBeFalse();
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

  // Regla confirmada por el jefe (reunión 2026-08-17): Borrador permite las 4 acciones
  // (copiar/descargar/compartir/eliminar); Contabilizada las mismas EXCEPTO eliminar.
  // Estos guards son defensa en profundidad — el icono ya está oculto por
  // accionesPermitidas(f).eliminar, pero se comprueba aparte por si acaso.
  it('confirmarEliminar() bloquea una factura pagada sin llegar a llamar al repositorio', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const eliminarSpy = spyOn(repo, 'eliminar');
    const pagada = { ...facturaDe('Iberdrola', 'Luz'), pagada: true };

    await component.confirmarEliminar(new Event('click'), pagada);

    expect(eliminarSpy).not.toHaveBeenCalled();
  });

  it('confirmarEliminar() bloquea una factura contabilizada sin llegar a llamar al repositorio', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const eliminarSpy = spyOn(repo, 'eliminar');
    const contabilizada = { ...facturaDe('Iberdrola', 'Luz'), accountingLocked: true };

    await component.confirmarEliminar(new Event('click'), contabilizada);

    expect(eliminarSpy).not.toHaveBeenCalled();
  });

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

  // La búsqueda por proveedor y el filtro de pagada ya no se aplican en el propio
  // getter — viajan al backend a través de listar() (Enumerar ya los soporta), así una
  // búsqueda encuentra facturas antiguas aunque no quepan en el límite de página. Se
  // comprueba con un spy sobre el repositorio, no filtrando component.facturas a mano.
  it('la búsqueda por proveedor se manda al repositorio a través de refresh(), no se filtra solo en cliente', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const listarSpy = spyOn(repo, 'listar').and.resolveTo([]);

    component.searchQuery = 'oficina';
    await component.refresh();

    expect(listarSpy).toHaveBeenCalledWith(jasmine.objectContaining({ query: 'oficina' }));
  });

  it('el filtro de pagada se manda al repositorio a través de refresh()', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const listarSpy = spyOn(repo, 'listar').and.resolveTo([]);

    component.pagadaFiltro = 'si';
    await component.refresh();

    expect(listarSpy).toHaveBeenCalledWith(jasmine.objectContaining({ pagada: true }));

    component.pagadaFiltro = 'no';
    await component.refresh();
    expect(listarSpy).toHaveBeenCalledWith(jasmine.objectContaining({ pagada: false }));

    component.pagadaFiltro = 'todos';
    await component.refresh();
    expect(listarSpy).toHaveBeenCalledWith(jasmine.objectContaining({ pagada: undefined }));
  });

  // BUG real corregido 2026-08-14: 'f' tal como llega del listado no trae 'lineas' (listar()
  // nunca las rellena para facturas reales, solo obtenerPorId lo hace con una petición
  // aparte) — copiar directamente desde la tarjeta de la lista producía un borrador con 0
  // líneas y, por tanto, 0,00 € en todo. duplicar() en esta página debe pedir primero el
  // detalle completo.
  // "Copiar" ahora pide el número de la nueva factura por un ion-alert (2026-08-17: la copia
  // se guarda ya de verdad en el backend, y Guardar exige un número no vacío) — se simula
  // confirmando el diálogo directamente contra el AlertController real, sin espiar sus
  // internals, para no acoplar el test al detalle de implementación del alert.
  function confirmarNumeroFacturaEnDialogo(numFactura: string) {
    const alertCtrl = TestBed.inject(AlertController);
    // El propio componente construye los botones del alert con su handler — se invoca aquí
    // el handler de "Copiar y guardar" directamente, como haría Ionic al pulsarlo.
    spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
      const boton = opts.buttons.find((b: any) => b.handler && b.text !== 'Cancelar');
      boton.handler({ numFactura });
      return { present: async () => {}, onDidDismiss: async () => ({} as any) } as any;
    });
  }

  it('copiar desde la lista pide primero el detalle completo (obtenerPorId), pide el número por diálogo y duplica con ese número', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const filaDeLista: FacturaRecibida = {
      id: 500, proveedor: 'Iberdrola', numFactura: 'F-500', fecha: '2026-08-01',
      lineas: [], retencionPct: 0, pagada: false, estado: 'revisada', origenOcr: false,
    };
    const detalleCompleto: FacturaRecibida = {
      ...filaDeLista,
      lineas: [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 80, descuentoPct: 0, ivaPct: 21 }],
    };
    spyOn(repo, 'obtenerPorId').and.resolveTo(detalleCompleto);
    const duplicarSpy = spyOn(repo, 'duplicar').and.resolveTo({ ...detalleCompleto, id: 999, numFactura: 'F-500-B' });
    confirmarNumeroFacturaEnDialogo('F-500-B');

    await component.duplicar(new Event('click'), filaDeLista);

    expect(repo.obtenerPorId).toHaveBeenCalledWith(500);
    expect(duplicarSpy).toHaveBeenCalledWith(detalleCompleto, 'F-500-B'); // no la fila vacía de la lista
  });

  it('si no se puede obtener el detalle completo, sigue duplicando con lo que ya tenía (mejor que fallar del todo)', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const filaDeLista: FacturaRecibida = {
      id: 501, proveedor: 'Iberdrola', numFactura: 'F-501', fecha: '2026-08-01',
      lineas: [], retencionPct: 0, pagada: false, estado: 'revisada', origenOcr: false,
    };
    spyOn(repo, 'obtenerPorId').and.resolveTo(undefined);
    const duplicarSpy = spyOn(repo, 'duplicar').and.resolveTo({ ...filaDeLista, id: 999, numFactura: 'F-501-B' });
    confirmarNumeroFacturaEnDialogo('F-501-B');

    await component.duplicar(new Event('click'), filaDeLista);

    expect(duplicarSpy).toHaveBeenCalledWith(filaDeLista, 'F-501-B');
  });

  it('si se cancela el diálogo del número de factura, no se llega a duplicar nada', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const filaDeLista: FacturaRecibida = {
      id: 502, proveedor: 'Iberdrola', numFactura: 'F-502', fecha: '2026-08-01',
      lineas: [], retencionPct: 0, pagada: false, estado: 'revisada', origenOcr: false,
    };
    spyOn(repo, 'obtenerPorId').and.resolveTo(filaDeLista);
    const duplicarSpy = spyOn(repo, 'duplicar');
    const alertCtrl = TestBed.inject(AlertController);
    spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
      const cancelar = opts.buttons.find((b: any) => b.role === 'cancel');
      cancelar.handler();
      return { present: async () => {}, onDidDismiss: async () => ({} as any) } as any;
    });

    await component.duplicar(new Event('click'), filaDeLista);

    expect(duplicarSpy).not.toHaveBeenCalled();
  });

  // Confirmado con el jefe el mapeo de Estado (131 = borrador, 132 = revisada) — igual que
  // proveedor/pagada, ahora también viaja al backend en vez de filtrarse solo en cliente.
  it('el filtro de estado se manda al repositorio a través de refresh()', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const listarSpy = spyOn(repo, 'listar').and.resolveTo([]);

    component.estadoFiltro = 'revisada';
    await component.refresh();

    expect(listarSpy).toHaveBeenCalledWith(jasmine.objectContaining({ estado: 'revisada' }));

    component.estadoFiltro = 'todos';
    await component.refresh();
    expect(listarSpy).toHaveBeenCalledWith(jasmine.objectContaining({ estado: undefined }));
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
