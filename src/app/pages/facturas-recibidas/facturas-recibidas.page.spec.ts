import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FacturasRecibidasPage } from './facturas-recibidas.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';

describe('FacturasRecibidasPage', () => {
  let component: FacturasRecibidasPage;
  let fixture: ComponentFixture<FacturasRecibidasPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(FacturasRecibidasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
