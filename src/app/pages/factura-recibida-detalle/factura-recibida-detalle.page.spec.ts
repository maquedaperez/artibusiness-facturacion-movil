import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ModalController, provideIonicAngular } from '@ionic/angular/standalone';
import { FacturaRecibidaDetallePage } from './factura-recibida-detalle.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { ApiService } from '../../services/api.service';

describe('FacturaRecibidaDetallePage', () => {
  let component: FacturaRecibidaDetallePage;
  let fixture: ComponentFixture<FacturaRecibidaDetallePage>;

  beforeEach(async () => {
    // ReceivedInvoicesRepository resuelve al adaptador HTTP real: obtenerPorId() sin esto
    // llamaría de verdad a GET api/FacturasRecibidas/{id} contra el servidor de Karma.
    const apiStub: Partial<ApiService> = { get: jasmine.createSpy().and.rejectWith(new Error('HTTP 404')) };
    TestBed.configureTestingModule({
      imports: [FacturaRecibidaDetallePage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS, provideIonicAngular(), { provide: ApiService, useValue: apiStub }],
    });
    fixture = TestBed.createComponent(FacturaRecibidaDetallePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // ngOnInit ahora es async (obtenerPorId habla con el repositorio real en producción).
    await fixture.whenStable();
  });

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
