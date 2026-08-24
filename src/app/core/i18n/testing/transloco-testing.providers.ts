import { Provider } from '@angular/core';
import { provideTransloco, Translation, TranslocoLoader, TRANSLOCO_LOADER } from '@jsverse/transloco';
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
  constructor(private traducciones: Record<string, Translation>) {}

  getTranslation(lang: string) {
    return Promise.resolve(this.traducciones[lang] ?? {});
  }
}

export function provideTranslocoTesting(traducciones: Record<string, Translation> = {}): Provider[] {
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
    { provide: TRANSLOCO_LOADER, useValue: new TranslocoTestingLoader(traducciones) },
  ];
}
