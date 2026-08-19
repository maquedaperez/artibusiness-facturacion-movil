import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { FacturaRecibidaDetallePage } from './factura-recibida-detalle.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { ApiService } from '../../services/api.service';
import { ReceivedInvoicesRepository } from '../../core/ports';
import { FacturaRecibida } from '../../services/mock-facturas.service';

describe('FacturaRecibidaDetallePage', () => {
  let component: FacturaRecibidaDetallePage;
  let fixture: ComponentFixture<FacturaRecibidaDetallePage>;

  // 'routeId' simula el parámetro :id de la URL ('nueva' para alta manual, un id numérico
  // para abrir una factura ya existente). apiStub sustituye ApiService entero: por defecto
  // get() rechaza con 404 (para que obtenerPorId caiga al almacén local, igual que contra
  // el backend real cuando el id no existe todavía) y post() resuelve vacío (catálogos).
  async function configurar(routeId: string, apiStub: Partial<ApiService> = {}) {
    TestBed.configureTestingModule({
      imports: [FacturaRecibidaDetallePage, RouterTestingModule],
      providers: [
        ...MOCK_REPOSITORY_PROVIDERS,
        provideIonicAngular(),
        {
          provide: ApiService,
          useValue: {
            get: jasmine.createSpy().and.rejectWith(new Error('HTTP 404')),
            post: jasmine.createSpy().and.resolveTo([]),
            delete: jasmine.createSpy().and.resolveTo(undefined),
            ...apiStub,
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeId } } } },
      ],
    });
    fixture = TestBed.createComponent(FacturaRecibidaDetallePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function facturaBorradorReal(overrides: Partial<FacturaRecibida> = {}): FacturaRecibida {
    return {
      id: 501, proveedor: 'Iberdrola', proveedorNif: 'A95758389', idProveedor: 7,
      numFactura: 'F-501', fecha: '2026-08-01', vencimiento: '',
      concepto: 'Luz', lineas: [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }],
      retencionPct: 0, pagada: false, estado: 'borrador', origenOcr: false,
      accountingLocked: false, // 131/borrador: no bloqueada
      ...overrides,
    };
  }

  describe('estado por defecto (id sin resolver, factura no encontrada)', () => {
    beforeEach(async () => configurar('999'));

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    // idProveedor siempre es un id real del backend: tanto una búsqueda (POST
    // /api/Proveedores/Enumerar) como un alta rápida (POST /api/Proveedores/Crear) lo
    // devuelven así, y el selector dismissea los dos casos con el mismo role 'confirm'.
    it('guarda idProveedor cuando el modal confirma (búsqueda o alta rápida, mismo role "confirm")', async () => {
      const modalCtrl = TestBed.inject(ModalController);
      spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({ data: { nombre: 'Iberdrola', nif: 'A95758389', id: 42 }, role: 'confirm' }),
      } as any);

      await component.elegirProveedor();

      expect(component.working.proveedor).toBe('Iberdrola');
      expect(component.working.idProveedor).toBe(42);
    });

    it('NO toca el proveedor si el selector se cancela', async () => {
      const modalCtrl = TestBed.inject(ModalController);
      spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({ data: null, role: 'cancel' }),
      } as any);

      const proveedorPrevio = component.working.proveedor;
      await component.elegirProveedor();

      expect(component.working.proveedor).toBe(proveedorPrevio);
      expect(component.working.idProveedor).toBeUndefined();
    });

  });

  describe('error real (no 404) al cargar la factura', () => {
    beforeEach(async () => configurar('502', { get: jasmine.createSpy().and.rejectWith(new Error('HTTP 500 - Error interno del servidor.')) }));

    it('se muestra el error real, no "factura no encontrada"', () => {
      expect(component.errorMsg).toContain('500');
    });
  });

  describe('alta manual (nueva)', () => {
    beforeEach(async () => configurar('nueva'));

    it('empieza en modo nueva, editable, sin id', () => {
      expect(component.esNueva).toBeTrue();
      expect(component.facturaId).toBeNull();
      expect(component.esEditable).toBeTrue();
      expect(component.pagadaEditable).toBeTrue();
    });

    // BUG real corregido 2026-08-18: el formulario en blanco ponía estado:'revisada' por
    // defecto — con el desplegable de Estado ya de solo lectura (ver confirmarContabilizar),
    // eso hacía que CUALQUIER factura manual naciera Contabilizada de verdad en el backend
    // nada más pulsar Guardar la primera vez, sin que el usuario lo pidiera nunca.
    it('nace en Borrador, nunca Contabilizada', () => {
      expect(component.working.estado).toBe('borrador');
    });

    it('crearManual() da de alta la factura y actualiza esNueva/facturaId con la respuesta real', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      spyOn(repo, 'crearManual').and.resolveTo({ ...facturaBorradorReal(), id: 900 });

      component.working.proveedor = 'Iberdrola';
      component.working.numFactura = 'F-900';
      component.working.idProveedor = 7;
      component.working.lineas = [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }];

      await component.guardar();

      expect(component.esNueva).toBeFalse();
      expect(component.facturaId).toBe(900);
      expect(component.errorMsg).toBe('');
    });

    // BUG real corregido 2026-08-18: antes guardar() nunca actualizaba 'working' con la
    // respuesta del servidor — así que idLineaBackend se quedaba siempre vacío en el
    // formulario, y un guardado posterior no reconocía las líneas ya existentes (las
    // borraba y recreaba todas de cero en vez de actualizarlas).
    it('tras guardar, working se sincroniza con la respuesta real (idLineaBackend incluido)', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      spyOn(repo, 'crearManual').and.resolveTo({
        ...facturaBorradorReal(),
        id: 900,
        lineas: [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21, idLineaBackend: 55 }],
      });

      component.working.proveedor = 'Iberdrola';
      component.working.numFactura = 'F-900';
      component.working.idProveedor = 7;
      component.working.lineas = [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }];

      await component.guardar();

      expect(component.working.lineas[0].idLineaBackend).toBe(55);
    });

    // BUG real corregido 2026-08-14 (guardado duplicado): pulsar "Guardar" una segunda vez
    // sobre la misma factura ya guardada debe llamar a actualizar(id, ...) con el id real
    // que devolvió el primer guardado — nunca a crearManual() otra vez, que crearía una
    // fila nueva en vez de corregir la existente.
    it('guardarla una segunda vez llama a actualizar(id, ...) con el mismo id, nunca vuelve a crearManual', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const crearSpy = spyOn(repo, 'crearManual').and.resolveTo({ ...facturaBorradorReal(), id: 900 });
      const actualizarSpy = spyOn(repo, 'actualizar').and.resolveTo({ ...facturaBorradorReal(), id: 900 });

      component.working.proveedor = 'Iberdrola';
      component.working.numFactura = 'F-900';
      component.working.idProveedor = 7;
      component.working.lineas = [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }];

      await component.guardar(); // primera vez: alta
      component.working.concepto = 'Corregido';
      await component.guardar(); // segunda vez: actualización

      expect(crearSpy).toHaveBeenCalledTimes(1);
      expect(actualizarSpy).toHaveBeenCalledTimes(1);
      expect(actualizarSpy).toHaveBeenCalledWith(900, jasmine.objectContaining({ concepto: 'Corregido' }));
      expect(component.facturaId).toBe(900); // sigue siendo el mismo id, no uno nuevo
    });

    it('no guarda sin proveedor seleccionado', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const crearSpy = spyOn(repo, 'crearManual');

      component.working.proveedor = 'Iberdrola';
      component.working.numFactura = 'F-900';
      // idProveedor sin definir a propósito

      await component.guardar();

      expect(crearSpy).not.toHaveBeenCalled();
      expect(component.errorMsg).toContain('proveedor');
    });

    // Encontrado en revisión 2026-08-18: el aviso de "proveedor y número obligatorios" solo
    // se mostraba como texto fijo bajo la cabecera — si el usuario estaba desplazado hacia
    // las líneas al pulsar "Guardar", ese texto quedaba fuera de la vista y el aviso pasaba
    // desapercibido. Ahora también debe saltar como toast rojo.
    it('los avisos de validación al guardar también saltan como toast rojo, no solo como texto fijo', async () => {
      const toastCtrl = TestBed.inject(ToastController);
      const toastSpy = spyOn(toastCtrl, 'create').and.callThrough();

      // proveedor y numFactura vacíos a propósito (valores por defecto del formulario en blanco)
      await component.guardar();

      expect(component.errorMsg).toContain('obligatorios');
      expect(toastSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        message: jasmine.stringContaining('obligatorios'),
        color: 'danger',
      }));
    });

    // Pedido por el usuario 2026-08-18: cuando el proveedor viene de un escaneo sin
    // reconocer, la factura ya trae nombre/NIF/dirección extraídos por el OCR — elegirProveedor()
    // debe pasárselos al selector para que el alta rápida no obligue a teclearlos de cero.
    it('con datos de proveedor ya extraídos (sin idProveedor todavía), se los pasa al selector para precargar el alta', async () => {
      component.working.proveedor = 'Suministros Vallejo';
      component.working.proveedorNif = 'B12345678';
      component.working.proveedorDireccion = 'Calle Mayor 1';
      // idProveedor sin definir a propósito: así es exactamente como llega un borrador del
      // fallback de escaneo (crearDesdeOcr) cuando el proveedor no se reconoció.

      const modalCtrl = TestBed.inject(ModalController);
      const createSpy = spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({ data: null, role: 'cancel' }),
      } as any);

      await component.elegirProveedor();

      expect(createSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        componentProps: { datosIniciales: jasmine.objectContaining({ nombre: 'Suministros Vallejo', nif: 'B12345678' }) },
      }));
    });

    it('con idProveedor ya resuelto, NO precarga nada (es una edición normal, no un borrador de escaneo)', async () => {
      component.working.proveedor = 'Iberdrola';
      component.working.idProveedor = 7;

      const modalCtrl = TestBed.inject(ModalController);
      const createSpy = spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({ data: null, role: 'cancel' }),
      } as any);

      await component.elegirProveedor();

      expect(createSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        componentProps: { datosIniciales: undefined },
      }));
    });

    it('un error real al guardar (rechazo del backend) también salta como toast rojo', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      spyOn(repo, 'crearManual').and.rejectWith(new Error('Ya existe una factura con ese número.'));
      const toastCtrl = TestBed.inject(ToastController);
      const toastSpy = spyOn(toastCtrl, 'create').and.callThrough();

      component.working.proveedor = 'Iberdrola';
      component.working.numFactura = 'F-900';
      component.working.idProveedor = 7;

      await component.guardar();

      expect(component.errorMsg).toBe('Ya existe una factura con ese número.');
      expect(toastSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        message: 'Ya existe una factura con ese número.',
        color: 'danger',
      }));
    });

    function eventoConArchivo(nombre = 'factura.pdf'): Event {
      const file = new File(['contenido'], nombre, { type: 'application/pdf' });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    // Pedido por el usuario 2026-08-19: antes de que la factura tenga un id real no hay nada
    // a lo que subir el documento — adjuntarDocumento() (vista previa local, Data URL) es lo
    // único que se puede hacer, y guardar() sube el fichero de verdad en cuanto exista un id.
    it('adjuntar antes de guardar usa solo la vista previa local, no sube nada al backend todavía', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const previewSpy = spyOn(repo, 'adjuntarDocumento').and.resolveTo({ documentoUrl: 'data:application/pdf;base64,AAAA', documentoNombre: 'factura.pdf' });
      const subidaRealSpy = spyOn(repo, 'adjuntarDocumentoAFactura');

      await component.onFileSelected(eventoConArchivo());

      expect(previewSpy).toHaveBeenCalled();
      expect(subidaRealSpy).not.toHaveBeenCalled();
      expect(component.working.documentoUrl).toBe('data:application/pdf;base64,AAAA');
    });

    it('tras guardar con un fichero pendiente de adjuntar, se sube de verdad y documentoUrl pasa a ser la ruta real', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      spyOn(repo, 'adjuntarDocumento').and.resolveTo({ documentoUrl: 'data:application/pdf;base64,AAAA', documentoNombre: 'factura.pdf' });
      spyOn(repo, 'crearManual').and.resolveTo({ ...facturaBorradorReal(), id: 900 });
      const subidaRealSpy = spyOn(repo, 'adjuntarDocumentoAFactura').and.resolveTo({ documentoUrl: '/api/FacturasRecibidas/900/Documento', documentoNombre: 'factura.pdf' });

      await component.onFileSelected(eventoConArchivo());

      component.working.proveedor = 'Iberdrola';
      component.working.numFactura = 'F-900';
      component.working.idProveedor = 7;
      component.working.lineas = [{ id: 1, origen: 'manual', descripcion: 'Luz', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 }];

      await component.guardar();

      expect(subidaRealSpy).toHaveBeenCalledWith(900, jasmine.any(File));
      expect(component.working.documentoUrl).toBe('/api/FacturasRecibidas/900/Documento');
    });

    it('adjuntar sobre una factura ya real (facturaId ya asignado) sube directo, sin pasar por la vista previa local', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const previewSpy = spyOn(repo, 'adjuntarDocumento');
      const subidaRealSpy = spyOn(repo, 'adjuntarDocumentoAFactura').and.resolveTo({ documentoUrl: '/api/FacturasRecibidas/900/Documento', documentoNombre: 'factura.pdf' });
      component.facturaId = 900;

      await component.onFileSelected(eventoConArchivo());

      expect(subidaRealSpy).toHaveBeenCalledWith(900, jasmine.any(File));
      expect(previewSpy).not.toHaveBeenCalled();
      expect(component.working.documentoUrl).toBe('/api/FacturasRecibidas/900/Documento');
    });

    // BUG real encontrado en revisión 2026-08-19: descargarAdjunto()/compartirAdjunto()
    // llamaban a un adjuntoABlob() PROPIO de esta página que seguía haciendo fetch(documentoUrl)
    // directo sin autenticar — el mismo fix que ya se había aplicado en facturas-recibidas.
    // page.ts (el listado) se había quedado sin aplicar aquí, en el detalle.
    it('descargarAdjunto() pide el documento a través de obtenerBlobDocumento(), no con fetch directo', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const blobFalso = new Blob(['contenido'], { type: 'application/pdf' });
      const obtenerBlobSpy = spyOn(repo, 'obtenerBlobDocumento').and.resolveTo(blobFalso);
      const fetchSpy = spyOn(window, 'fetch');
      // BUG real en este mismo test, encontrado 2026-08-19: descargarAdjunto() llama a
      // descargarBlob() DE VERDAD (no está mockeado en ningún sitio de esta suite) — sin
      // simular createObjectURL/click, cada ejecución de los tests descargaba de verdad un
      // "factura.pdf" corrupto (el Blob de prueba solo contiene el texto "contenido", no
      // bytes reales de PDF) al Downloads real de quien ejecutara los tests.
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-descarga');
      spyOn(URL, 'revokeObjectURL');
      spyOn(HTMLAnchorElement.prototype, 'click');
      component.working.documentoUrl = '/api/FacturasRecibidas/900/Documento';
      component.working.documentoNombre = 'factura.pdf';

      await component.descargarAdjunto();

      expect(obtenerBlobSpy).toHaveBeenCalledWith('/api/FacturasRecibidas/900/Documento');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    // Encontrado en revisión 2026-08-19: VerDocumentoComponent necesita el content-type real
    // para elegir entre <embed> (PDF) e <img> — antes solo mostraba <img>, rompiendo la
    // previsualización de cualquier PDF. verDocumento() tiene que resolverlo en los dos casos:
    // vista previa local (viene ya en la propia Data URL) y documento real (viene del blob).
    it('verDocumento() con una vista previa local extrae el tipo de la propia Data URL', async () => {
      const modalCtrl = TestBed.inject(ModalController);
      const createSpy = spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({}) as any,
      } as any);
      component.working.documentoUrl = 'data:application/pdf;base64,AAAA';

      await component.verDocumento();

      expect(createSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        componentProps: jasmine.objectContaining({ tipo: 'application/pdf' }),
      }));
    });

    it('verDocumento() con un documento real toma el tipo del blob devuelto por el backend', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const blobPdf = new Blob(['contenido'], { type: 'application/pdf' });
      spyOn(repo, 'obtenerBlobDocumento').and.resolveTo(blobPdf);
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-preview');
      spyOn(URL, 'revokeObjectURL');
      const modalCtrl = TestBed.inject(ModalController);
      const createSpy = spyOn(modalCtrl, 'create').and.resolveTo({
        present: async () => {},
        onWillDismiss: async () => ({}) as any,
      } as any);
      component.working.documentoUrl = '/api/FacturasRecibidas/900/Documento';

      await component.verDocumento();

      expect(createSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        componentProps: jasmine.objectContaining({ tipo: 'application/pdf', url: 'blob:mock-preview' }),
      }));
    });
  });

  describe('factura real en estado borrador (editable, ya no bloqueada indiscriminadamente)', () => {
    beforeEach(async () => configurar('501', {
      get: jasmine.createSpy().and.resolveTo({
        idFacturaRecibida: 501, numFacRec: 'F-501', idProveedor: 7, nombreProveedor: 'Iberdrola',
        concepto: 'Luz', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
        pagada: false, estado: 131, escaneada: false,
        fechaFactura: '2026-08-01', fechaVencimiento: '2026-08-01',
        idMedioPago: null, idTipoFactura: 1,
        lineas: [{ idFacturaRecibidaLinea: 20, descripcion: 'Luz', cantidad: 1, precioUnitario: 100, importe: 100, idImpuesto: 1 }],
      }),
      post: jasmine.createSpy().and.resolveTo([{ idImpuesto: 1, descripcion: 'IVA 21%', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' }]),
    }));

    it('es editable (estado borrador, no contabilizada)', () => {
      expect(component.esEditable).toBeTrue();
    });

    it('reconstruye el ivaPct real de la línea (no 0%) y conserva idLineaBackend', () => {
      expect(component.working.lineas[0].ivaPct).toBe(21);
      expect(component.working.lineas[0].idLineaBackend).toBe(20);
    });

    // Petición explícita en revisión 2026-08-14: 'pagada' no debe ser un checkbox libre en
    // una factura ya real — cambiarla aquí fingiría un pago sin ningún movimiento contable
    // real detrás (fuera de alcance: pagos vía agt_caja).
    it('pagada NO es editable (ya es una factura real)', () => {
      expect(component.pagadaEditable).toBeFalse();
    });

    it('bloquea el borrado si está marcada como pagada, sin llegar a llamar al repositorio', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const eliminarSpy = spyOn(repo, 'eliminar');
      component.working.pagada = true;

      await component.confirmarEliminar();

      expect(eliminarSpy).not.toHaveBeenCalled();
    });

    // Pedido por el jefe en reunión 2026-08-17: "Contabilizar" es una acción propia (igual
    // que en Emitidas) que solo cambia el estado de 131 a 132 — tras confirmar, la factura
    // debe quedar bloqueada para editar de inmediato, sin tener que recargarla.
    it('confirmarContabilizar() manda estado revisada a actualizar() y bloquea el formulario tras confirmar', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const actualizarSpy = spyOn(repo, 'actualizar').and.resolveTo({
        id: 501, proveedor: 'Iberdrola', proveedorNif: 'A95758389', idProveedor: 7,
        numFactura: 'F-501', fecha: '2026-08-01', vencimiento: '2026-08-01',
        concepto: 'Luz', lineas: component.working.lineas,
        retencionPct: 0, pagada: false, estado: 'revisada', origenOcr: false,
        accountingLocked: true,
      });
      const alertCtrl = TestBed.inject(AlertController);
      spyOn(alertCtrl, 'create').and.callFake(async (opts: any) => {
        const boton = opts.buttons.find((b: any) => b.text === 'Contabilizar');
        await boton.handler();
        return { present: async () => {} } as any;
      });

      await component.confirmarContabilizar();

      expect(actualizarSpy).toHaveBeenCalledWith(501, jasmine.objectContaining({ estado: 'revisada' }));
      expect(component.esEditable).toBeFalse(); // bloqueada de inmediato, sin recargar
    });
  });

  describe('factura real en estado revisada/contabilizada (bloqueada)', () => {
    beforeEach(async () => configurar('502', {
      get: jasmine.createSpy().and.resolveTo({
        idFacturaRecibida: 502, numFacRec: 'F-502', idProveedor: 7, nombreProveedor: 'Iberdrola',
        concepto: 'Luz', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
        pagada: false, estado: 132, escaneada: false,
        fechaFactura: '2026-08-01', fechaVencimiento: '2026-08-01',
        idMedioPago: null, idTipoFactura: 1, lineas: [],
      }),
    }));

    it('NO es editable (estado 132 = contabilizada)', () => {
      expect(component.esEditable).toBeFalse();
    });

    // Regla confirmada por el jefe (reunión 2026-08-17): una factura ya contabilizada no
    // se puede eliminar desde la app — antes solo se bloqueaba por 'pagada'.
    it('bloquea el borrado si está contabilizada, sin llegar a llamar al repositorio', async () => {
      const repo = TestBed.inject(ReceivedInvoicesRepository);
      const eliminarSpy = spyOn(repo, 'eliminar');

      await component.confirmarEliminar();

      expect(eliminarSpy).not.toHaveBeenCalled();
    });
  });
});
