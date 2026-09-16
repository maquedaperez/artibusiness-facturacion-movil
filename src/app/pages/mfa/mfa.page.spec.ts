import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { MfaPage } from './mfa.page';
import { AuthService } from '../../services/auth.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('MfaPage', () => {
  let component: MfaPage;
  let fixture: ComponentFixture<MfaPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MfaPage, RouterTestingModule],
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(MfaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // El componente arranca un setInterval en el constructor; destruirlo lo para.
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('código en vuelo', () => {
    beforeEach(() => {
      component.form.setValue({ code: '123456' });
    });

    // Sin bandera, cada toque mandaba su propia comprobación del mismo código.
    it('dos envíos seguidos solo comprueban el código una vez', async () => {
      const verificarSpy = spyOn(TestBed.inject(AuthService), 'verifyMfaCode').and.callFake(
        () => new Promise<void>(resolve => setTimeout(resolve, 20)));
      spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);

      const primera = component.submit();
      await component.submit();
      await primera;

      expect(verificarSpy).toHaveBeenCalledTimes(1);
      expect(component.verificando).toBeFalse();
    });

    // Reenviar mientras se comprueba invalidaría el código que se está verificando.
    it('no se puede reenviar mientras se comprueba un código', async () => {
      const reenviarSpy = spyOn(TestBed.inject(AuthService), 'resendMfaCode');
      component.verificando = true;

      await component.resend();

      expect(reenviarSpy).not.toHaveBeenCalled();
      component.verificando = false;
    });

    it('tras un código incorrecto se puede reintentar', async () => {
      const verificarSpy = spyOn(TestBed.inject(AuthService), 'verifyMfaCode').and.rejectWith(new Error('400'));

      await component.submit();

      expect(component.verificando).toBeFalse();
      expect(component.errorMsg).toBeTruthy();

      await component.submit();
      expect(verificarSpy).toHaveBeenCalledTimes(2);
    });
  });
});
