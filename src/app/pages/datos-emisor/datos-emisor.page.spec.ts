import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DatosEmisorPage } from './datos-emisor.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { EmisorRepository } from '../../core/ports';
import { EmisorFiscal } from '../../services/mock-facturas.service';

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
});

describe('DatosEmisorPage — guardado limitado a datos de contacto', () => {
  let component: DatosEmisorPage;
  let fixture: ComponentFixture<DatosEmisorPage>;
  let emisorRepoSpy: jasmine.SpyObj<EmisorRepository>;

  const emisorOriginal: EmisorFiscal = {
    esEmpresa: true, nombre: 'Empresa Original SL', nif: 'B11111111',
    direccion: 'Calle Vieja 1', poblacion: 'Madrid', cp: '28001', provincia: 'Madrid',
    telefono: '600111222', registroMercantil: '', cnae: '', iban: '', swift: '',
  };

  beforeEach(() => {
    emisorRepoSpy = jasmine.createSpyObj('EmisorRepository', ['getEmisor', 'actualizarEmisor']);
    emisorRepoSpy.getEmisor.and.returnValue({ ...emisorOriginal });

    TestBed.configureTestingModule({
      imports: [DatosEmisorPage, RouterTestingModule],
      providers: [
        ...MOCK_REPOSITORY_PROVIDERS,
        { provide: EmisorRepository, useValue: emisorRepoSpy },
      ],
    });
    fixture = TestBed.createComponent(DatosEmisorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('nunca envía nombre ni NIF/CIF, aunque se intenten cambiar en memoria', async () => {
    component.emisor.nombre = 'Intento de cambio de nombre';
    component.emisor.nif = 'X00000000';
    component.emisor.esEmpresa = false;
    component.emisor.direccion = 'Calle Nueva 5';
    component.emisor.telefono = '600 111 222';

    await component.guardar();

    expect(emisorRepoSpy.actualizarEmisor).toHaveBeenCalledTimes(1);
    const payload = emisorRepoSpy.actualizarEmisor.calls.mostRecent().args[0];

    expect(Object.keys(payload).sort()).toEqual(['cp', 'direccion', 'poblacion', 'provincia', 'telefono']);
    expect(payload).toEqual({
      direccion: 'Calle Nueva 5',
      poblacion: emisorOriginal.poblacion,
      cp: emisorOriginal.cp,
      provincia: emisorOriginal.provincia,
      telefono: '600 111 222',
    });
  });

  it('acepta formatos de teléfono internacionales legítimos', async () => {
    component.emisor.telefono = '+34 600 111 222';
    await component.guardar();
    expect(emisorRepoSpy.actualizarEmisor).toHaveBeenCalled();
    expect(component.errorMsg).toBe('');
  });

  it('el teléfono es opcional — no bloquea el guardado si va vacío', async () => {
    component.emisor.telefono = '';
    await component.guardar();
    expect(emisorRepoSpy.actualizarEmisor).toHaveBeenCalled();
    expect(component.errorMsg).toBe('');
  });

  it('rechaza un teléfono con formato claramente inválido y no llama al repositorio', async () => {
    component.emisor.telefono = 'no-es-un-telefono';
    await component.guardar();
    expect(emisorRepoSpy.actualizarEmisor).not.toHaveBeenCalled();
    expect(component.errorMsg).toContain('teléfono');
  });

  it('exige dirección, población, CP y provincia', async () => {
    component.emisor.direccion = '';
    await component.guardar();
    expect(emisorRepoSpy.actualizarEmisor).not.toHaveBeenCalled();
    expect(component.errorMsg).toBeTruthy();
  });
});
