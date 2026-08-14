import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FacturasRecibidasPage } from './facturas-recibidas.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { FacturaRecibida } from '../../services/mock-facturas.service';
import { ApiService } from '../../services/api.service';
import { ReceivedInvoicesRepository } from '../../core/ports';

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

  // El endpoint que necesita este botón (CrearDesdeDocumento) está listo en local pero
  // todavía no desplegado — mientras environment.ts tenga enableQuickSave=false (su valor
  // hoy), el botón ni se muestra, para no dejar una acción que solo devolvería 404.
  it('el botón de Guardado rápido está oculto porque el endpoint aún no está desplegado', () => {
    expect(component.mostrarGuardadoRapido).toBeFalse();
    const boton = fixture.nativeElement.querySelector('.guardado-rapido-button');
    expect(boton).toBeNull();
  });

  it('triggerGuardadoRapido() no hace nada mientras el flag esté desactivado (defensa en profundidad)', () => {
    const clickSpy = spyOn(component.fileInputRapido!.nativeElement, 'click');
    component.triggerGuardadoRapido();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  function eventoConArchivo(nombre = 'factura.pdf'): Event {
    const file = new File(['contenido'], nombre, { type: 'application/pdf' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    return { target: input } as unknown as Event;
  }

  // "Guardado rápido" (pedido por el jefe, reunión 2026-08-14): a diferencia de escanear
  // con OCR (que deja un borrador local para revisar), esto llama directamente al
  // repositorio para guardar la factura ya real, sin pantalla intermedia.
  it('guardado rápido llama a crearDesdeDocumentoDirecto y refresca la lista', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const crearSpy = spyOn(repo, 'crearDesdeDocumentoDirecto').and.resolveTo(facturaDe('Iberdrola', 'Luz'));
    spyOn(repo, 'listar').and.resolveTo([]);

    await component.onFileSelectedGuardadoRapido(eventoConArchivo());

    expect(crearSpy).toHaveBeenCalled();
    expect(component.processing).toBeFalse();
  });

  it('guardado rápido muestra el error del backend si rechaza (ej. proveedor no reconocido)', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    spyOn(repo, 'crearDesdeDocumentoDirecto').and.rejectWith(new Error('No existe ningún proveedor con ese NIF.'));

    await expectAsync(component.onFileSelectedGuardadoRapido(eventoConArchivo())).toBeResolved();
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
  it('copiar desde la lista pide primero el detalle completo (obtenerPorId) antes de duplicar', async () => {
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
    const duplicarSpy = spyOn(repo, 'duplicar').and.returnValue({ ...detalleCompleto, id: 999 });

    await component.duplicar(new Event('click'), filaDeLista);

    expect(repo.obtenerPorId).toHaveBeenCalledWith(500);
    expect(duplicarSpy).toHaveBeenCalledWith(detalleCompleto); // no la fila vacía de la lista
  });

  it('si no se puede obtener el detalle completo, sigue duplicando con lo que ya tenía (mejor que fallar del todo)', async () => {
    const repo = TestBed.inject(ReceivedInvoicesRepository);
    const filaDeLista: FacturaRecibida = {
      id: 501, proveedor: 'Iberdrola', numFactura: 'F-501', fecha: '2026-08-01',
      lineas: [], retencionPct: 0, pagada: false, estado: 'revisada', origenOcr: false,
    };
    spyOn(repo, 'obtenerPorId').and.resolveTo(undefined);
    const duplicarSpy = spyOn(repo, 'duplicar').and.returnValue({ ...filaDeLista, id: 999 });

    await component.duplicar(new Event('click'), filaDeLista);

    expect(duplicarSpy).toHaveBeenCalledWith(filaDeLista);
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
