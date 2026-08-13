import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
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
});
