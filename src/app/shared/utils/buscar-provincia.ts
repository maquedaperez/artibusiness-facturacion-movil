import { Provincia } from '../../core/ports/provinces.repository';

/**
 * Buscar una provincia por el nombre, como lo escribe la gente.
 *
 * ES EL ESPEJO DE `WebAPIARTIBusiness/Helpers/ProvinciaEspanola.cs` (PR 55), igual que
 * validar-nif.ts lo es de NifEspanol.cs: si aquí se encontrara una provincia que allí no
 * se empareja, el alta fallaría después de que el usuario la hubiera elegido de la lista.
 * Mismas reglas y mismos pares bilingües; si se toca uno, se toca el otro.
 *
 * Reglas: se ignoran mayúsculas, acentos, puntuación y el artículo, vaya delante o detrás
 * ("A Coruña" = "Coruña, A" = "Coruña"), más una lista explícita para los nombres en las dos
 * lenguas que ninguna normalización puede unir (Gerona/Girona, Orense/Ourense...).
 */

// Cada grupo es UNA provincia; el primero es el canónico. Solo los pares que la normalización
// no puede unir por sí sola: "València" y "Valencia" ya caen en lo mismo al quitar el acento.
const GRUPOS_EQUIVALENTES: string[][] = [
  ['CORUNA', 'CORUNHA'],
  ['GIRONA', 'GERONA'],
  ['LLEIDA', 'LERIDA'],
  ['OURENSE', 'ORENSE'],
  ['BIZKAIA', 'VIZCAYA'],
  ['GIPUZKOA', 'GUIPUZCOA'],
  ['ARABA', 'ALAVA', 'ARABA ALAVA', 'ALAVA ARABA'],
  ['ILLES BALEARS', 'ISLAS BALEARES', 'BALEARS', 'BALEARES'],
  ['ALACANT', 'ALICANTE'],
  ['CASTELLO', 'CASTELLON', 'CASTELLO DE LA PLANA', 'CASTELLON DE LA PLANA'],
  ['NAFARROA', 'NAVARRA'],
  ['ASTURIAS', 'PRINCIPADO DE ASTURIAS'],
];

const ARTICULOS = ['A', 'LA', 'EL', 'LAS', 'LOS', 'LES'];

const CANONICO_POR_NOMBRE = construirCanonicos();

function construirCanonicos(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const grupo of GRUPOS_EQUIVALENTES) {
    for (const nombre of grupo) mapa.set(nombre, grupo[0]);
  }
  return mapa;
}

/**
 * Mayúsculas, sin acentos ni diéresis, sin puntuación y con un solo espacio entre palabras.
 * La 'ñ' acaba en 'N' a propósito: "Coruna", como lo escribe más de un teclado, tiene que valer.
 */
export function normalizarProvincia(nombre: string | null | undefined): string {
  if (!nombre) return '';
  return nombre
    .trim()
    .toUpperCase()
    .normalize('NFD')
    // Las marcas diacríticas que NFD ha separado de su letra.
    .replace(/[̀-ͯ]/g, '')
    // Cualquier cosa que no sea letra o número separa palabras: "Coruña, A" y "Coruña - A"
    // acaban igual.
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function sinArticulo(normalizado: string): string {
  const palabras = normalizado.split(' ').filter(p => p.length > 0);
  if (palabras.length < 2) return normalizado;

  if (ARTICULOS.includes(palabras[0])) return palabras.slice(1).join(' ');
  if (ARTICULOS.includes(palabras[palabras.length - 1])) return palabras.slice(0, -1).join(' ');
  return normalizado;
}

/** Forma comparable: normalizada, sin artículo y pasada por los pares bilingües. */
export function canonizarProvincia(nombre: string | null | undefined): string {
  const normalizado = sinArticulo(normalizarProvincia(nombre));
  return CANONICO_POR_NOMBRE.get(normalizado) ?? normalizado;
}

/** true si el nombre del catálogo y lo escrito son la misma provincia. */
export function esLaMismaProvincia(delCatalogo: string, escrito: string): boolean {
  const canonizado = canonizarProvincia(escrito);
  return canonizado.length > 0 && canonizarProvincia(delCatalogo) === canonizado;
}

/**
 * Las provincias del catálogo que encajan con lo escrito, para ofrecerlas mientras se teclea.
 * Con el campo vacío devuelve las primeras, que es lo que se quiere al pulsar en él.
 */
export function buscarProvincias(catalogo: Provincia[], escrito: string, maximo = 6): Provincia[] {
  const buscado = canonizarProvincia(escrito);
  if (buscado.length === 0) return catalogo.slice(0, maximo);

  // Primero las que empiezan por lo escrito, luego las que solo lo contienen: teclear "leon"
  // debe ofrecer León antes que Castellón de la Plana.
  const empiezan: Provincia[] = [];
  const contienen: Provincia[] = [];
  for (const provincia of catalogo) {
    const candidata = canonizarProvincia(provincia.nombre);
    if (candidata.startsWith(buscado)) empiezan.push(provincia);
    else if (candidata.includes(buscado)) contienen.push(provincia);
  }

  return [...empiezan, ...contienen].slice(0, maximo);
}
