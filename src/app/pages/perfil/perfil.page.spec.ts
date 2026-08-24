import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerfilPage } from './perfil.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { LanguageService } from '../../core/i18n/language.service';
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
          es: { perfil: { titulo: 'Perfil', idioma: 'Idioma' }, idiomas: { es: 'Español', en: 'English', uk: 'Українська' } },
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
});
