// Único punto de formato de importes en euros — antes estaba duplicado en 7+
// archivos, cada uno con el mismo bug: Intl.NumberFormat('es-ES', ...) con
// useGrouping por defecto ('auto') no añade el separador de miles en números de
// 4 cifras (2576 → "2576,00 €" en vez de "2.576,00 €"), solo a partir de 5 cifras.
// useGrouping: 'always' lo fuerza siempre, que es el formato español esperado.
export function formatEuros(v: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: true,
  }).format(v);
}
