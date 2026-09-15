/**
 * Un catálogo de la empresa (IVA, formas de pago...) que se pide una sola vez por sesión.
 *
 * Se guarda la promesa, no el valor ya resuelto, para que dos pantallas que lo piden a la vez no
 * disparen dos peticiones.
 *
 * BUG QUE CIERRA (2026-09-15): antes también se guardaba una promesa FALLIDA. Si el catálogo no
 * cargaba una vez —sin cobertura, un 500 pasajero—, cada intento posterior devolvía ese mismo
 * error sin volver a preguntar, hasta cerrar la app. Ahora un fallo no se recuerda.
 *
 * olvidar() lo llama LimpiezaDeSesionService al cambiar de sesión.
 */
export class CatalogoEnMemoria<T> {
  private valor: Promise<T> | null = null;

  obtener(cargar: () => Promise<T>): Promise<T> {
    if (!this.valor) {
      const peticion = cargar();
      this.valor = peticion;
      // Solo si sigue siendo la misma: si entretanto se olvidó y ya hay otra en vuelo, esa no
      // se toca.
      peticion.catch(() => {
        if (this.valor === peticion) this.valor = null;
      });
    }
    return this.valor;
  }

  olvidar(): void {
    this.valor = null;
  }
}
