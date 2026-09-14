import { Capacitor } from '@capacitor/core';
import { compartirBlob, descargarBlob, esCancelacion, nombreDeFicheroSeguro } from './compartir-documento';

describe('compartirBlob / descargarBlob', () => {
  const blob = new Blob(['contenido de prueba'], { type: 'text/plain' });

  it('en web sin Web Share API con ficheros, descarga directamente (fallback)', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url');
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');

    // Se fuerza canShare a false (independientemente de si el Chrome del test lo
    // soporta) para probar específicamente la ruta de fallback a descarga.
    const nav = navigator as any;
    const canShareOriginal = nav.canShare;
    nav.canShare = () => false;

    const resultado = await compartirBlob(blob, 'prueba.txt');
    nav.canShare = canShareOriginal;

    expect(resultado).toBe('descargado');
    expect(clickSpy).toHaveBeenCalled();
    // revokeObjectURL se llama de forma diferida (setTimeout) para no invalidar la
    // descarga antes de que el navegador la procese.
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('en web con Web Share API de ficheros disponible, usa navigator.share', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const nav = navigator as any;
    const canShareOriginal = nav.canShare;
    const shareOriginal = nav.share;
    nav.canShare = () => true;
    nav.share = jasmine.createSpy('share').and.returnValue(Promise.resolve());

    const resultado = await compartirBlob(blob, 'prueba.txt');

    expect(resultado).toBe('compartido');
    expect(nav.share).toHaveBeenCalled();

    nav.canShare = canShareOriginal;
    nav.share = shareOriginal;
  });

  it('descargarBlob crea y revoca un object URL', async () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url-2');
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click');

    const resultado = await descargarBlob(blob, 'descarga.txt');

    expect(resultado).toBe('descargado');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  // BUG REAL (iPhone, 2026-09-09): descargarBlob hacia la descarga del navegador tambien
  // dentro de la app nativa. WKWebView ignora el atributo download de un enlace y NO lanza
  // ningun error, asi que salia el toast de "factura descargada" y no ocurria absolutamente
  // nada.
  //
  // No se puede comprobar el final feliz: el dialogo del sistema no se abre en un test (el
  // navegador exige un gesto del usuario) y los plugins de Capacitor son proxies, asi que
  // spyOn no los intercepta. Pero lo que hay que impedir que vuelva se comprueba igual: que
  // en nativo NO se intente la descarga del navegador, que era justo lo que no hacia nada.
  it('en nativo no intenta la descarga del navegador', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');

    await descargarBlob(blob, 'descarga.txt').catch(() => undefined);

    expect(clickSpy).not.toHaveBeenCalled();
  });

  // Cerrar el dialogo sin elegir nada llega como excepcion, pero no es un fallo: sin
  // distinguirlo, pensarselo mejor se veria como "no se pudo descargar la factura".
  it('reconoce la cancelacion del dialogo y no la confunde con un fallo real', () => {
    expect(esCancelacion(new Error('Share canceled'))).toBeTrue();
    expect(esCancelacion(new Error('Share cancelled'))).toBeTrue();
    expect(esCancelacion(new Error('Error al escribir el archivo'))).toBeFalse();
    expect(esCancelacion(undefined)).toBeFalse();
  });

  // Encontrado en revisión 2026-08-19: documentoNombre nunca se reconstruye al leer una
  // factura ya existente (el backend no lo guarda) — sin añadir la extensión a partir del
  // content-type real del blob, descargar/compartir el documento de una factura recargada
  // perdía la extensión por completo.
  describe('extensión reconstruida a partir del content-type del blob', () => {
    beforeEach(() => {
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url-3');
      spyOn(URL, 'revokeObjectURL');
    });

    it('sin extensión en el nombre, la añade a partir del content-type', async () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const pdf = new Blob(['contenido'], { type: 'application/pdf' });

      await descargarBlob(pdf, 'documento-adjunto');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('documento-adjunto.pdf');
    });

    it('si el nombre ya trae extensión, no la duplica', async () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const pdf = new Blob(['contenido'], { type: 'application/pdf' });

      await descargarBlob(pdf, 'factura-real.pdf');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('factura-real.pdf');
    });

    it('con un content-type desconocido, deja el nombre tal cual', async () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const desconocido = new Blob(['contenido'], { type: 'application/octet-stream' });

      await descargarBlob(desconocido, 'documento-adjunto');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('documento-adjunto');
    });
  });

  // BUG REAL (iPhone, 2026-09-14): descargar una factura EMITIDA daba "Missing parent directory".
  // Los números de factura llevan serie con barra, y Filesystem tomaba "Factura-FAR/" por una
  // carpeta que no existe. En recibidas no pasaba: sus nombres no llevan barra.
  describe('nombre de fichero seguro', () => {
    it('la barra de la serie de factura no se toma por una carpeta', () => {
      expect(nombreDeFicheroSeguro('Factura-FAR/17-318.pdf')).toBe('Factura-FAR-17-318.pdf');
    });

    it('limpia el resto de caracteres que no pueden ir en un nombre de fichero', () => {
      expect(nombreDeFicheroSeguro('a\\b:c*d?e"f<g>h|i.pdf')).toBe('a-b-c-d-e-f-g-h-i.pdf');
    });

    it('no deja guiones repetidos donde había varios caracteres seguidos', () => {
      expect(nombreDeFicheroSeguro('Factura-FAR//17.pdf')).toBe('Factura-FAR-17.pdf');
    });

    it('un nombre que ya era correcto no se toca', () => {
      expect(nombreDeFicheroSeguro('CZ0008526.pdf')).toBe('CZ0008526.pdf');
    });

    it('sin nombre, no deja el fichero anónimo', () => {
      expect(nombreDeFicheroSeguro('')).toBe('documento');
    });

    // Y que de verdad llega limpio a la descarga, no solo que la función exista.
    it('descargar una factura con serie usa el nombre ya limpio', async () => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
      spyOn(URL, 'createObjectURL').and.returnValue('blob:serie');
      spyOn(URL, 'revokeObjectURL');
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const pdf = new Blob(['contenido'], { type: 'application/pdf' });

      await descargarBlob(pdf, 'Factura-FAR/17-318.pdf');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('Factura-FAR-17-318.pdf');
    });
  });
});
