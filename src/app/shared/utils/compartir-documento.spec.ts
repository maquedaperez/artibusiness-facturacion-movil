import { Capacitor } from '@capacitor/core';
import { compartirBlob, descargarBlob } from './compartir-documento';

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

  it('descargarBlob crea y revoca un object URL', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url-2');
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click');

    const resultado = descargarBlob(blob, 'descarga.txt');

    expect(resultado).toBe('descargado');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
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

    it('sin extensión en el nombre, la añade a partir del content-type', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const pdf = new Blob(['contenido'], { type: 'application/pdf' });

      descargarBlob(pdf, 'documento-adjunto');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('documento-adjunto.pdf');
    });

    it('si el nombre ya trae extensión, no la duplica', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const pdf = new Blob(['contenido'], { type: 'application/pdf' });

      descargarBlob(pdf, 'factura-real.pdf');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('factura-real.pdf');
    });

    it('con un content-type desconocido, deja el nombre tal cual', () => {
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
      const desconocido = new Blob(['contenido'], { type: 'application/octet-stream' });

      descargarBlob(desconocido, 'documento-adjunto');

      const enlace = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
      expect(enlace.download).toBe('documento-adjunto');
    });
  });
});
