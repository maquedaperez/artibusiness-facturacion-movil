import { Injectable } from '@angular/core';

/**
 * Lo que la app guarda en memoria de UNA sesión y hay que tirar al cambiar de sesión: catálogos
 * de la empresa, borradores todavía sin guardar... (2026-09-15).
 *
 * EL PROBLEMA QUE RESUELVE, visto en la demo del 2026-09-14: tras entrar en ARTI Software y
 * pasar a la empresa demo, el alta de cliente ofrecía las formas de pago de ARTI Software
 * (Openbank, Sabadell, AMEX) y el backend respondía que esa forma de pago no existía en la
 * empresa demo. Los repositorios guardaban los catálogos para toda la vida de la app, y cerrar
 * sesión solo borraba el token: nada de lo que había en memoria se enteraba.
 *
 * No era solo un desplegable raro. Con el catálogo de IVA pasaba lo mismo, y un borrador sin
 * guardar de una empresa aparecía en la lista de la otra: guardarlo allí lo habría creado en la
 * empresa equivocada.
 *
 * TODA CACHÉ EN MEMORIA CON DATOS DE UNA EMPRESA TIENE QUE REGISTRARSE AQUÍ. AuthService llama a
 * limpiar() al cerrar sesión y justo antes de guardar el token de una sesión nueva, que cubre
 * cerrar sesión, "Cambiar empresa", la sesión caducada y entrar con otro usuario.
 */
@Injectable({ providedIn: 'root' })
export class LimpiezaDeSesionService {
  private readonly limpiezas = new Set<() => void>();

  registrar(limpiar: () => void): void {
    this.limpiezas.add(limpiar);
  }

  limpiar(): void {
    for (const limpiar of this.limpiezas) {
      try {
        limpiar();
      } catch {
        // Una limpieza que falle no puede dejar sin hacer las demás: lo que quedara sin tirar
        // se vería en la empresa siguiente.
      }
    }
  }
}
