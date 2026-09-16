import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { ProveedorSelectorComponent } from './proveedor-selector.component';
import { SuppliersRepository } from '../../core/ports';
import { ProveedorMock } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('ProveedorSelectorComponent — búsqueda bajo demanda', () => {
  let component: ProveedorSelectorComponent;
  let fixture: ComponentFixture<ProveedorSelectorComponent>;
  let suppliersRepoSpy: jasmine.SpyObj<SuppliersRepository>;

  const paginaVacia: PaginaResultado<ProveedorMock> = { items: [], total: 0, page: 1, pageSize: 20 };
  const proveedor: ProveedorMock = { id: 1, nif: 'B20000002', nombre: 'Proveedor Uno' };
  const paginaConResultado: PaginaResultado<ProveedorMock> = { items: [proveedor], total: 1, page: 1, pageSize: 20 };

  beforeEach(() => {
    suppliersRepoSpy = jasmine.createSpyObj('SuppliersRepository', ['buscar', 'crearAdHoc']);
    suppliersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaVacia));

    TestBed.configureTestingModule({
      imports: [ProveedorSelectorComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting(),
        { provide: SuppliersRepository, useValue: suppliersRepoSpy },
      ],
    });
    fixture = TestBed.createComponent(ProveedorSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('no hace ninguna búsqueda al abrir el selector', () => {
    expect(suppliersRepoSpy.buscar).not.toHaveBeenCalled();
    expect(component.resultados).toEqual([]);
    expect(component.estado).toBe('inicial');
  });

  it('no busca con menos de 2 caracteres', fakeAsync(() => {
    component.query = 'v';
    component.onQueryChange();
    tick(500);

    expect(suppliersRepoSpy.buscar).not.toHaveBeenCalled();
    expect(component.estado).toBe('inicial');
  }));

  it('espera el debounce antes de buscar con 2 o más caracteres', fakeAsync(() => {
    suppliersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaConResultado));

    component.query = 'vi';
    component.onQueryChange();
    tick(100);
    expect(suppliersRepoSpy.buscar).not.toHaveBeenCalled();

    tick(300);
    expect(suppliersRepoSpy.buscar).toHaveBeenCalledWith('vi');
    expect(component.resultados).toEqual([proveedor]);
    expect(component.estado).toBe('ok');
  }));

  it('cancela la búsqueda anterior si llega una consulta nueva antes de que resuelva', fakeAsync(() => {
    const llamadas: string[] = [];
    suppliersRepoSpy.buscar.and.callFake((q: string) => {
      llamadas.push(q);
      const pagina = q === 'vida' ? paginaConResultado : paginaVacia;
      return new Promise<PaginaResultado<ProveedorMock>>(resolve => setTimeout(() => resolve(pagina), 500));
    });

    component.query = 'vi';
    component.onQueryChange();
    tick(350);

    component.query = 'vida';
    component.onQueryChange();
    tick(350);

    tick(600);

    expect(llamadas).toEqual(['vi', 'vida']);
    expect(component.resultados).toEqual([proveedor]);
    expect(component.estado).toBe('ok');
  }));

  it('al borrar el texto, limpia los resultados y vuelve al estado inicial', fakeAsync(() => {
    suppliersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaConResultado));
    component.query = 'vi';
    component.onQueryChange();
    tick(400);
    expect(component.resultados.length).toBe(1);

    component.query = '';
    component.onQueryChange();

    expect(component.resultados).toEqual([]);
    expect(component.estado).toBe('inicial');
  }));
});

// Pedido por el usuario 2026-08-18: cuando el borrador viene de un escaneo sin proveedor
// reconocido, la factura ya trae nombre/NIF/dirección extraídos por el OCR — no debería hacer
// falta teclearlos de cero en el alta rápida. datosIniciales es un @Input, así que cada test
// crea su propia instancia y lo fija ANTES del primer detectChanges() (que dispara ngOnInit).
describe('ProveedorSelectorComponent — precarga desde un escaneo (datosIniciales)', () => {
  let component: ProveedorSelectorComponent;
  let fixture: ComponentFixture<ProveedorSelectorComponent>;

  function crear(datosIniciales?: Partial<Omit<ProveedorMock, 'id'>>) {
    const suppliersRepoSpy = jasmine.createSpyObj('SuppliersRepository', ['buscar', 'crearAdHoc']);
    TestBed.configureTestingModule({
      imports: [ProveedorSelectorComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting(),
        { provide: SuppliersRepository, useValue: suppliersRepoSpy },
      ],
    });
    fixture = TestBed.createComponent(ProveedorSelectorComponent);
    component = fixture.componentInstance;
    component.datosIniciales = datosIniciales;
    fixture.detectChanges();
  }

  it('con nombre o NIF ya extraídos, abre directo en modo alta con el formulario precargado', () => {
    crear({ nombre: 'Suministros Vallejo', nif: 'B12345678', direccion: 'Calle Mayor 1', poblacion: 'Madrid', cp: '28001', provincia: 'Madrid' });

    expect(component.modoNuevo).toBeTrue();
    expect(component.nuevo).toEqual(jasmine.objectContaining({
      nombre: 'Suministros Vallejo', nif: 'B12345678',
    }));
  });

  it('sin datosIniciales (búsqueda manual normal), no cambia el comportamiento por defecto', () => {
    crear(undefined);

    expect(component.modoNuevo).toBeFalse();
    expect(component.nuevo.nombre).toBe('');
  });

  it('con datosIniciales vacío (ni nombre ni NIF), tampoco fuerza el modo alta', () => {
    crear({ direccion: 'Calle Mayor 1' });

    expect(component.modoNuevo).toBeFalse();
  });
});

