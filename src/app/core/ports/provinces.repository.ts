/** Una provincia del catálogo de la empresa (tabla 'provincias' del backend). */
export type Provincia = {
  id: number;
  nombre: string;
};

/**
 * Catálogo de provincias de la empresa, para el alta de clientes y de proveedores.
 *
 * POR QUÉ EXISTE (2026-09-16). La provincia se escribía a mano y el backend la comparaba con su
 * catálogo: escribir "La Coruña" donde la empresa tiene "A Coruña" era un callejón sin salida,
 * porque ninguna pantalla decía qué nombres valen. El backend ya empareja tolerando acentos,
 * artículo y nombre bilingüe (PR 55), pero lo que de verdad cierra el problema es enseñar la
 * lista.
 *
 * enumerar() NUNCA lanza: si el endpoint no está publicado todavía (404) o no hay conexión,
 * devuelve una lista vacía y el campo se comporta como el texto libre de siempre. Eso es lo que
 * permite tener esto en la app antes de que el backend esté arriba.
 */
export abstract class ProvincesRepository {
  abstract enumerar(): Promise<Provincia[]>;
}
