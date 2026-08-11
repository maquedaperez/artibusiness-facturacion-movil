import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http'; // ✅ añadir

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { MOCK_REPOSITORY_PROVIDERS } from './app/core/providers/mock.providers';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(), // ✅ añadir
    ...MOCK_REPOSITORY_PROVIDERS,
  ],
});
