import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http'; // ✅ añadir
import { inject, provideAppInitializer } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { MOCK_REPOSITORY_PROVIDERS } from './app/core/providers/mock.providers';
import { TranslocoHttpLoader } from './app/core/i18n/transloco-http-loader';
import { LanguageService, IDIOMAS_SOPORTADOS, IDIOMA_POR_DEFECTO } from './app/core/i18n/language.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(), // ✅ añadir
    ...MOCK_REPOSITORY_PROVIDERS,
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
    // Resuelve el idioma (preferencia guardada > navigator.language > 'es') y lo aplica ANTES
    // de que Angular renderice el primer componente — provideAppInitializer bloquea el
    // bootstrap hasta que la promesa resuelve, así se evita mostrar un flash de claves de
    // traducción sin resolver o del idioma equivocado mientras se decide cuál tocaba.
    provideAppInitializer(() => inject(LanguageService).inicializar()),
  ],
});
