import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { LoadingController } from '@ionic/angular/standalone';

import { PLAZOS_DE_ESPERA, conEsperaDelServicioFiscal } from './espera-del-servicio-fiscal';

describe('conEsperaDelServicioFiscal', () => {
  const textos = { inicial: 'Contabilizando…', lento: 'La primera tarda un poco más…', casiListo: 'Ya casi está…' };

  let aviso: { message: string; present: jasmine.Spy; dismiss: jasmine.Spy };
  let loadingCtrl: jasmine.SpyObj<LoadingController>;

  beforeEach(() => {
    aviso = {
      message: '',
      present: jasmine.createSpy('present').and.resolveTo(),
      dismiss: jasmine.createSpy('dismiss').and.resolveTo(true),
    };
    loadingCtrl = jasmine.createSpyObj<LoadingController>('LoadingController', ['create']);
    loadingCtrl.create.and.callFake(async (opciones?: { message?: string }) => {
      aviso.message = (opciones?.message as string) ?? '';
      return aviso as unknown as HTMLIonLoadingElement;
    });
  });

  // Una operación que no termina hasta que el test lo decide, para poder mirar la pantalla a mitad.
  function operacionControlada<T>() {
    let terminar!: (valor: T) => void;
    let fallar!: (motivo: unknown) => void;
    const promesa = new Promise<T>((resolve, reject) => { terminar = resolve; fallar = reject; });
    return { promesa, terminar, fallar };
  }

  it('enseña la espera con el texto de la operación y la quita al terminar', fakeAsync(() => {
    let resultado: string | undefined;
    conEsperaDelServicioFiscal(loadingCtrl, textos, async () => 'contabilizada').then(r => (resultado = r));
    flushMicrotasks();

    expect(aviso.present).toHaveBeenCalled();
    expect(loadingCtrl.create.calls.mostRecent().args[0]?.message).toBe('Contabilizando…');
    expect(resultado).toBe('contabilizada');
    expect(aviso.dismiss).toHaveBeenCalled();
  }));

  // Lo que evita que se piense que la app se ha colgado: si tarda, explica por qué.
  it('si tarda, cambia el texto para explicar que la primera del día tarda más', fakeAsync(() => {
    const op = operacionControlada<void>();
    conEsperaDelServicioFiscal(loadingCtrl, textos, () => op.promesa);
    flushMicrotasks();

    tick(PLAZOS_DE_ESPERA.lento - 1);
    expect(aviso.message).toBe('Contabilizando…');

    tick(1);
    expect(aviso.message).toBe('La primera tarda un poco más…');

    tick(PLAZOS_DE_ESPERA.casiListo - PLAZOS_DE_ESPERA.lento);
    expect(aviso.message).toBe('Ya casi está…');

    op.terminar();
    flushMicrotasks();
    expect(aviso.dismiss).toHaveBeenCalled();
  }));

  it('una operación rápida no llega a cambiar el texto, ni después de terminar', fakeAsync(() => {
    conEsperaDelServicioFiscal(loadingCtrl, textos, async () => undefined);
    flushMicrotasks();

    tick(PLAZOS_DE_ESPERA.casiListo * 2);
    expect(aviso.message).toBe('Contabilizando…');
  }));

  it('quita la espera también si la operación falla, y deja pasar el error', fakeAsync(() => {
    const op = operacionControlada<void>();
    let error: unknown;
    conEsperaDelServicioFiscal(loadingCtrl, textos, () => op.promesa).catch(e => (error = e));
    flushMicrotasks();

    op.fallar(new Error('HTTP 500'));
    flushMicrotasks();

    expect((error as Error).message).toBe('HTTP 500');
    expect(aviso.dismiss).toHaveBeenCalled();
    tick(PLAZOS_DE_ESPERA.casiListo * 2);
    expect(aviso.message).toBe('Contabilizando…');
  }));

  // Con la cobertura perdida a mitad, la petición puede quedarse colgada mucho rato: la pantalla que
  // bloquea todo no puede dejar al usuario atrapado. La operación sigue y su resultado llega igual.
  it('si pasa demasiado tiempo, quita la espera para no dejar a nadie atrapado, y la operación sigue', fakeAsync(() => {
    const op = operacionControlada<string>();
    let resultado: string | undefined;
    conEsperaDelServicioFiscal<string>(loadingCtrl, textos, () => op.promesa).then(r => (resultado = r));
    flushMicrotasks();

    tick(PLAZOS_DE_ESPERA.maximo - 1);
    expect(aviso.dismiss).not.toHaveBeenCalled();

    tick(1);
    expect(aviso.dismiss).toHaveBeenCalled();
    expect(resultado).toBeUndefined();

    op.terminar('contabilizada');
    flushMicrotasks();
    expect(resultado).toBe('contabilizada');
  }));

  // El tope de seguridad tiene que quedar por encima de lo que espera la API a FacturaE (150 s):
  // si no, se quitaría la espera en el caso normal de la primera factura del día.
  it('el tope de seguridad no corta la espera normal de la primera factura del día', () => {
    expect(PLAZOS_DE_ESPERA.maximo).toBeGreaterThan(150_000);
  });

  // Un adorno no puede impedir contabilizar.
  it('si la pantalla de espera no se puede abrir, la operación se hace igual', fakeAsync(() => {
    loadingCtrl.create.and.rejectWith(new Error('overlay no disponible'));
    const operacion = jasmine.createSpy('operacion').and.resolveTo('contabilizada');
    let resultado: string | undefined;

    conEsperaDelServicioFiscal<string>(loadingCtrl, textos, operacion).then(r => (resultado = r));
    flushMicrotasks();

    expect(operacion).toHaveBeenCalled();
    expect(resultado).toBe('contabilizada');
  }));
});
