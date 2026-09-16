import { formatEuros } from './format-euros';

/**
 * Los avisos que devuelve el lector de facturas, en castellano y sin repetir lo que ya decimos
 * nosotros (2026-09-16).
 *
 * EL PROBLEMA: el lector los manda en texto libre y EN INGLÉS, y se los enseñamos al usuario tal
 * cual. En una factura de ITEVELESA salieron tres avisos del mismo descuadre: dos suyos en
 * inglés, con dos totales distintos, y el nuestro en castellano.
 *
 * ES TEMPORAL. Ya le hemos pedido a Alex que cada aviso lleve un código estable y el mensaje en
 * castellano (ver Mejoras-OCR-para-Alex.txt). Cuando lo haga, esto se sustituye por una
 * traducción por código y se deja de mirar el texto.
 *
 * QUÉ NO HACE: inventar. Un aviso que no reconocemos se deja exactamente como viene — perder
 * información del lector sería peor que enseñarla en inglés.
 */

// "Significant discrepancy between the line-based reconciled total (41.77) and the stated
// total (45.95); diff=4.18" — y la variante sin "line-based".
const DESCUADRE_DE_TOTALES = /reconciled total\s*\(([\d.,]+)\)[\s\S]*?stated total\s*\(([\d.,]+)\)/i;

// "BANK_DOCUMENT_PARTIAL_EXTRACTION: No bank entries or totals were extracted."
const BANCARIO_INCOMPLETO = /BANK_DOCUMENT_PARTIAL_EXTRACTION/i;

// Nuestro propio aviso de descuadre, que ya sale en castellano y con nuestros números: lo
// generan tanto el backend como esta app. Si está, los del lector sobran.
const NUESTRO_AVISO_DE_TOTALES = 'El total calculado a partir de las líneas';

export type Traducir = (clave: string, params?: Record<string, unknown>) => string;

export function avisosDelLectorEnCastellano(avisos: readonly string[], traducir: Traducir): string[] {
  const limpios = (avisos ?? []).filter(a => !!a?.trim());
  const yaAvisamosDelDescuadre = limpios.some(a => a.includes(NUESTRO_AVISO_DE_TOTALES));

  const traducidos: string[] = [];
  for (const aviso of limpios) {
    const descuadre = DESCUADRE_DE_TOTALES.exec(aviso);
    if (descuadre) {
      // El nuestro compara contra las líneas que de verdad vamos a guardar, así que manda.
      if (yaAvisamosDelDescuadre) continue;
      traducidos.push(traducir('ocr.readerWarnings.totalsMismatch', {
        lineas: importe(descuadre[1]),
        documento: importe(descuadre[2]),
      }));
      continue;
    }

    if (BANCARIO_INCOMPLETO.test(aviso)) {
      traducidos.push(traducir('ocr.readerWarnings.bankPartial'));
      continue;
    }

    traducidos.push(aviso);
  }

  // Dos avisos del lector pueden traducirse a la misma frase (en ITEVELESA llegaban dos del
  // mismo descuadre): se enseña una vez.
  return [...new Set(traducidos)];
}

// Los importes del lector vienen con punto decimal ("41.77"). Si no se puede leer, se deja el
// texto tal cual en vez de escribir un número equivocado.
function importe(valor: string): string {
  const numero = Number(valor.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(numero) ? formatEuros(numero) : valor;
}
