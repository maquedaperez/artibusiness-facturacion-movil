import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
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
