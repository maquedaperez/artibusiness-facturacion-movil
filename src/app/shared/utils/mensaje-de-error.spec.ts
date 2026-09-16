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

  // Errores del sistema, del navegador o de un plugin del movil (2026-09-16). Llegan como un
  // Error normal y acababan en el aviso rojo, en ingles. Textos reales vistos probando la app.
  describe('errores del sistema en ingles', () => {
    const RESPALDO = 'No se pudo descargar la factura. Intentalo de nuevo.';

    it('el fallo del iPhone al escribir el fichero no se ensena tal cual', () => {
      const error = new Error('Missing parent directory - possibly recursive=false was passed');

      expect(mensajeDeError(error, RESPALDO)).toBe(RESPALDO);
    });

    it('tampoco un fallo de red del navegador', () => {
      expect(mensajeDeError(new Error('Failed to fetch'), RESPALDO)).toBe(RESPALDO);
      expect(mensajeDeError(new Error('Network request failed'), RESPALDO)).toBe(RESPALDO);
    });

    it('ni un error del sistema de iOS', () => {
      const error = new Error('The operation could not be completed. (NSURLErrorDomain error -1009.)');

      expect(mensajeDeError(error, RESPALDO)).toBe(RESPALDO);
    });

    it('ni un fallo de conexion de Chrome', () => {
      expect(mensajeDeError(new Error('net::ERR_INTERNET_DISCONNECTED'), RESPALDO)).toBe(RESPALDO);
    });

    // LO QUE NO PUEDE PASAR: con la app en ingles, NUESTROS mensajes tambien estan en ingles.
    // Filtrar "por parecer ingles" los habria borrado justo cuando mas falta hacen.
    it('un mensaje NUESTRO en ingles se sigue ensenando', () => {
      const error = new Error('The invoice needs at least one line.');

      expect(mensajeDeError(error, RESPALDO)).toBe('The invoice needs at least one line.');
    });

    it('un mensaje nuestro en castellano se sigue ensenando', () => {
      const error = new Error("Ya existe un cliente con NIF 'A95758389' para la empresa 4.");

      expect(mensajeDeError(error, RESPALDO)).toBe("Ya existe un cliente con NIF 'A95758389' para la empresa 4.");
    });

    // Visto en la demo (2026-09-16): al contabilizar salia un aviso rojo con el nombre de un
    // cerrojo de SQL Server. Es cierto y sirve para el log, pero a quien usa la app no le dice
    // nada — lo que le pasa es que esa factura ya se esta contabilizando.
    describe('el bloqueo de una operacion ya en curso', () => {
      const traducir = (clave: string, params?: Record<string, unknown>) =>
        clave === 'errors.operationInProgress' ? 'Espera unos segundos.' : `${clave}:${JSON.stringify(params)}`;

      it('el mensaje de sp_getapplock no llega nunca al usuario', () => {
        const error = new Error(
          "No se pudo obtener el bloqueo 'contabilizar-emitida-83036' para la empresa 5 (sp_getapplock devolvio -1).");

        expect(mensajeDeError(error, RESPALDO, traducir)).toBe('Espera unos segundos.');
      });

      it('sin traductor se ensena el respaldo de la pantalla, nunca el cerrojo', () => {
        const error = new Error(
          "No se pudo obtener el bloqueo 'cobrar-emitida-83036' para la empresa 5 (sp_getapplock devolvio -1).");

        expect(mensajeDeError(error, RESPALDO)).toBe(RESPALDO);
      });

      // Pasa por el mismo camino que contabilizar: el catalogo de tickets tambien se serializa.
      it('vale para cualquier recurso, no solo para contabilizar', () => {
        const error = new Error("No se pudo obtener el bloqueo 'ocr-ticket-catalogo' para la empresa 9 (sp_getapplock devolvio -1).");

        expect(mensajeDeError(error, RESPALDO, traducir)).toBe('Espera unos segundos.');
      });
    });

    // Tambien de la demo: dar de alta un cliente de Arteixo escribiendo "La Coruna" cuando el
    // catalogo de la empresa la tiene como "A Coruna".
    it('la provincia desconocida se explica y dice que mirar', () => {
      const error = new Error("No existe la provincia 'La Coruna' para la empresa 5.");
      const traducir = (clave: string, params?: Record<string, unknown>) =>
        `${clave}|${(params as { provincia?: string })?.provincia}`;

      expect(mensajeDeError(error, RESPALDO, traducir)).toBe('errors.provinceNotFound|La Coruna');
    });

    it('sin traductor, la provincia desconocida se sigue ensenando tal cual', () => {
      const error = new Error("No existe la provincia 'La Coruna' para la empresa 5.");

      expect(mensajeDeError(error, RESPALDO)).toBe("No existe la provincia 'La Coruna' para la empresa 5.");
    });

    // Un mensaje nuestro puede nombrar cosas en ingles sin ser ingles: no puede perderse.
    it('un mensaje nuestro que nombra Stripe o un request-id se sigue ensenando', () => {
      const error = new Error('No se pudo abrir el pago de Stripe (request-id 8f2c).');

      expect(mensajeDeError(error, RESPALDO)).toContain('Stripe');
    });
  });
});
