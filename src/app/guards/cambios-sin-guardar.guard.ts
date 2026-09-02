import { CanDeactivateFn } from '@angular/router';

/**
 * Contrato mínimo que debe cumplir una pantalla con formulario para poder protegerse con
 * cambiosSinGuardarGuard. Deliberadamente es una interfaz y no una clase base: las páginas de
 * esta app son standalone y no comparten jerarquía, y lo único que el guard necesita saber es
 * si puede irse.
 */
export interface PuedeSalirDeLaPantalla {
  /** true si se puede abandonar la pantalla; false si el usuario decidió quedarse. */
  puedeSalir(): Promise<boolean> | boolean;
}

/**
 * Protege la navegación de salida de una pantalla con cambios sin guardar (hallazgo G04 de la
 * auditoría, 2026-09-02: se descartaban en silencio).
 *
 * Va en la ruta y no dentro del propio botón de volver a propósito: así cubre de una vez TODAS
 * las formas de salir que pasan por el router — el botón de la cabecera, las pestañas de abajo,
 * el botón Atrás del navegador y el botón físico Atrás de Android —, sin repetir la
 * comprobación en cada una ni arriesgarse a olvidar alguna. Lo único que NO pasa por el router
 * es recargar o cerrar la pestaña del navegador; de eso se encarga el listener de beforeunload
 * en la propia página.
 */
export const cambiosSinGuardarGuard: CanDeactivateFn<PuedeSalirDeLaPantalla> = componente => {
  // El componente puede no estar todavía instanciado (o haberse destruido) en salidas muy
  // tempranas: en ese caso no hay nada que perder, se deja salir.
  return componente?.puedeSalir() ?? true;
};
