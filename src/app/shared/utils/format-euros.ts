// Único punto de formato visual de importes/fechas — antes estaba duplicado en 7+
// archivos, cada uno con el mismo bug: Intl.NumberFormat('es-ES', ...) con
// useGrouping por defecto ('auto') no añade el separador de miles en números de
// 4 cifras (2576 → "2576,00 €" en vez de "2.576,00 €"), solo a partir de 5 cifras.
// useGrouping: 'always' lo fuerza siempre, que es el formato español esperado.
//
// El locale usado por Intl ya NO está fijado a 'es-ES': se deriva del idioma activo de la
// app (document.documentElement.lang, que LanguageService mantiene sincronizado en
// arranque y en cada cambio de idioma — ver core/i18n/language.service.ts). Estas son
// funciones sueltas, no un servicio inyectable, para no obligar a los 16+ sitios que ya
// las importan a pasar por el inyector de Angular solo para dar formato a un número.
// La moneda sigue siendo siempre EUR y el valor numérico guardado no cambia: solo cambia
// cómo se pinta (separador decimal/de miles, orden símbolo-importe, formato de fecha).
const LOCALE_INTL: Record<string, string> = {
  es: 'es-ES',
  en: 'en-GB',
  uk: 'uk-UA',
};

function localeActivo(): string {
  const lang = document.documentElement.lang;
  return LOCALE_INTL[lang] ?? LOCALE_INTL['es'];
}

export function formatEuros(v: number): string {
  return new Intl.NumberFormat(localeActivo(), {
    style: 'currency',
    currency: 'EUR',
    useGrouping: true,
  }).format(v);
}

export function formatFecha(fechaIso: string): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  return new Intl.DateTimeFormat(localeActivo(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatNumero(v: number, opciones?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeActivo(), opciones).format(v);
}

export function formatPorcentaje(v: number): string {
  return new Intl.NumberFormat(localeActivo(), { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}
