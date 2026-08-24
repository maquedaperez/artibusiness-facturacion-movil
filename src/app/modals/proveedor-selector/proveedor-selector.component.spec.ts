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
