import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FacturasRecibidasPage } from './facturas-recibidas.page';

describe('FacturasRecibidasPage', () => {
  let component: FacturasRecibidasPage;
  let fixture: ComponentFixture<FacturasRecibidasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FacturasRecibidasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
