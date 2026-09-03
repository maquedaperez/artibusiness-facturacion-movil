import { TestBed } from '@angular/core/testing';
import { AlertController, provideIonicAngular } from '@ionic/angular/standalone';

import { pedirConfirmacion } from './confirmacion';

// Prueba con un overlay REAL de Ionic, no con un espia de alertCtrl.create (2026-09-03).
// Todos los tests de este helper falseaban el controlador, asi que ninguno llegaba a montar un
// ion-alert de verdad: una regresion que rompiera el ciclo presentar -> pulsar -> cerrar pasaba
// invisible. Contabilizar dejo de funcionar en toda la app y la suite seguia en verde.
describe('pedirConfirmacion contra un ion-alert real', () => {
  let alertCtrl: AlertController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    alertCtrl = TestBed.inject(AlertController);
  });

  async function esperarAlAlerta(): Promise<HTMLElement> {
    for (let intento = 0; intento < 100; intento++) {
      const el = document.querySelector('ion-alert');
      if (el) {
        await (el as any).componentOnReady?.();
        return el as HTMLElement;
      }
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('el ion-alert nunca llego a aparecer en el DOM');
  }

  it('pulsar Confirmar resuelve la promesa con confirmado=true', async () => {
    const promesa = pedirConfirmacion(alertCtrl, {
      header: 'Contabilizar', textoConfirmar: 'Si', textoCancelar: 'No',
    });

    const alerta = await esperarAlAlerta();
    const botones = alerta.querySelectorAll<HTMLElement>('button.alert-button');
    expect(botones.length).withContext('el alert debe pintar sus dos botones').toBe(2);

    botones[1].click();

    const resultado = await promesa;
    expect(resultado.confirmado).toBeTrue();
  });

  it('pulsar Cancelar resuelve con confirmado=false', async () => {
    const promesa = pedirConfirmacion(alertCtrl, {
      header: 'Contabilizar', textoConfirmar: 'Si', textoCancelar: 'No',
    });

    const alerta = await esperarAlAlerta();
    alerta.querySelectorAll<HTMLElement>('button.alert-button')[0].click();

    const resultado = await promesa;
    expect(resultado.confirmado).toBeFalse();
  });
});
