import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

// provideTransloco() NO carga los JSON por sí solo — solo orquesta CUÁNDO pedirlos (idioma
// activo, cambios de idioma, cache). Quien de verdad los trae del servidor/assets es este
// loader, que Transloco invoca vía TRANSLOCO_LOADER. Ruta relativa (./assets/i18n/{lang}.json,
// no /assets/...) a propósito: dentro de Capacitor el origen no es http://localhost sino
// http://localhost/ (Android) o capacitor://localhost (iOS, cuando exista) — una ruta relativa
// resuelve igual de bien en los tres casos (navegador, Android, iOS) sin depender de un host
// fijo. angular.json ya copia src/assets/** a www/assets/**, y capacitor.config.ts (webDir:
// 'www') hace que www/assets/i18n/*.json termine dentro del paquete nativo sin config extra.
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`./assets/i18n/${lang}.json`);
  }
}
