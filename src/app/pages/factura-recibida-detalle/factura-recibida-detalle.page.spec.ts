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

  // idProveedor solo puede ser un id real del backend — crearAdHoc (el modo "Proveedor
  // nuevo" del selector) sigue delegando en el mock porque Proveedores/Crear no existe
  // todavía, así que su id es local y NUNCA debe tratarse como si fuera real. El selector
  // distingue el origen con el role del modal ('confirm' = búsqueda real, 'confirm-nuevo'
  // = creado al vuelo).
  it('guarda idProveedor cuando el proveedor viene de una búsqueda real (role "confirm")', async () => {
    const modalCtrl = TestBed.inject(ModalController);
    spyOn(modalCtrl, 'create').and.resolveTo({
      present: async () => {},
      onWillDismiss: async () => ({ data: { nombre: 'Iberdrola', nif: 'A95758389', id: 42 }, role: 'confirm' }),
    } as any);

    await component.elegirProveedor();

    expect(component.working.proveedor).toBe('Iberdrola');
    expect(component.working.idProveedor).toBe(42);
  });

  it('NO guarda idProveedor cuando el proveedor se creó al vuelo (role "confirm-nuevo", id local)', async () => {
    const modalCtrl = TestBed.inject(ModalController);
    spyOn(modalCtrl, 'create').and.resolveTo({
      present: async () => {},
      onWillDismiss: async () => ({ data: { nombre: 'Proveedor Nuevo SL', nif: 'B00000000', id: 105 }, role: 'confirm-nuevo' }),
    } as any);

    await component.elegirProveedor();

    expect(component.working.proveedor).toBe('Proveedor Nuevo SL');
    expect(component.working.idProveedor).toBeUndefined();
  });
});
