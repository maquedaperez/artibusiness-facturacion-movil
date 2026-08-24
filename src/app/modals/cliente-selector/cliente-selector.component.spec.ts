import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ModalController, provideIonicAngular } from '@ionic/angular/standalone';
import { ClienteSelectorComponent } from './cliente-selector.component';
import { CustomersRepository, IssuedInvoicesRepository } from '../../core/ports';
import { ClienteMock } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

const TRADUCCIONES_TEST = {
  es: {
    invoices: {
      issued: {
        clientSelector: {
          nameNifRequired: 'Nombre y NIF/CIF son obligatorios.',
          paymentMethodRequired: 'Selecciona una forma de pago para el cliente.',
          createError: 'No se pudo crear el cliente. Inténtalo de nuevo.',
        },
      },
    },
  },
};

describe('ClienteSelectorComponent — búsqueda bajo demanda', () => {
  let component: ClienteSelectorComponent;
  let fixture: ComponentFixture<ClienteSelectorComponent>;
  let customersRepoSpy: jasmine.SpyObj<CustomersRepository>;
  let issuedRepoSpy: jasmine.SpyObj<IssuedInvoicesRepository>;

  const paginaVacia: PaginaResultado<ClienteMock> = { items: [], total: 0, page: 1, pageSize: 20 };
  const cliente: ClienteMock = { id: 1, nif: 'B10000001', nombre: 'Cliente Uno', esEmpresa: true };
  const paginaConResultado: PaginaResultado<ClienteMock> = { items: [cliente], total: 1, page: 1, pageSize: 20 };

  beforeEach(() => {
    customersRepoSpy = jasmine.createSpyObj('CustomersRepository', ['buscar', 'crearAdHoc']);
    customersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaVacia));

    // Blindaje 2026-08-24: "Cliente nuevo" exige elegir una forma de pago — el selector carga
    // el mismo catálogo que ya usa el detalle de la factura.
    issuedRepoSpy = jasmine.createSpyObj('IssuedInvoicesRepository', ['obtenerMediosPago']);
    issuedRepoSpy.obtenerMediosPago.and.resolveTo([{ id: 1, label: 'Transferencia' }]);

    TestBed.configureTestingModule({
      imports: [ClienteSelectorComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting(TRADUCCIONES_TEST.es),
        { provide: CustomersRepository, useValue: customersRepoSpy },
        { provide: IssuedInvoicesRepository, useValue: issuedRepoSpy },
      ],
    });
    fixture = TestBed.createComponent(ClienteSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('no hace ninguna búsqueda al abrir el selector', () => {
    expect(customersRepoSpy.buscar).not.toHaveBeenCalled();
    expect(component.resultados).toEqual([]);
    expect(component.estado).toBe('inicial');
  });

  it('no busca con menos de 2 caracteres', fakeAsync(() => {
    component.query = 'a';
    component.onQueryChange();
    tick(500);

    expect(customersRepoSpy.buscar).not.toHaveBeenCalled();
    expect(component.estado).toBe('inicial');
  }));

  it('espera el debounce antes de buscar con 2 o más caracteres', fakeAsync(() => {
    customersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaConResultado));

    component.query = 'cl';
    component.onQueryChange();
    tick(100);
    expect(customersRepoSpy.buscar).not.toHaveBeenCalled();

    tick(300);
    expect(customersRepoSpy.buscar).toHaveBeenCalledWith('cl');
    expect(component.resultados).toEqual([cliente]);
    expect(component.estado).toBe('ok');
  }));

  it('cancela la búsqueda anterior si llega una consulta nueva antes de que resuelva', fakeAsync(() => {
    const llamadas: string[] = [];
    customersRepoSpy.buscar.and.callFake((q: string) => {
      llamadas.push(q);
      const pagina = q === 'clie' ? paginaConResultado : paginaVacia;
      return new Promise<PaginaResultado<ClienteMock>>(resolve => setTimeout(() => resolve(pagina), 500));
    });

    component.query = 'cl';
    component.onQueryChange();
    tick(350); // dispara buscar('cl'), que tarda 500ms en resolver

    component.query = 'clie';
    component.onQueryChange();
    tick(350); // dispara buscar('clie') — switchMap descarta ya la respuesta de 'cl'

    tick(600); // deja resolver ambas promesas pendientes

    expect(llamadas).toEqual(['cl', 'clie']);
    expect(component.resultados).toEqual([cliente]);
    expect(component.estado).toBe('ok');
  }));

  it('al borrar el texto, limpia los resultados y vuelve al estado inicial', fakeAsync(() => {
    customersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaConResultado));
    component.query = 'cl';
    component.onQueryChange();
    tick(400);
    expect(component.resultados.length).toBe(1);

    component.query = '';
    component.onQueryChange();

    expect(component.resultados).toEqual([]);
    expect(component.estado).toBe('inicial');
  }));

  it('muestra "sin resultados" cuando la búsqueda no encuentra nada', fakeAsync(() => {
    component.query = 'zz';
    component.onQueryChange();
    tick(400);

    expect(component.resultados).toEqual([]);
    expect(component.estado).toBe('sin-resultados');
  }));

  it('"Cliente nuevo" sigue disponible aunque la búsqueda falle', fakeAsync(() => {
    customersRepoSpy.buscar.and.callFake(() => {
      const promesa = new Promise<PaginaResultado<ClienteMock>>((_, reject) =>
        setTimeout(() => reject(new Error('fallo de red')), 10)
      );
      promesa.catch(() => {}); // evita el falso "unhandled rejection" de zone.js en el test — el componente sí la captura vía catchError
      return promesa;
    });
    component.query = 'cl';
    component.onQueryChange();
    tick(400);

    expect(component.estado).toBe('error');
    component.modoNuevo = true;
    expect(component.modoNuevo).toBeTrue();
  }));
});

