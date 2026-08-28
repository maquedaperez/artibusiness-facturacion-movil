import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerfilPage } from './perfil.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { LanguageService } from '../../core/i18n/language.service';
import { PagosService, EstadoPagos } from '../../services/pagos.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

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
});
