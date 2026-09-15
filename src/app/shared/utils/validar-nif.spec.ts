import { normalizarNif, validarNif } from './validar-nif';

describe('validarNif', () => {
  // EL CASO QUE LO ORIGINA (demo, 2026-09-14): la AEAT rechazó la factura con el error 1100
  // porque el NIF llevaba guion. Un NIF correcto escrito con guion no es un error del usuario:
  // se limpia y se da por bueno.
  it('el CIF de Iberdrola escrito con guion es válido y se guarda sin guion', () => {
    const resultado = validarNif('A-95758389');

    expect(resultado.valido).toBeTrue();
    expect(resultado.normalizado).toBe('A95758389');
  });

  it('quita espacios y puntos y lo pasa a mayúsculas', () => {
    expect(normalizarNif(' 12.345.678-z ')).toBe('12345678Z');
  });

  describe('DNI', () => {
    it('acepta un DNI con su letra correcta', () => {
      expect(validarNif('12345678Z')).toEqual({ valido: true, normalizado: '12345678Z', tipo: 'DNI' });
    });

    it('rechaza un DNI con la letra equivocada, que es la errata más habitual', () => {
      expect(validarNif('12345678A')).toEqual({ valido: false, normalizado: '12345678A', motivo: 'control' });
    });

    it('rechaza un DNI al que le falta un número', () => {
      expect(validarNif('1234567Z')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'formato' }));
    });
  });

  describe('NIE', () => {
    it('acepta un NIE con su letra correcta', () => {
      expect(validarNif('X1234567L')).toEqual({ valido: true, normalizado: 'X1234567L', tipo: 'NIE' });
    });

    it('rechaza un NIE con la letra equivocada', () => {
      expect(validarNif('X1234567T')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'control' }));
    });
  });

  describe('CIF', () => {
    it('acepta el CIF de una sociedad con dígito de control correcto', () => {
      expect(validarNif('B00000000')).toEqual({ valido: true, normalizado: 'B00000000', tipo: 'CIF' });
    });

    it('rechaza un CIF con el dígito de control equivocado', () => {
      expect(validarNif('A95758381')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'control' }));
    });

    it('una sociedad anónima (A) no puede llevar letra de control', () => {
      // El control correcto de A9575838 es 9, que en letra sería la I.
      expect(validarNif('A9575838I')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'control' }));
    });

    it('una entidad pública (P) lleva letra de control, no número', () => {
      // Ayuntamiento de Madrid: el control de P2807900 es el 2, que en letra es la B.
      expect(validarNif('P2807900B').valido).toBeTrue();
      expect(validarNif('P28079002').valido).toBeFalse();
    });
  });

  it('un texto que no tiene forma de NIF se rechaza por formato', () => {
    expect(validarNif('no lo se')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'formato' }));
  });

  it('un número de IVA extranjero no pasa: la AEAT lo rechazaría como NIF español', () => {
    expect(validarNif('FR12345678901').valido).toBeFalse();
  });

  // Mismo caso que NifEspanolTests del backend: en .NET \d acepta dígitos de ancho completo y
  // allí daba un 500. Aquí \d solo acepta 0-9; se fija para que las dos sigan de acuerdo.
  it('con dígitos de ancho completo es formato inválido, igual que en el backend', () => {
    expect(validarNif('１２３４５６７８Z')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'formato' }));
  });

  it('vacío se distingue de mal escrito', () => {
    expect(validarNif('  ')).toEqual(jasmine.objectContaining({ valido: false, motivo: 'vacio' }));
    expect(validarNif(undefined)).toEqual(jasmine.objectContaining({ valido: false, motivo: 'vacio' }));
  });
});
