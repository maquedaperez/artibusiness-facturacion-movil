import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Preferences } from '@capacitor/preferences';

export type IdiomaSoportado = 'es' | 'en' | 'uk';

export const IDIOMAS_SOPORTADOS: readonly IdiomaSoportado[] = ['es', 'en', 'uk'];
export const IDIOMA_POR_DEFECTO: IdiomaSoportado = 'es';

// Misma clave que ya usa Preferences en el resto de la app (auth.service.ts: 'manual_logout',
// 'saved_password') — mismo mecanismo (UserDefaults/SharedPreferences nativos vía Capacitor),
// no localStorage: en iOS localStorage puede vaciarse solo bajo presión de memoria del WebView,
// Preferences no.
const CLAVE_PREFERENCIA_IDIOMA = 'idioma_app';

// Único punto de la app que decide "qué idioma toca mostrar" — Perfil (y cualquier pantalla
// futura) llama a cambiarIdioma(), nunca toca Preferences ni TranslocoService directamente.
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private transloco = inject(TranslocoService);

  get idiomasSoportados(): readonly IdiomaSoportado[] {
    return IDIOMAS_SOPORTADOS;
  }

  get idiomaActual(): IdiomaSoportado {
    return this.normalizar(this.transloco.getActiveLang());
  }

  // es-ES/es-419 -> es | en-US/en-GB -> en | uk-UA -> uk | cualquier otro (fr-FR, de-DE...) -> es.
  // Se queda solo con el prefijo antes del guion — mismo criterio que ya usa esta app para NIFs
  // (normalizar antes de comparar), no una lista cerrada de códigos regionales completos.
  normalizar(codigo: string | null | undefined): IdiomaSoportado {
    const base = (codigo ?? '').trim().toLowerCase().split('-')[0];
    return (IDIOMAS_SOPORTADOS as string[]).includes(base) ? (base as IdiomaSoportado) : IDIOMA_POR_DEFECTO;
  }

  // La preferencia guardada SIEMPRE gana sobre navigator.language — un usuario que cambió el
  // idioma a mano no quiere que un cambio del idioma del sistema operativo se lo pise en el
  // siguiente arranque. navigator.language solo decide quien nunca ha elegido nada todavía.
  async resolverIdiomaInicial(): Promise<IdiomaSoportado> {
    const guardado = await this.leerPreferenciaGuardada();
    if (guardado && (IDIOMAS_SOPORTADOS as string[]).includes(guardado)) {
      return guardado as IdiomaSoportado;
    }
    return this.normalizar(this.idiomaDelNavegador());
  }

  // Envuelto en métodos propios (en vez de llamar a Preferences.get/navigator.language
  // directamente desde resolverIdiomaInicial) a propósito: Preferences es un Proxy dinámico
  // (registerPlugin() de @capacitor/core, ver node_modules/@capacitor/preferences/dist/esm/
  // index.js) — Jasmine spyOn() no puede interceptar sus métodos de forma fiable a través del
  // Proxy. Aislarlo en un método propio de la clase sí es espiable con spyOn(service, '...').
  private async leerPreferenciaGuardada(): Promise<string | null> {
    const { value } = await Preferences.get({ key: CLAVE_PREFERENCIA_IDIOMA });
    return value;
  }

  private idiomaDelNavegador(): string {
    return navigator.language;
  }

  // Llamado una única vez, desde el inicializador de arranque (ver main.ts) — resuelve el
  // idioma ANTES de que Angular renderice el primer componente, así nunca se ve un flash de
  // claves de traducción sin resolver ni del idioma equivocado.
  async inicializar(): Promise<void> {
    const idioma = await this.resolverIdiomaInicial();
    this.aplicar(idioma);
  }

  // Cambio en caliente (selector de Perfil): persiste la elección y la aplica sin recargar.
  async cambiarIdioma(idioma: IdiomaSoportado): Promise<void> {
    await this.guardarPreferencia(idioma);
    this.aplicar(idioma);
  }

  private async guardarPreferencia(idioma: IdiomaSoportado): Promise<void> {
    await Preferences.set({ key: CLAVE_PREFERENCIA_IDIOMA, value: idioma });
  }

  private aplicar(idioma: IdiomaSoportado): void {
    this.transloco.setActiveLang(idioma);
    // Accesibilidad/SEO/comportamiento nativo del navegador (autocorrección, lectores de
    // pantalla) — Transloco no lo toca por sí solo, hay que sincronizarlo a mano.
    document.documentElement.lang = idioma;
  }
}
