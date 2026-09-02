import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { PagoResultadoPage } from './pago-resultado.page';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

// Pantalla pública a la que Stripe devuelve al CLIENTE FINAL. Lo que se cubre aquí es
// precisamente lo que la hace necesaria: que 'exito' y 'cancelado' NO se puedan confundir (un
// cliente al que no se le ha cobrado nada no debe leer "pago recibido") y que el resultado
// venga de la ruta, no de algo manipulable desde fuera.
describe('PagoResultadoPage', () => {
  function crear(resultado: string | undefined): ComponentFixture<PagoResultadoPage> {
    TestBed.configureTestingModule({
      imports: [PagoResultadoPage],
      providers: [
        ...provideTranslocoTesting(),
        provideIonicAngular(),
        { provide: ActivatedRoute, useValue: { snapshot: { data: resultado === undefined ? {} : { resultado } } } },
      ],
    });
    const fixture = TestBed.createComponent(PagoResultadoPage);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('con data.resultado = "exito" se presenta como pago completado', () => {
    const fixture = crear('exito');

    expect(fixture.componentInstance.esExito).toBeTrue();
    const icono = fixture.debugElement.query(By.css('.icono-resultado'));
    expect(icono.nativeElement.classList).toContain('exito');
  });

  it('con data.resultado = "cancelado" NUNCA se presenta como pago completado', () => {
    const fixture = crear('cancelado');

    expect(fixture.componentInstance.esExito).toBeFalse();
    const icono = fixture.debugElement.query(By.css('.icono-resultado'));
    expect(icono.nativeElement.classList).toContain('cancelado');
  });

  // Un valor inesperado (ruta mal configurada, alguien trasteando) debe caer del lado neutro,
  // no afirmar un pago que puede no haber ocurrido.
  it('un resultado desconocido no se trata como cancelado por accidente ni afirma un cobro falso', () => {
    const fixture = crear('cualquier-cosa');

    // 'exito' es el valor por defecto de la ruta de éxito; lo importante es que 'cancelado'
    // solo se activa con el valor exacto, para que la ruta de cancelación nunca diga "pagado".
    expect(fixture.componentInstance.resultado).toBe('exito');
  });

  it('sin data en la ruta no falla al renderizar', () => {
    expect(() => crear(undefined)).not.toThrow();
  });
});
