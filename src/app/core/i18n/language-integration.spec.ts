import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './transloco-http-loader';
import { IDIOMAS_SOPORTADOS, IDIOMA_POR_DEFECTO } from './language.service';

// Integración real de extremo a extremo: TranslocoHttpLoader real + HttpClient real +
// los JSON reales servidos por Karma desde src/assets/i18n/ (angular.json expone los
// mismos assets también al builder "test", ver angular.json:106-120) — no un stub. Es el
// sustituto automatizado y repetible de la prueba manual visual (no hay navegador
// interactivo/dispositivo disponible en este entorno de ejecución): demuestra que los 3
// idiomas cargan y resuelven el texto correcto a través de la MISMA cadena que usa la app
// real (loader -> HttpClient -> JSON de assets -> TranslocoService).
describe('Carga real de los 3 idiomas de Perfil (loader + HttpClient + JSON reales)', () => {
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideTransloco({
          config: {
            availableLangs: [...IDIOMAS_SOPORTADOS],
            defaultLang: IDIOMA_POR_DEFECTO,
            fallbackLang: IDIOMA_POR_DEFECTO,
            reRenderOnLangChange: true,
            prodMode: true,
          },
          loader: TranslocoHttpLoader,
        }),
      ],
    });
    transloco = TestBed.inject(TranslocoService);
  });

  it('es: título de Perfil en español', async () => {
    await transloco.load('es').toPromise();
    transloco.setActiveLang('es');
    expect(transloco.translate('perfil.titulo')).toBe('Perfil');
    expect(transloco.translate('perfil.cerrarSesion')).toBe('Cerrar sesión');
  });

  it('en: título de Perfil en inglés', async () => {
    await transloco.load('en').toPromise();
    transloco.setActiveLang('en');
    expect(transloco.translate('perfil.titulo')).toBe('Profile');
    expect(transloco.translate('perfil.cerrarSesion')).toBe('Log out');
  });

  it('uk: título de Perfil en ucraniano', async () => {
    await transloco.load('uk').toPromise();
    transloco.setActiveLang('uk');
    expect(transloco.translate('perfil.titulo')).toBe('Профіль');
    expect(transloco.translate('perfil.cerrarSesion')).toBe('Вийти');
  });

  it('el selector de idioma muestra el nombre de cada idioma en su propio idioma (autónimo), igual en los tres JSON', async () => {
    await Promise.all([transloco.load('es').toPromise(), transloco.load('en').toPromise(), transloco.load('uk').toPromise()]);

    for (const idioma of ['es', 'en', 'uk'] as const) {
      transloco.setActiveLang(idioma);
      expect(transloco.translate('idiomas.es')).toBe('Español');
      expect(transloco.translate('idiomas.en')).toBe('English');
      expect(transloco.translate('idiomas.uk')).toBe('Українська');
    }
  });
});

// Prueba de fallo HTTP REAL (requisito de la corrección Fase 1): TranslocoService y
// TranslocoHttpLoader reales, sin ningún mock que "invente" el comportamiento de fallback — se
// simulan únicamente las respuestas HTTP subyacentes con HttpTestingController, y se comprueba
// el mecanismo de reintento/fallback que Transloco implementa internamente
// (handleFailure/DefaultFallbackStrategy), configurado en esta app con fallbackLang: 'es'.
describe('Tolerancia real a fallo HTTP (TranslocoService + TranslocoHttpLoader reales, HttpTestingController)', () => {
  let transloco: TranslocoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: {
            availableLangs: [...IDIOMAS_SOPORTADOS],
            defaultLang: IDIOMA_POR_DEFECTO,
            fallbackLang: IDIOMA_POR_DEFECTO,
            reRenderOnLangChange: true,
            prodMode: true,
          },
          loader: TranslocoHttpLoader,
        }),
      ],
    });
    transloco = TestBed.inject(TranslocoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // La config de esta app no fija failedRetries (ver main.ts), así que Transloco usa el valor por
  // defecto (2): reintenta la MISMA petición HTTP hasta 3 veces en total (rxjs retry(2)) antes de
  // darla por fallida y pasar a handleFailure()/el idioma de reserva — de ahí que haya que
  // flushear 3 peticiones fallidas por idioma, no solo una, para simular un fallo real.
  const INTENTOS_TOTALES = 1 + 2;

  function flushFalloRepetido(url: string) {
    for (let intento = 0; intento < INTENTOS_TOTALES; intento++) {
      httpMock.expectOne(url).flush('fallo simulado', { status: 500, statusText: 'Server Error' });
    }
  }

  it('si falla la petición HTTP del idioma pedido (en), Transloco reintenta con el fallback real (es) y ese es el contenido que queda cargado', async () => {
    const promesa = firstValueFrom(transloco.load('en'));

    flushFalloRepetido('./assets/i18n/en.json');
    httpMock.expectOne('./assets/i18n/es.json').flush({ perfil: { titulo: 'Perfil' } });

    await promesa;

    expect(transloco.getTranslation('en')).toEqual({});
    const esCargado = transloco.getTranslation('es');
    expect(Object.keys(esCargado).length).toBeGreaterThan(0);
  });

  it('si fallan tanto el idioma pedido (uk) como el fallback real (es), load() rechaza (caso extremo real, sin bucle infinito)', async () => {
    const promesa = firstValueFrom(transloco.load('uk'));

    flushFalloRepetido('./assets/i18n/uk.json');
    flushFalloRepetido('./assets/i18n/es.json');

    await expectAsync(promesa).toBeRejected();
  });
});
