import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DatosEmisorPage } from './datos-emisor.page';

describe('DatosEmisorPage', () => {
  let component: DatosEmisorPage;
  let fixture: ComponentFixture<DatosEmisorPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DatosEmisorPage, RouterTestingModule],
    });
    fixture = TestBed.createComponent(DatosEmisorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
