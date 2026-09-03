import { TestBed } from '@angular/core/testing';
import { AlertController, provideIonicAngular } from '@ionic/angular/standalone';

import { pedirConfirmacion } from './confirmacion';

// Bug real encontrado probando la app (2026-09-03): el diálogo de "Contabilizar factura" se
// quedaba en pantalla mientras el botón de abajo ya decía "Contabilizando…". La causa está en
// Ionic, que ESPERA al handler del botón antes de cerrar el overlay:
//
//     await this.callButtonHandler(t) ? this.dismiss(...) : Promise.resolve()
//
// Con acciones fiscales (FacturaE + AEAT) eso son varios segundos con el usuario mirando un
// diálogo que parece colgado. Estos tests fijan la propiedad que lo evita.
describe('pedirConfirmacion', () => {
  let alertCtrl: AlertController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    alertCtrl = TestBed.inject(AlertController);
  });

  function opciones() {
    return { header: 'Contabilizar', textoConfirmar: 'Sí', textoCancelar: 'No' };
  }

  // LA propiedad que corrige el bug: ningún botón lleva handler, así que Ionic no tiene nada
  // que esperar y cierra el diálogo de inmediato.
  it('ningún botón lleva handler, para que Ionic no retrase el cierre', async () => {
    let opcionesRecibidas: any;
    spyOn(alertCtrl, 'create').and.callFake(async (o: any) => {
      opcionesRecibidas = o;
      return { present: async () => {}, onDidDismiss: async () => ({ role: 'cancel' }) } as any;
    });

    await pedirConfirmacion(alertCtrl, opciones());

    expect(opcionesRecibidas.buttons.length).toBe(2);
    for (const boton of opcionesRecibidas.buttons) {
      expect(boton.handler).toBeUndefined();
    }
  });

  it('confirma cuando se pulsa el botón de confirmar', async () => {
    spyOn(alertCtrl, 'create').and.resolveTo({
      present: async () => {}, onDidDismiss: async () => ({ role: 'confirmar' }),
    } as any);

    const { confirmado } = await pedirConfirmacion(alertCtrl, opciones());

    expect(confirmado).toBeTrue();
  });

  it('un rol destructivo (eliminar, anular) también confirma', async () => {
    spyOn(alertCtrl, 'create').and.resolveTo({
      present: async () => {}, onDidDismiss: async () => ({ role: 'destructive' }),
    } as any);

    const { confirmado } = await pedirConfirmacion(alertCtrl, { ...opciones(), rolConfirmar: 'destructive' });

    expect(confirmado).toBeTrue();
  });

  it('no confirma al cancelar', async () => {
    spyOn(alertCtrl, 'create').and.resolveTo({
      present: async () => {}, onDidDismiss: async () => ({ role: 'cancel' }),
    } as any);

    const { confirmado } = await pedirConfirmacion(alertCtrl, opciones());

    expect(confirmado).toBeFalse();
  });

  // Cerrar tocando fuera o con Escape llega como 'backdrop': ante la duda, no se hace nada.
  it('cerrar el diálogo sin elegir no cuenta como confirmar', async () => {
    spyOn(alertCtrl, 'create').and.resolveTo({
      present: async () => {}, onDidDismiss: async () => ({ role: 'backdrop' }),
    } as any);

    const { confirmado } = await pedirConfirmacion(alertCtrl, opciones());

    expect(confirmado).toBeFalse();
  });

  it('devuelve la opción elegida cuando el diálogo tiene opciones', async () => {
    spyOn(alertCtrl, 'create').and.resolveTo({
      present: async () => {},
      onDidDismiss: async () => ({ role: 'confirmar', data: { values: 'BIZUM' } }),
    } as any);

    const { confirmado, valor } = await pedirConfirmacion<string>(alertCtrl, {
      ...opciones(),
      inputs: [{ type: 'radio', label: 'Bizum', value: 'BIZUM' }],
    });

    expect(confirmado).toBeTrue();
    expect(valor).toBe('BIZUM');
  });

  // Si se cancela, lo que hubiera preseleccionado da igual: nadie debe actuar sobre ello.
  it('al cancelar no devuelve ningún valor', async () => {
    spyOn(alertCtrl, 'create').and.resolveTo({
      present: async () => {},
      onDidDismiss: async () => ({ role: 'cancel', data: { values: 'BIZUM' } }),
    } as any);

    const { valor } = await pedirConfirmacion<string>(alertCtrl, opciones());

    expect(valor).toBeUndefined();
  });
});
