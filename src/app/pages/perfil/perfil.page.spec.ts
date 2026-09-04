import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerfilPage } from './perfil.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { LanguageService } from '../../core/i18n/language.service';
import { PagosService, EstadoPagos } from '../../services/pagos.service';
import { PagosConnectService, EstadoPagosConnect } from '../../services/pagos-connect.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';
import { VERSION_APP } from '../../../environments/version';

describe('PerfilPage', () => {
  let component: PerfilPage;
  let fixture: ComponentFixture<PerfilPage>;
  let languageService: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...MOCK_REPOSITORY_PROVIDERS,
        ...provideTranslocoTesting({
          es: { profile: { title: 'Perfil', language: 'Idioma' }, common: { languages: { es: 'Español', en: 'English', uk: 'Українська' } } },
        }),
      ],
    });
    // LanguageService.cambiarIdioma() de verdad llama a Preferences.set (Proxy de Capacitor,
    // ver language.service.spec.ts) — aquí solo interesa comprobar que Perfil delega en el
    // servicio, no repetir la cobertura de persistencia, que ya vive en el propio servicio.
    languageService = TestBed.inject(LanguageService);
    spyOn(languageService, 'cambiarIdioma').and.resolveTo();

    fixture = TestBed.createComponent(PerfilPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('expone los 3 idiomas soportados para el selector', () => {
    expect(component.idiomasSoportados).toEqual(['es', 'en', 'uk']);
  });

  it('cambiarIdioma() delega en LanguageService', async () => {
    await component.cambiarIdioma('en');
    expect(languageService.cambiarIdioma).toHaveBeenCalledWith('en');
  });

  // Cumplimiento App Store (guideline 3.1.1, "no external purchase links", pedido explícito
  // 2026-08-28 antes de reenviar la app a revisión): una empresa con créditos ilimitados
  // (demo) no debe ver ningún enlace/botón hacia el portal de pagos externo (Stripe) — ni
  // siquiera deshabilitado, el elemento no debe existir en el DOM.
  describe('botón "conseguir más créditos" (portal de pagos externo)', () => {
    async function cargarConEstado(estado: EstadoPagos) {
      const pagosService = TestBed.inject(PagosService);
      spyOn(pagosService, 'obtenerEstado').and.resolveTo(estado);
      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('empresa con créditos ilimitados: el botón no existe en el DOM', async () => {
      await cargarConEstado({ saldoCreditos: 0, esIlimitado: true, suscripcion: null });

      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conseguir-creditos"]');
      expect(boton).toBeNull();
    });

    it('empresa con créditos limitados: el botón sí aparece', async () => {
      await cargarConEstado({ saldoCreditos: 42, esIlimitado: false, suscripcion: null });

      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conseguir-creditos"]');
      expect(boton).not.toBeNull();
    });

    // Más conservador que arriesgarse a mostrarlo de más: mientras no se sabe con certeza
    // que la empresa NO es ilimitada (cargando, o si la llamada al backend falla), el botón
    // tampoco se muestra.
    it('mientras se desconoce el estado (todavía cargando), el botón tampoco aparece', () => {
      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conseguir-creditos"]');
      expect(boton).toBeNull();
    });
  });

  // Stripe Connect (Fase 3, 2026-09-02): mientras StripeConnect:Enabled=false (todo el MVP),
  // GET /api/PagosConnect/estado da 503 — la sección entera debe permanecer OCULTA, nunca
  // aparecer como un botón deshabilitado o un mensaje de error. Cubre ambos estados.
  describe('sección "cobro con tarjeta" (Stripe Connect)', () => {
    async function cargarConEstadoConnect(estado: EstadoPagosConnect | 'error') {
      const pagosConnectService = TestBed.inject(PagosConnectService);
      if (estado === 'error') {
        spyOn(pagosConnectService, 'obtenerEstado').and.rejectWith(new Error('503'));
      } else {
        spyOn(pagosConnectService, 'obtenerEstado').and.resolveTo(estado);
      }
      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('mientras se desconoce el estado (todavía cargando), la sección no aparece', () => {
      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conectar-stripe"]');
      expect(boton).toBeNull();
    });

    it('con el módulo desactivado (503), la sección entera permanece oculta', async () => {
      await cargarConEstadoConnect('error');

      expect(component.moduloConnectDisponible).toBeFalse();
      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conectar-stripe"]');
      expect(boton).toBeNull();
    });

    it('con el módulo activo y la cuenta ya lista para cobrar, no se muestra el botón de conectar', async () => {
      await cargarConEstadoConnect({ conectado: true, estado: 'Conectado', chargesEnabled: true, detailsSubmitted: true });

      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conectar-stripe"]');
      expect(boton).toBeNull();
    });

    it('con el módulo activo y sin conectar todavía, aparece el botón de conectar', async () => {
      await cargarConEstadoConnect({ conectado: false, estado: null, chargesEnabled: false, detailsSubmitted: false });

      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conectar-stripe"]');
      expect(boton).not.toBeNull();
    });

    it('con el módulo activo y la conexión pendiente de completar, aparece el botón de continuar', async () => {
      await cargarConEstadoConnect({ conectado: true, estado: 'Pendiente', chargesEnabled: false, detailsSubmitted: false });

      const boton = fixture.nativeElement.querySelector('[data-testid="boton-conectar-stripe"]');
      expect(boton).not.toBeNull();
    });

    it('conectarStripe() llama al onboarding y abre la URL devuelta', async () => {
      const pagosConnectService = TestBed.inject(PagosConnectService);
      spyOn(pagosConnectService, 'iniciarOnboarding').and.resolveTo('https://connect.stripe.com/setup/abc');
      const abrirSpy = spyOn(pagosConnectService, 'abrirOnboarding');

      await component.conectarStripe();

      expect(abrirSpy).toHaveBeenCalledWith('https://connect.stripe.com/setup/abc');
    });
  });

  // Version de la app (2026-09-04, peticion de Jose): poder mirar el Perfil y saber que version
  // tiene instalada cada uno, sin depender de los numeros de App Store ni Google Play.
  describe('version de la app', () => {
    it('expone la version sellada en el build', () => {
      expect(component.versionApp).toBe(VERSION_APP);
    });

    // Lo que de verdad importa: que sea una FECHA. Si alguien rompe el generador y deja una
    // cadena vacia o un marcador de plantilla, el Perfil enseñaria una version que no dice nada
    // — y una version que miente es peor que no tener ninguna.
    it('tiene formato AAAA.MM.DD, con un sufijo opcional', () => {
      expect(component.versionApp).toMatch(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/);
    });
  });
});
