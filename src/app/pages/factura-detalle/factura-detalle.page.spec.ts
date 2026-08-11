import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FacturaDetallePage } from './factura-detalle.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';

describe('FacturaDetallePage', () => {
  let component: FacturaDetallePage;
  let fixture: ComponentFixture<FacturaDetallePage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FacturaDetallePage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(FacturaDetallePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
