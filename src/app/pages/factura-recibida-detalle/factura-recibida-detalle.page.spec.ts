import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FacturaRecibidaDetallePage } from './factura-recibida-detalle.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';

describe('FacturaRecibidaDetallePage', () => {
  let component: FacturaRecibidaDetallePage;
  let fixture: ComponentFixture<FacturaRecibidaDetallePage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FacturaRecibidaDetallePage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(FacturaRecibidaDetallePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
