import { ENVIRONMENT_INITIALIZER, Provider, inject } from '@angular/core';
import { provideTransloco, Translation, TranslocoLoader, TranslocoService, TRANSLOCO_LOADER } from '@jsverse/transloco';
import { IDIOMAS_SOPORTADOS, IDIOMA_POR_DEFECTO } from '../language.service';

// Loader de prueba: no llama a HttpClient ni a los JSON reales de assets/ — devuelve las
// traducciones que se le pasen (o vacío) de forma síncrona, para no acoplar cada test de
// componente/servicio a una petición HTTP real. Los ficheros reales (es/en/uk.json) se
// verifican aparte, en i18n-keys.spec.ts (comparación de claves) y en las pruebas manuales.
//
// Se registra con { provide: TRANSLOCO_LOADER, useValue: ... } en vez de mediante la opción
// 'loader' de provideTransloco (esa opción exige un Type<TranslocoLoader> — una clase, para que
// Angular la instancie con useClass — no una instancia ya parametrizada como esta).
class TranslocoTestingLoader implements TranslocoLoader {
  constructor(
    private traducciones: Record<string, Translation>,
    private idiomasQueFallan: string[],
  ) {}

  getTranslation(lang: string) {
    if (this.idiomasQueFallan.includes(lang)) {
      return Promise.reject(new Error(`fallo simulado cargando "${lang}" (prueba)`));
    }
    return Promise.resolve(this.traducciones[lang] ?? {});
  }
}

// idiomasQueFallan: idiomas para los que el loader rechaza en vez de resolver — usado para
// probar la tolerancia a fallos de LanguageService reutilizando el mecanismo de fallback REAL de
// TranslocoService (fallbackLang: 'es' configurado abajo), no un fallback inventado a mano en el
// test.
export function provideTranslocoTesting(
  traducciones: Record<string, Translation> = {},
  idiomasQueFallan: string[] = [],
): Provider[] {
  return [
    provideTransloco({
      config: {
        availableLangs: [...IDIOMAS_SOPORTADOS],
        defaultLang: IDIOMA_POR_DEFECTO,
        fallbackLang: IDIOMA_POR_DEFECTO,
        reRenderOnLangChange: true,
        prodMode: true,
      },
    }),
    { provide: TRANSLOCO_LOADER, useValue: new TranslocoTestingLoader(traducciones, idiomasQueFallan) },
    // TranslocoTestingLoader.getTranslation() siempre resuelve de forma asíncrona (Promise),
    // igual que el loader HTTP real — así que un test que llama a translate() sin esperar
    // antes a que termine el .load() del idioma por defecto se encuentra la caché vacía y
    // recibe la clave sin traducir. setTranslation() (a diferencia de load()) escribe en la
    // caché de forma síncrona, y ENVIRONMENT_INITIALIZER se ejecuta en cuanto se crea el
    // injector de pruebas (antes de que se construya ningún componente), así que aquí se deja
    // precargado el idioma por defecto para que cualquier translate() síncrono en un test ya
    // encuentre la traducción — sin tener que tocar cada spec para awaitear el load().
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        if (idiomasQueFallan.includes(IDIOMA_POR_DEFECTO)) return;
        inject(TranslocoService).setTranslation(traducciones[IDIOMA_POR_DEFECTO] ?? {}, IDIOMA_POR_DEFECTO, { emitChange: false });
      },
    },
  ];
}
