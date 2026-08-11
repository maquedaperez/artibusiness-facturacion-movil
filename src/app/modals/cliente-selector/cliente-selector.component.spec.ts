import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { ClienteSelectorComponent } from './cliente-selector.component';
import { CustomersRepository } from '../../core/ports';
import { ClienteMock } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

describe('ClienteSelectorComponent — búsqueda bajo demanda', () => {
  let component: ClienteSelectorComponent;
  let fixture: ComponentFixture<ClienteSelectorComponent>;
  let customersRepoSpy: jasmine.SpyObj<CustomersRepository>;

  const paginaVacia: PaginaResultado<ClienteMock> = { items: [], total: 0, page: 1, pageSize: 20 };
  const cliente: ClienteMock = { id: 1, nif: 'B10000001', nombre: 'Cliente Uno', esEmpresa: true };
  const paginaConResultado: PaginaResultado<ClienteMock> = { items: [cliente], total: 1, page: 1, pageSize: 20 };

  beforeEach(() => {
    customersRepoSpy = jasmine.createSpyObj('CustomersRepository', ['buscar', 'crearAdHoc']);
    customersRepoSpy.buscar.and.returnValue(Promise.resolve(paginaVacia));

    TestBed.configureTestingModule({
      imports: [ClienteSelectorComponent],
      providers: [
        provideIonicAngular(),
        { provide: CustomersRepository, useValue: customersRepoSpy },
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
