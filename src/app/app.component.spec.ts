import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { provideTranslocoTesting } from './core/i18n/testing/transloco-testing.providers';
import { configurarTraductorDeErrores, mensajeDeError } from './shared/utils/mensaje-de-error';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), ...provideTranslocoTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    configurarTraductorDeErrores(null);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // Aquí es donde se registra, una sola vez, el traductor que usa mensajeDeError para no
  // enseñarle a nadie el nombre de un cerrojo de SQL Server (ver mensaje-de-error.ts).
  it('deja los mensajes internos del backend traducidos para toda la app', () => {
    TestBed.createComponent(AppComponent);
    const error = new Error(
      "No se pudo obtener el bloqueo 'contabilizar-emitida-83036' para la empresa 5 (sp_getapplock devolvió -1).");

    const mensaje = mensajeDeError(error, 'respaldo de la pantalla');

    expect(mensaje).not.toContain('sp_getapplock');
    expect(mensaje).not.toBe('respaldo de la pantalla');
  });
});