describe('ClienteSelectorComponent — alta rápida ("Cliente nuevo")', () => {
  let component: ClienteSelectorComponent;
  let fixture: ComponentFixture<ClienteSelectorComponent>;
  let customersRepoSpy: jasmine.SpyObj<CustomersRepository>;
  let issuedRepoSpy: jasmine.SpyObj<IssuedInvoicesRepository>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  const clienteCreado: ClienteMock = { id: 99, nif: 'B00000000', nombre: 'Cliente Nuevo', esEmpresa: true };

  // fakeAsync también en el beforeEach: el catálogo de medios de pago se carga en el
  // constructor (promesa real) — si se resuelve fuera de la zona fakeAsync del propio it(),
  // tick() dentro del it() no la ve y los campos se quedan en sus valores iniciales ([]/null).
  beforeEach(fakeAsync(() => {
    customersRepoSpy = jasmine.createSpyObj('CustomersRepository', ['buscar', 'crearAdHoc']);
    customersRepoSpy.buscar.and.resolveTo({ items: [], total: 0, page: 1, pageSize: 20 });
    customersRepoSpy.crearAdHoc.and.resolveTo(clienteCreado);

    issuedRepoSpy = jasmine.createSpyObj('IssuedInvoicesRepository', ['obtenerMediosPago']);
    issuedRepoSpy.obtenerMediosPago.and.resolveTo([{ id: 3, label: 'Transferencia' }, { id: 4, label: 'Domiciliación' }]);

    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['dismiss']);

    TestBed.configureTestingModule({
      imports: [ClienteSelectorComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting(TRADUCCIONES_TEST.es),
        { provide: CustomersRepository, useValue: customersRepoSpy },
        { provide: IssuedInvoicesRepository, useValue: issuedRepoSpy },
        { provide: ModalController, useValue: modalCtrlSpy },
      ],
    });
    fixture = TestBed.createComponent(ClienteSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick();
  }));

  it('precarga el catálogo de medios de pago y preselecciona el primero', fakeAsync(() => {
    tick();
    expect(component.mediosPago.length).toBe(2);
    expect(component.idMedioPago).toBe(3);
  }));

  it('exige elegir forma de pago antes de crear el cliente', fakeAsync(() => {
    tick();
    component.modoNuevo = true;
    component.nuevo = { nombre: 'Cliente Nuevo', nif: 'B00000000', esEmpresa: true, direccion: '', poblacion: '', cp: '', provincia: '' };
    component.idMedioPago = null;

    component.confirmarNuevo();
    tick();

    expect(component.errorMsg).toContain('forma de pago');
    expect(customersRepoSpy.crearAdHoc).not.toHaveBeenCalled();
  }));

  it('crea el cliente real (con idMedioPago) y cierra el modal devolviéndolo', fakeAsync(() => {
    tick();
    component.modoNuevo = true;
    component.nuevo = { nombre: 'Cliente Nuevo', nif: 'B00000000', esEmpresa: true, direccion: '', poblacion: '', cp: '', provincia: '' };

    component.confirmarNuevo();
    tick();

    expect(customersRepoSpy.crearAdHoc).toHaveBeenCalledWith(jasmine.objectContaining({ nombre: 'Cliente Nuevo' }), 3);
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith({ cliente: clienteCreado, esNuevo: true }, 'confirm');
  }));

  it('si crearAdHoc falla (p. ej. NIF duplicado), muestra el error y no cierra el modal', fakeAsync(() => {
    tick();
    customersRepoSpy.crearAdHoc.and.rejectWith(new Error('Ya existe un cliente con NIF B00000000.'));
    component.modoNuevo = true;
    component.nuevo = { nombre: 'Cliente Nuevo', nif: 'B00000000', esEmpresa: true, direccion: '', poblacion: '', cp: '', provincia: '' };

    component.confirmarNuevo();
    tick();

    expect(component.errorMsg).toBe('Ya existe un cliente con NIF B00000000.');
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  }));
});
