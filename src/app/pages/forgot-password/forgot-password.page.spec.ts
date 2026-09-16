import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ToastController } from '@ionic/angular/standalone';
import { ForgotPasswordPage } from './forgot-password.page';
import { AuthService } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('ForgotPasswordPage', () => {
  let component: ForgotPasswordPage;
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let toastSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPasswordPage, RouterTestingModule],
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(ForgotPasswordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    toastSpy = spyOn(TestBed.inject(ToastController), 'create').and.resolveTo({ present: async () => {} } as any);
    spyOn(TestBed.inject(TenantService), 'getTenantKey').and.resolveTo('demo');
    component.form.setValue({ identifier: 'usuario@artisoftware.com' });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Era el único sitio de la app con el alert() del navegador (un cuadro del sistema con el
  // dominio escrito encima, que no se parece a ningún otro aviso de la aplicación).
  it('avisa con un toast, no con el alert del navegador', async () => {
    const alertSpy = spyOn(window, 'alert');
    spyOn(TestBed.inject(AuthService), 'forgotPassword').and.resolveTo({ ok: true });

    await component.submit();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'success' }));
  });

  it('si falla, el aviso es rojo y se puede reintentar', async () => {
    const enviarSpy = spyOn(TestBed.inject(AuthService), 'forgotPassword').and.rejectWith(new Error('500'));

    await component.submit();

    expect(toastSpy).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'danger' }));
    expect(component.enviando).toBeFalse();

    await component.submit();
    expect(enviarSpy).toHaveBeenCalledTimes(2);
  });

  it('dos envíos seguidos solo mandan una petición', async () => {
    const enviarSpy = spyOn(TestBed.inject(AuthService), 'forgotPassword').and.callFake(
      () => new Promise<{ ok: true }>(resolve => setTimeout(() => resolve({ ok: true }), 20)));

    const primera = component.submit();
    await component.submit();
    await primera;

    expect(enviarSpy).toHaveBeenCalledTimes(1);
    expect(component.enviando).toBeFalse();
  });
});
