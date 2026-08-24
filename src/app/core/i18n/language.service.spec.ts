import { TestBed } from '@angular/core/testing';
import { from } from 'rxjs';
import { LanguageService } from './language.service';
import { provideTranslocoTesting } from './testing/transloco-testing.providers';

// Preferences (@capacitor/preferences) es un Proxy dinámico (registerPlugin() de
// @capacitor/core) — spyOn(Preferences, 'get'/'set') no lo intercepta de forma fiable. Se espían
// en su lugar los métodos propios de LanguageService que lo envuelven (leerPreferenciaGuardada/
// obtenerPreferenciaCruda/guardarPreferencia/establecerPreferenciaCruda/idiomaDelNavegador) — ver
// el comentario en language.service.ts.
describe('LanguageService', () => {
  let service: LanguageService;

  function configurar(traducciones: Record<string, unknown> = {}, idiomasQueFallan: string[] = []) {
    TestBed.configureTestingModule({
      providers: [...provideTranslocoTesting(traducciones as any, idiomasQueFallan)],
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
    // Contenido no vacío para 'uk': con la comprobación de "idioma realmente cargado" (Fase 1,
    // corrección), un getTranslation('uk') vacío se interpretaría como que la carga cayó al
    // fallback español, no como que 'uk' cargó de verdad.
    beforeEach(() => configurar({ uk: { perfil: { titulo: 'Профіль' } } }));

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
    // Contenido no vacío para 'en'/'uk': mismo motivo que en el describe anterior — sin contenido
    // real, idiomaRealmenteCargado() los trataría como "no cargaron" y caería a español.
    beforeEach(() => configurar({ en: { perfil: { titulo: 'Profile' } }, uk: { perfil: { titulo: 'Профіль' } } }));

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

  describe('tolerancia a fallos — Preferences.get()/set() (Fase 1, corrección)', () => {
    // Contenido no vacío para 'en': si getTranslation('en') devolviera {} tras la carga,
    // idiomaRealmenteCargado() lo interpretaría como "no cargó de verdad" y caería a español —
    // aquí se quiere aislar la tolerancia a fallos de Preferences, no la de la carga del JSON.
    beforeEach(() => configurar({ en: { perfil: { titulo: 'Profile' } } }));

    it('si Preferences.get() rechaza, inicializar() no lanza y arranca igual (usa navigator.language)', async () => {
      spyOn<any>(service, 'obtenerPreferenciaCruda').and.rejectWith(new Error('fallo nativo simulado'));
      spyOn<any>(service, 'idiomaDelNavegador').and.returnValue('en-GB');

      await expectAsync(service.inicializar()).toBeResolved();

      expect(service.idiomaActual).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('sin preferencia guardada y dispositivo en inglés, inicializar() termina en inglés', async () => {
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo(null);
      spyOn<any>(service, 'idiomaDelNavegador').and.returnValue('en-US');

      await service.inicializar();

      expect(service.idiomaActual).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('si Preferences.set() rechaza, cambiarIdioma() no lanza, no revierte el cambio y no deja una excepción sin manejar', async () => {
      spyOn<any>(service, 'establecerPreferenciaCruda').and.rejectWith(new Error('fallo nativo simulado'));

      await expectAsync(service.cambiarIdioma('en')).toBeResolved();

      expect(service.idiomaActual).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });
  });

  describe('tolerancia a fallos — carga de traducción (Fase 1, corrección)', () => {
    it('si falla uk.json pero es.json carga bien, inicializar() termina en español (idioma efectivo, no el pedido)', async () => {
      configurar({ es: { perfil: { titulo: 'Perfil' } } }, ['uk']);
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('uk');

      await service.inicializar();

      expect(service.idiomaActual).toBe('es');
      expect(document.documentElement.lang).toBe('es');
    });

    it('si falla en.json pero es.json carga bien, inicializar() termina en español (idioma efectivo, no el pedido)', async () => {
      configurar({ es: { perfil: { titulo: 'Perfil' } } }, ['en']);
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('en');

      await service.inicializar();

      expect(service.idiomaActual).toBe('es');
      expect(document.documentElement.lang).toBe('es');
    });

    it('si fallan tanto el idioma pedido como español (fallback), inicializar() no rechaza y se queda en español como idioma lógico', async () => {
      configurar({}, ['en', 'es']);
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('en');

      await expectAsync(service.inicializar()).toBeResolved();

      expect(service.idiomaActual).toBe('es');
      expect(document.documentElement.lang).toBe('es');
    });

    it('cambiarIdioma() a un idioma cuyo JSON falla no persiste ese idioma, sino el efectivo (español)', async () => {
      configurar({ es: { perfil: { titulo: 'Perfil' } } }, ['uk']);
      const guardar = spyOn<any>(service, 'guardarPreferencia').and.resolveTo();

      await service.cambiarIdioma('uk');

      expect(guardar).toHaveBeenCalledWith('es');
      expect(service.idiomaActual).toBe('es');
      expect(document.documentElement.lang).toBe('es');
    });

    it('inicializar() no resuelve antes de que termine la carga de la traducción (no hay hueco async)', async () => {
      let resolverCarga!: (t: unknown) => void;
      const cargaLenta = new Promise(resolve => { resolverCarga = resolve; });

      configurar({ en: { perfil: { titulo: 'Profile' } } });
      spyOn<any>(service, 'leerPreferenciaGuardada').and.resolveTo('en');
      // Se sustituye la carga real por una Observable respaldada por una promesa controlada a
      // mano (rxjs from()), para poder demostrar que inicializar() sigue "colgado" mientras el
      // loader no ha terminado — sin reinventar el contrato de suscripción de Observable a mano.
      spyOn((service as any).transloco, 'load').and.returnValue(from(cargaLenta));
      spyOn((service as any).transloco, 'getTranslation').and.returnValue({ perfil: { titulo: 'Profile' } });

      let terminado = false;
      const promesaInicializar = service.inicializar().then(() => { terminado = true; });

      await Promise.resolve();
      await Promise.resolve();
      expect(terminado).toBeFalse();

      resolverCarga({ perfil: { titulo: 'Profile' } });
      await promesaInicializar;
      expect(terminado).toBeTrue();
      expect(service.idiomaActual).toBe('en');
    });
  });

  describe('idiomasSoportados', () => {
    beforeEach(configurar);

    it('expone exactamente es/en/uk, en ese orden', () => {
      expect(service.idiomasSoportados).toEqual(['es', 'en', 'uk']);
    });
  });
});
