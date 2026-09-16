import { avisosDelLectorEnCastellano } from './avisos-del-lector';

const TEXTOS: Record<string, string> = {
  'ocr.readerWarnings.totalsMismatch': 'El lector avisa: el total de las líneas ({lineas}) no coincide con el del documento ({documento}).',
  'ocr.readerWarnings.bankPartial': 'El lector ha reconocido el documento bancario, pero no ha leído los movimientos ni los totales.',
};
const traducir = (clave: string, params?: Record<string, unknown>) =>
  (TEXTOS[clave] ?? clave)
    .replace('{lineas}', String(params?.['lineas'] ?? ''))
    .replace('{documento}', String(params?.['documento'] ?? ''));

// Los textos son los que llegaron de verdad probando la app (2026-09-14).
const DESCUADRE_LINEAS = 'Aviso del motor de extracción: Significant discrepancy between the line-based reconciled total (41.77) and the stated total (45.95); diff=4.18';
const DESCUADRE_CONCILIADO = 'Aviso del motor de extracción: Significant discrepancy between the reconciled total (50.13) and the stated total (45.95); diff=4.18';
const NUESTRO_DESCUADRE = 'El total calculado a partir de las líneas (41,77 €) no coincide con el total declarado en el documento original (45,95 €). Revisa las líneas antes de guardar.';
const BANCARIO = 'BANK_DOCUMENT_PARTIAL_EXTRACTION: No bank entries or totals were extracted.';

describe('avisosDelLectorEnCastellano', () => {
  // EL CASO DE ITEVELESA: tres avisos del mismo descuadre, dos de ellos en inglés.
  it('cuando ya avisamos nosotros del descuadre, los del lector no se repiten', () => {
    const avisos = avisosDelLectorEnCastellano([DESCUADRE_LINEAS, DESCUADRE_CONCILIADO, NUESTRO_DESCUADRE], traducir);

    expect(avisos).toEqual([NUESTRO_DESCUADRE]);
  });

  // El mismo aviso lo escriben DOS sitios con finales distintos: el backend ("Revisa la
  // factura.") y esta app ("Revisa las líneas antes de guardar."). La regla mira el principio,
  // que es igual en los dos — si alguno cambia esa frase, este test lo caza.
  it('también reconoce el aviso de descuadre que escribe el backend', () => {
    const delBackend = 'El total calculado a partir de las líneas (41,77 €) no coincide con el total declarado en el documento original (45,95 €). Revisa la factura.';

    const avisos = avisosDelLectorEnCastellano([DESCUADRE_LINEAS, delBackend], traducir);

    expect(avisos).toEqual([delBackend]);
  });

  it('sin aviso nuestro, el del lector se enseña en castellano y con los importes', () => {
    const avisos = avisosDelLectorEnCastellano([DESCUADRE_LINEAS], traducir);

    expect(avisos.length).toBe(1);
    expect(avisos[0]).toContain('41,77');
    expect(avisos[0]).toContain('45,95');
    expect(avisos[0]).not.toContain('discrepancy');
  });

  it('dos avisos del lector que dicen lo mismo se enseñan una sola vez', () => {
    const avisos = avisosDelLectorEnCastellano([DESCUADRE_LINEAS, DESCUADRE_LINEAS], traducir);

    expect(avisos.length).toBe(1);
  });

  it('el documento bancario incompleto se explica en castellano', () => {
    const avisos = avisosDelLectorEnCastellano([BANCARIO], traducir);

    expect(avisos).toEqual([TEXTOS['ocr.readerWarnings.bankPartial']]);
  });

  // Nunca inventar: lo que no reconocemos se enseña tal cual, aunque venga en inglés.
  it('un aviso desconocido se deja como viene', () => {
    const desconocido = 'Aviso del motor de extracción: Something new we do not know about';

    expect(avisosDelLectorEnCastellano([desconocido], traducir)).toEqual([desconocido]);
  });

  it('los avisos propios de la app no se tocan', () => {
    const nuestro = 'Este documento no identifica fiscalmente a tu empresa.';

    expect(avisosDelLectorEnCastellano([nuestro], traducir)).toEqual([nuestro]);
  });

  it('descarta los vacíos y aguanta una lista que no existe', () => {
    expect(avisosDelLectorEnCastellano(['', '   '], traducir)).toEqual([]);
    expect(avisosDelLectorEnCastellano(undefined as unknown as string[], traducir)).toEqual([]);
  });
});
