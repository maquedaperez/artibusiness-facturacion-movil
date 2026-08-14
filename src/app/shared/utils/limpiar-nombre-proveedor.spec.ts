import { limpiarNombreProveedor } from './limpiar-nombre-proveedor';

describe('limpiarNombreProveedor', () => {
  it('quita un punto suelto al final, precedido de espacio', () => {
    expect(limpiarNombreProveedor('Iberdrola Clientes, S.A.U. .')).toBe('Iberdrola Clientes, S.A.U.');
  });

  it('no toca un nombre sin el punto de relleno', () => {
    expect(limpiarNombreProveedor('Iberdrola Clientes, S.A.U.')).toBe('Iberdrola Clientes, S.A.U.');
  });

  it('no toca un punto que forma parte real del nombre (no está al final tras un espacio)', () => {
    expect(limpiarNombreProveedor('S.A.U.')).toBe('S.A.U.');
  });

  it('quita espacios sobrantes junto con el punto', () => {
    expect(limpiarNombreProveedor('Proveedor sin nombre   .   ')).toBe('Proveedor sin nombre');
  });
});
