import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';
import { provideTranslocoTesting } from './testing/transloco-testing.providers';

// Preferences (@capacitor/preferences) es un Proxy dinámico (registerPlugin() de
// @capacitor/core) — spyOn(Preferences, 'get'/'set') no lo intercepta de forma fiable. Se espían
// en su lugar los métodos propios de LanguageService que lo envuelven (leerPreferenciaGuardada/
// guardarPreferencia/idiomaDelNavegador) — ver el comentario en language.service.ts.
describe('LanguageService', () => {
  let service: LanguageService;

  function configurar() {
    TestBed.configureTestingModule({
      providers: [...provideTranslocoTesting()],
    });
    service = TestBed.inject(LanguageService);
  }

  afterEach(() => {
    // document.documentElement.lang es estado global del DOM — se limpia entre tests para que
    // uno no deje contaminado el idioma que lee el siguiente.
    document.documentElement.lang = '';
  });

  describe('normalizar()', () => {
    beforeEach(configurar);

    it('es-ES -> es', () => {
      expect(service.normalizar('es-ES')).toBe('es');
    });

    it('en-US -> en', () => {
      expect(service.normalizar('en-US')).toBe('en');
    });

    it('en-GB -> en', () => {
      expect(service.normalizar('en-GB')).toBe('en');
    });

    it('uk-UA -> uk', () => {
      expect(service.normalizar('uk-UA')).toBe('uk');
    });

    it('fr-FR (idioma no soportado) -> es (fallback)', () => {
      expect(service.normalizar('fr-FR')).toBe('es');
    });

    it('valor vacío/nulo -> es (fallback)', () => {
      expect(service.normalizar(null)).toBe('es');
      expect(service.normalizar(undefined)).toBe('es');
      expect(service.normalizar('')).toBe('es');
    });

    it('es case-insensitive (EN-us -> en)', () => {
      expect(service.normalizar('EN-us')).toBe('en');
    });
  });

  describe('resolverIdiomaInicial() — la preferencia guardada tiene prioridad sobre navigator.language', () => {
    beforeEach(configurar);

    it('sin preferencia guardada, usa navigator.language normalizado', async () => {
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo(null);
      spyOn<any>(service, 'idiomaDelNavegador').and.returnValue('uk-UA');

      const idioma = await service.resolverIdiomaInicial();

      expect(idioma).toBe('uk');
    });

    it('con preferencia guardada, la preferencia gana aunque navigator.language sea otro idioma soportado', async () => {
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('en');
      spyOn<any>(service, 'idiomaDelNavegador').and.returnValue('uk-UA');

      const idioma = await service.resolverIdiomaInicial();

      expect(idioma).toBe('en');
    });

    it('preferencia guardada con un valor corrupto/no soportado cae a navigator.language', async () => {
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('fr');
      spyOn<any>(service, 'idiomaDelNavegador').and.returnValue('en-GB');

      const idioma = await service.resolverIdiomaInicial();

      expect(idioma).toBe('en');
    });

    it('sin preferencia y navigator.language no soportado, cae a español', async () => {
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo(null);
      spyOn<any>(service, 'idiomaDelNavegador').and.returnValue('de-DE');

      const idioma = await service.resolverIdiomaInicial();

      expect(idioma).toBe('es');
    });
  });

  describe('inicializar() — sin idioma incorrecto intermedio', () => {
    beforeEach(configurar);

    it('al resolver, el idioma activo de Transloco y document.documentElement.lang ya están en el valor final (no en el default de arranque)', async () => {
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('uk');

      await service.inicializar();

      // Si inicializar() dejara una rendija async entre resolver el idioma y aplicarlo, aquí
      // se vería todavía 'es' (el defaultLang de arranque) en vez de 'uk' — el hecho de que
      // esta aserción se cumpla justo después del await demuestra que no hay ese hueco.
      expect(service.idiomaActual).toBe('uk');
      expect(document.documentElement.lang).toBe('uk');
    });
  });

  describe('cambiarIdioma() — cambio dinámico', () => {
    beforeEach(configurar);

    it('persiste la preferencia, cambia el idioma activo de Transloco y actualiza <html lang>', async () => {
      const guardar = spyOn<any>(service, 'guardarPreferencia').and.resolveTo();

      await service.cambiarIdioma('en');

      expect(guardar).toHaveBeenCalledWith('en');
      expect(service.idiomaActual).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('un segundo cambio en caliente se aplica igual, sin recargar', async () => {
      spyOn<any>(service, 'guardarPreferencia').and.resolveTo();

      await service.cambiarIdioma('en');
      await service.cambiarIdioma('uk');

      expect(service.idiomaActual).toBe('uk');
      expect(document.documentElement.lang).toBe('uk');
    });
  });

  describe('idiomasSoportados', () => {
    beforeEach(configurar);

    it('expone exactamente es/en/uk, en ese orden', () => {
      expect(service.idiomasSoportados).toEqual(['es', 'en', 'uk']);
    });
  });
});
