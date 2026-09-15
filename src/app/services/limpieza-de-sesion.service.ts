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
 * guardar de una empresa aparecía en la lista de la otra: guardarlo allí lo habría dado de alta
 * en la empresa equivocada.
 *
 * DOS CLASES DE COSAS, porque no cuesta lo mismo tirarlas:
 * - registrar(): lo que se puede volver a pedir sin perder nada (catálogos). Se tira en CADA
 *   cambio de sesión, aunque se vuelva a la misma empresa.
 * - registrarSoloAlCambiarDeEmpresa(): lo que el usuario perdería (borradores sin guardar). Solo
 *   se tira si la sesión nueva es de OTRA empresa u OTRO usuario. Pedido por Abraham: cerrar
 *   sesión y volver a entrar en la misma empresa —o que caduque la sesión— no puede costarle una
 *   factura a medias.
 *
 * TODA CACHÉ EN MEMORIA CON DATOS DE UNA EMPRESA TIENE QUE REGISTRARSE AQUÍ. AuthService avisa
 * con cerrarSesion() al salir y con iniciarSesion() justo antes de guardar el token nuevo, lo que
 * cubre cerrar sesión, "Cambiar empresa", la sesión caducada y entrar con otro usuario encima de
 * una sesión abierta.
 */
@Injectable({ providedIn: 'root' })
export class LimpiezaDeSesionService {
  private readonly deLaSesion = new Set<() => void>();
  private readonly deLaEmpresa = new Set<() => void>();

  // Empresa y usuario de la última sesión que se cerró. Hace falta porque al volver a entrar ya
  // no queda ningún usuario guardado con el que comparar: logout() lo borra.
  private identidadAnterior: string | null = null;

  registrar(limpiar: () => void): void {
    this.deLaSesion.add(limpiar);
  }

  registrarSoloAlCambiarDeEmpresa(limpiar: () => void): void {
    this.deLaEmpresa.add(limpiar);
  }

  cerrarSesion(identidad: string | null): void {
    if (identidad) this.identidadAnterior = identidad;
    this.ejecutar(this.deLaSesion);
  }

  /**
   * @param anterior identidad de la sesión que sigue abierta al entrar, si la hay (entrar con
   *   otro usuario sin haber cerrado sesión). Si no, se compara con la última que se cerró.
   */
  iniciarSesion(anterior: string | null, nueva: string): void {
    this.ejecutar(this.deLaSesion);
    const previa = anterior ?? this.identidadAnterior;
    if (previa !== null && previa !== nueva) this.ejecutar(this.deLaEmpresa);
    this.identidadAnterior = nueva;
  }

  private ejecutar(limpiezas: Set<() => void>): void {
    for (const limpiar of limpiezas) {
      try {
        limpiar();
      } catch {
        // Una limpieza que falle no puede dejar sin hacer las demás: lo que quedara sin tirar
        // se vería en la empresa siguiente.
      }
    }
  }
}
