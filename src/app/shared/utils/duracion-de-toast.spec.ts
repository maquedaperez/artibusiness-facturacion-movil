import { duracionDeToast } from './duracion-de-toast';

// Cuánto se queda un aviso en pantalla (2026-09-14).
//
// Tres pantallas lo tenían fijo en 2,5 segundos. Los mensajes de error crecieron —desde que
// explican qué ha pasado y dónde mirar— y se iban antes de poder leerlos.
describe('duracionDeToast', () => {
  // EL CASO QUE LO ORIGINA, con el mensaje literal que sale al fallar la firma.
  it('un aviso largo dura lo que se tarda en leerlo, no 2,5 segundos', () => {
    const aviso = 'No se ha podido firmar la factura. Comprueba que la empresa tenga configurado un certificado de firma válido.';

    const duracion = duracionDeToast(aviso);

    // A ~17 caracteres por segundo, 109 caracteres piden más de 6 segundos.
    expect(duracion).toBeGreaterThan(6000);
    expect(duracion).toBeLessThanOrEqual(8000);
  });

  it('un aviso corto no se va de golpe', () => {
    expect(duracionDeToast('Guardada')).toBe(3000);
  });

  // Si un mensaje necesita más de 8 segundos, el sitio correcto es un diálogo, no un toast:
  // un aviso que no se quita tapa la pantalla y estorba más de lo que informa.
  it('por largo que sea, no se queda tapando la pantalla', () => {
    expect(duracionDeToast('a'.repeat(500))).toBe(8000);
  });

  it('sin mensaje, el mínimo', () => {
    expect(duracionDeToast('')).toBe(3000);
    expect(duracionDeToast(undefined as unknown as string)).toBe(3000);
  });
});