// El alta de clientes validaba el NIF desde el 14-09 y la de proveedores no (barrido del
// front, 2026-09-16): se daba de alta con cualquier cosa escrita en el campo.
describe('ProveedorSelectorComponent — alta con NIF', () => {
  let component: ProveedorSelectorComponent;
  let fixture: ComponentFixture<ProveedorSelectorComponent>;
  let suppliersRepoSpy: jasmine.SpyObj<SuppliersRepository>;

  const completo = {
    nombre: 'Renfe Viajeros', direccion: 'Avenida de la Ciudad de Barcelona 8',
    poblacion: 'Madrid', cp: '28007', provincia: 'Madrid',
  };

  beforeEach(() => {
    suppliersRepoSpy = jasmine.createSpyObj('SuppliersRepository', ['buscar', 'crearAdHoc']);
    suppliersRepoSpy.buscar.and.returnValue(Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }));
    suppliersRepoSpy.crearAdHoc.and.returnValue(Promise.resolve({ id: 9, nif: 'A86868189', nombre: 'Renfe Viajeros' }));

    TestBed.configureTestingModule({
      imports: [ProveedorSelectorComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting(),
        { provide: SuppliersRepository, useValue: suppliersRepoSpy },
      ],
    });
    fixture = TestBed.createComponent(ProveedorSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.modoNuevo = true;
  });

  // Letra de control mal = NIF español mal escrito, casi siempre un dedazo: eso sí se bloquea.
  it('un NIF con la letra cambiada no llega al backend', async () => {
    component.nuevo = { ...completo, nif: 'A86868180' };

    await component.confirmarNuevo();

    expect(suppliersRepoSpy.crearAdHoc).not.toHaveBeenCalled();
    expect(component.nifIncorrecto).toBeTrue();
    expect(component.errorMsg).toBe(component.avisoNif);
  });

  // Un proveedor extranjero (un hotel, Amazon, un billete de fuera) no tiene NIF español y es
  // de lo más normal en una factura escaneada. Se avisa, pero se deja dar de alta: el endpoint
  // de proveedores tampoco lo rechaza.
  it('un NIF que no es español avisa pero NO impide darlo de alta', async () => {
    component.nuevo = { ...completo, nif: 'FR40303265045' };

    await component.confirmarNuevo();

    expect(component.avisoNif).toBeTruthy();
    expect(component.nifIncorrecto).toBeFalse();
    expect(suppliersRepoSpy.crearAdHoc).toHaveBeenCalledWith(jasmine.objectContaining({ nif: 'FR40303265045' }));
  });

  // Escribirlo con guiones o espacios NO es un error: se limpia en el propio campo para que se
  // vea lo que se va a guardar.
  it('un NIF correcto escrito con guiones se guarda normalizado', async () => {
    component.nuevo = { ...completo, nif: 'a-86.868 189' };

    await component.confirmarNuevo();

    expect(component.nuevo.nif).toBe('A86868189');
    expect(suppliersRepoSpy.crearAdHoc).toHaveBeenCalledWith(jasmine.objectContaining({ nif: 'A86868189' }));
  });

  it('dos pulsaciones seguidas solo dan de alta una vez', async () => {
    suppliersRepoSpy.crearAdHoc.and.returnValue(
      new Promise(resolve => setTimeout(() => resolve({ id: 9, nif: 'A86868189', nombre: 'Renfe Viajeros' }), 20)));
    component.nuevo = { ...completo, nif: 'A86868189' };

    const primera = component.confirmarNuevo();
    await component.confirmarNuevo();
    await primera;

    expect(suppliersRepoSpy.crearAdHoc).toHaveBeenCalledTimes(1);
    expect(component.guardando).toBeFalse();
  });

  it('corregir el NIF borra el aviso anterior', async () => {
    component.nuevo = { ...completo, nif: 'A86868180' };
    await component.confirmarNuevo();
    expect(component.avisoNif).toBeTruthy();

    component.limpiarAvisoNif();

    expect(component.avisoNif).toBe('');
    expect(component.errorMsg).toBe('');
  });
});
