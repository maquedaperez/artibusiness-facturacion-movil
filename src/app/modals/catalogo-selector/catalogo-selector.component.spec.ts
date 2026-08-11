import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { CatalogoSelectorComponent } from './catalogo-selector.component';
import { CatalogRepository } from '../../core/ports';
import { ProductoCatalogo } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

describe('CatalogoSelectorComponent — búsqueda bajo demanda', () => {
  let component: CatalogoSelectorComponent;
  let fixture: ComponentFixture<CatalogoSelectorComponent>;
  let catalogRepoSpy: jasmine.SpyObj<CatalogRepository>;

  const producto: ProductoCatalogo = { id: 1, nombre: 'Revisión anual', precioUnitario: 1200, ivaPct: 21, referencia: 'SRV-001' };
  const paginaConResultado: PaginaResultado<ProductoCatalogo> = { items: [producto], total: 1, page: 1, pageSize: 20 };
  const paginaVacia: PaginaResultado<ProductoCatalogo> = { items: [], total: 0, page: 1, pageSize: 20 };

  beforeEach(() => {
    catalogRepoSpy = jasmine.createSpyObj('CatalogRepository', ['buscar']);
    catalogRepoSpy.buscar.and.returnValue(Promise.resolve(paginaVacia));

    TestBed.configureTestingModule({
      imports: [CatalogoSelectorComponent],
      providers: [
        provideIonicAngular(),
        { provide: CatalogRepository, useValue: catalogRepoSpy },
      ],
    });
    fixture = TestBed.createComponent(CatalogoSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('no hace ninguna búsqueda al abrir el selector', () => {
    expect(catalogRepoSpy.buscar).not.toHaveBeenCalled();
    expect(component.estado).toBe('inicial');
  });

  it('encuentra un producto tras el debounce y lo puede seleccionar', fakeAsync(() => {
    catalogRepoSpy.buscar.and.returnValue(Promise.resolve(paginaConResultado));

    component.query = 'revisión';
    component.onQueryChange();
    tick(400);

    expect(component.resultados).toEqual([producto]);
    expect(component.estado).toBe('ok');
  }));
});
