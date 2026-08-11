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
});
