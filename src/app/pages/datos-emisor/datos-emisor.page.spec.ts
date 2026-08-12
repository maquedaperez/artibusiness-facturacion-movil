import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DatosEmisorPage } from './datos-emisor.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { EmisorRepository } from '../../core/ports';

describe('DatosEmisorPage', () => {
  let component: DatosEmisorPage;
  let fixture: ComponentFixture<DatosEmisorPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DatosEmisorPage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(DatosEmisorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('carga los datos fiscales del emisor de solo lectura, sin ningún método de escritura disponible', () => {
    const repo = TestBed.inject(EmisorRepository);
    expect(component.emisor).toEqual(repo.getEmisor());
    // EmisorRepository solo declara getEmisor() — no hay ningún método de
    // actualización que un test (ni la UI) pueda llamar, por diseño.
    expect((repo as any).actualizarEmisor).toBeUndefined();
  });
});
