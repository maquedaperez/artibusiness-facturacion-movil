import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideIonicAngular, ModalController } from '@ionic/angular/standalone';
import { SuscripcionSelectorComponent } from './suscripcion-selector.component';
import { SubscriptionsRepository } from '../../core/ports';
import { Suscripcion } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

describe('SuscripcionSelectorComponent — búsqueda bajo demanda', () => {
  let component: SuscripcionSelectorComponent;
  let fixture: ComponentFixture<SuscripcionSelectorComponent>;
  let subscriptionsRepoSpy: jasmine.SpyObj<SubscriptionsRepository>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  const suscripcionActiva: Suscripcion = { id: 1, nombre: 'Soporte premium', periodicidad: 'Mensual', precio: 150, ivaPct: 21, estado: 'activa' };
  const suscripcionPausada: Suscripcion = { id: 2, nombre: 'Licencia anual', periodicidad: 'Anual', precio: 600, ivaPct: 21, estado: 'pausada' };
  const paginaVacia: PaginaResultado<Suscripcion> = { items: [], total: 0, page: 1, pageSize: 20 };

  beforeEach(() => {
    subscriptionsRepoSpy = jasmine.createSpyObj('SubscriptionsRepository', ['buscar']);
    subscriptionsRepoSpy.buscar.and.returnValue(Promise.resolve(paginaVacia));
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['dismiss']);

    TestBed.configureTestingModule({
      imports: [SuscripcionSelectorComponent],
      providers: [
        provideIonicAngular(),
        { provide: SubscriptionsRepository, useValue: subscriptionsRepoSpy },
        { provide: ModalController, useValue: modalCtrlSpy },
      ],
    });
    fixture = TestBed.createComponent(SuscripcionSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('no hace ninguna búsqueda al abrir el selector', () => {
    expect(subscriptionsRepoSpy.buscar).not.toHaveBeenCalled();
    expect(component.estado).toBe('inicial');
  });

  it('encuentra suscripciones tras el debounce', fakeAsync(() => {
    subscriptionsRepoSpy.buscar.and.returnValue(
      Promise.resolve({ items: [suscripcionActiva, suscripcionPausada], total: 2, page: 1, pageSize: 20 })
    );
    component.query = 'soporte';
    component.onQueryChange();
    tick(400);

    expect(component.resultados.length).toBe(2);
  }));

  it('seleccionar una suscripción activa cierra el modal con esos datos', () => {
    component.seleccionar(suscripcionActiva);
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(suscripcionActiva, 'confirm');
  });

  it('no permite seleccionar una suscripción pausada/cancelada', () => {
    component.seleccionar(suscripcionPausada);
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  });
});
