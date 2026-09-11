import { esMensajePresentable, mensajeDeError } from './mensaje-de-error';

// Qué se le enseña a una persona cuando algo falla (2026-09-09).
//
// El caso que originó esto es literal: lo vio Abraham en un iPhone al contabilizar una factura
// que la AEAT ya había rechazado. Un toast rojo de media pantalla con JSON anidado dentro.
describe('mensajeDeError', () => {
  const RESPALDO = 'No se pudo contabilizar la factura.';

  // EL CASO REAL, copiado tal cual del error que llegó al móvil.
  it('no enseña el volcado JSON del 502 de FacturaE', () => {
    const error = new Error(
      'HTTP 502 {"error":"FacturaE no pudo procesar la factura.","detalle":"FacturaE respondió '
      + '409 Conflict: {\\"error\\":\\"Ya existe un registro (Id=246818) para la factura '
      + '\'FAR26359\' de 09-09-2026 en estado \'RechazadoAeat\'\\"}"}');

    expect(mensajeDeError(error, RESPALDO)).toBe(RESPALDO);
  });

  // Y lo que NO hay que romper: cuando el backend escribe una frase de verdad, se enseña. Es
  // muchísimo más útil que un genérico, y es la razón por la que las pantallas hacían esto.
  it('enseña el mensaje del backend cuando está escrito para leerse', () => {
    const error = new Error("Ya existe una factura con el número 'M-1' para este proveedor — revisa si ya la habías guardado antes.");

    expect(mensajeDeError(error, RESPALDO)).toBe(error.message);
  });

  // "HTTP 500 - Error interno del servidor." se enseña ENTERO, código incluido: distinguir un
  // fallo del servidor de un "no encontrado" importa, y el número le sirve a quien da soporte.
  it('un HTTP con frase legible detrás se enseña sin el código', () => {
    const error = new Error('HTTP 500 - Error interno del servidor.');

    expect(mensajeDeError(error, RESPALDO)).toBe('Error interno del servidor.');
  });

  // El código entre corchetes lo pone ApiService para que las pantallas reconozcan errores
  // conocidos por su código. Al usuario no le dice nada.
  it('recorta el código de error del final', () => {
    const error = new Error('Ya hay una operación en curso con este documento. [OPERATION_IN_PROGRESS]');

    expect(mensajeDeError(error, RESPALDO)).toBe('Ya hay una operación en curso con este documento.');
  });

  it('sin error, o sin mensaje, usa el respaldo', () => {
    expect(mensajeDeError(undefined, RESPALDO)).toBe(RESPALDO);
    expect(mensajeDeError(new Error(''), RESPALDO)).toBe(RESPALDO);
    expect(mensajeDeError({ algo: 'que no es un Error' }, RESPALDO)).toBe(RESPALDO);
  });

  it('una parrafada no se enseña en un toast', () => {
    expect(mensajeDeError(new Error('a'.repeat(201)), RESPALDO)).toBe(RESPALDO);
  });

  it('un stack trace o una excepción de .NET tampoco', () => {
    expect(esMensajePresentable('System.NullReferenceException: Object reference not set')).toBeFalse();
    expect(esMensajePresentable('   at WebAPIARTIBusiness.Services.FacturaEmitidaService.Guardar')).toBeFalse();
  });
});
