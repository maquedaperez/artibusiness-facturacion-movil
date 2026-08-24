import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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

  // Nunca deja escapar una excepción: si Preferences.get() falla (plugin no listo, error nativo
  // puntual...) se trata igual que "sin preferencia guardada" y se sigue con navigator.language ->
  // español, en vez de tumbar el arranque de toda la aplicación.
  private async leerPreferenciaGuardada(): Promise<string | null> {
    try {
      return await this.obtenerPreferenciaCruda();
    } catch (error) {
      console.warn('[LanguageService] No se pudo leer la preferencia de idioma guardada; se usará el idioma del dispositivo.', error);
      return null;
    }
  }

  // Envuelto en su propio método (en vez de llamar a Preferences.get directamente desde
  // leerPreferenciaGuardada) a propósito: Preferences es un Proxy dinámico (registerPlugin() de
  // @capacitor/core, ver node_modules/@capacitor/core/dist/index.js — "new Proxy({}, {get...})")
  // — Jasmine spyOn() no puede interceptar sus métodos de forma fiable a través del Proxy.
  // Aislar la llamada cruda en un método propio de la clase sí es espiable con
  // spyOn(service, '...'), y separa "hacer la llamada nativa" de "tolerar que falle".
  private async obtenerPreferenciaCruda(): Promise<string | null> {
    const { value } = await Preferences.get({ key: CLAVE_PREFERENCIA_IDIOMA });
    return value;
  }

  private idiomaDelNavegador(): string {
    return navigator.language;
  }

  // Único punto de arranque: resuelve qué idioma tocaba, ESPERA de verdad a que su traducción
  // esté disponible (o a que Transloco haya agotado su propio fallback a español), y solo entonces
  // aplica el idioma que de verdad ha quedado activo y termina — nunca aplica a ciegas el idioma
  // pedido sin comprobar cuál cargó realmente, y nunca deja una excepción sin capturar que
  // bloquee el arranque de la app.
  async inicializar(): Promise<void> {
    const idiomaDeseado = await this.resolverIdiomaInicial();
    const idiomaEfectivo = await this.cargarConTolerancia(idiomaDeseado);
    this.aplicar(idiomaEfectivo);
  }

  // Cambio en caliente (selector de Perfil): espera la carga antes de dar el cambio por
  // completado, y solo persiste el idioma que de verdad ha quedado activo — si uk.json fallara y
  // Transloco cayera a español, se guarda 'es', no 'uk' (evita dejar guardada una preferencia que
  // luego nunca se puede honrar).
  async cambiarIdioma(idiomaSolicitado: IdiomaSoportado): Promise<void> {
    const idiomaEfectivo = await this.cargarConTolerancia(idiomaSolicitado);
    await this.guardarPreferencia(idiomaEfectivo);
    this.aplicar(idiomaEfectivo);
  }

  // firstValueFrom() de rxjs, no toPromise() (deprecado): espera de verdad a que termine
  // this.transloco.load(idioma). Si el idioma pedido falla, Transloco reintenta internamente con
  // el fallbackLang configurado ('es', ver main.ts) y esta misma promesa resuelve igual pero con
  // el contenido de 'es' cacheado bajo la clave 'es', no bajo la del idioma pedido — por eso NO
  // basta con asumir "resolvió = cargó lo pedido": idiomaRealmenteCargado() comprueba
  // getTranslation(idiomaPedido) para saber si de verdad quedó cacheado ese idioma en concreto.
  // Solo si TAMBIÉN falla el fallback (es.json) rechaza load() — caso extremo real, cubierto aquí
  // sin bloquear el arranque ni el cambio de idioma: se acepta que puedan verse claves sin
  // traducir en vez de tumbar la app.
  private async cargarConTolerancia(idioma: IdiomaSoportado): Promise<IdiomaSoportado> {
    try {
      await firstValueFrom(this.transloco.load(idioma));
    } catch (error) {
      console.warn('[LanguageService] No se pudo cargar ninguna traducción (ni el idioma pedido ni el idioma de reserva). Se usará "es" como idioma lógico.', error);
      return IDIOMA_POR_DEFECTO;
    }
    return this.idiomaRealmenteCargado(idioma);
  }

  private idiomaRealmenteCargado(idiomaPedido: IdiomaSoportado): IdiomaSoportado {
    const traduccion = this.transloco.getTranslation(idiomaPedido);
    const cargoDeVerdad = !!traduccion && Object.keys(traduccion).length > 0;
    return cargoDeVerdad ? idiomaPedido : IDIOMA_POR_DEFECTO;
  }

  // Nunca deja escapar una excepción: si Preferences.set() falla, el cambio de idioma ya se ha
  // aplicado igualmente (ver cambiarIdioma) — solo se pierde que sobreviva a un reinicio de la
  // app, no la funcionalidad de la sesión actual.
  private async guardarPreferencia(idioma: IdiomaSoportado): Promise<void> {
    try {
      await this.establecerPreferenciaCruda(idioma);
    } catch (error) {
      console.warn('[LanguageService] No se pudo guardar la preferencia de idioma; el cambio se aplica igual para esta sesión.', error);
    }
  }

  // Misma razón que obtenerPreferenciaCruda(): aísla la llamada al Proxy de Capacitor en su
  // propio método espiable, separado de la tolerancia a fallos.
  private async establecerPreferenciaCruda(idioma: IdiomaSoportado): Promise<void> {
    await Preferences.set({ key: CLAVE_PREFERENCIA_IDIOMA, value: idioma });
  }

  private aplicar(idioma: IdiomaSoportado): void {
    this.transloco.setActiveLang(idioma);
    // Accesibilidad/SEO/comportamiento nativo del navegador (autocorrección, lectores de
    // pantalla) — Transloco no lo toca por sí solo, hay que sincronizarlo a mano.
    document.documentElement.lang = idioma;
  }
}
