import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FacturasEmitidasPage } from './facturas-emitidas.page';

describe('FacturasEmitidasPage', () => {
  let component: FacturasEmitidasPage;
  let fixture: ComponentFixture<FacturasEmitidasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FacturasEmitidasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
