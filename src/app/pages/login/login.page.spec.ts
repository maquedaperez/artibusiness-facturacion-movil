import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { LoginPage } from './login.page';
import { AuthService } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;

  const CONFIG = { key: 'demo', label: 'DEMO', baseUrl: 'https://api.test', company: 4, businessUnit: 1 };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage, RouterTestingModule],
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Pedido por Abraham (2026-09-16): igual que en la web, poder mirar lo que se ha escrito.
  describe('ver la contraseña', () => {
    it('empieza oculta y el ojo la alterna', () => {
      expect(component.verContrasena).toBeFalse();

      component.alternarVerContrasena();
      expect(component.verContrasena).toBeTrue();

      component.alternarVerContrasena();
      expect(component.verContrasena).toBeFalse();
    });
  });

  describe('doble pulsación en Entrar', () => {
    beforeEach(() => {
      spyOn(TestBed.inject(TenantService), 'getTenantConfig').and.resolveTo(CONFIG);
      spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
      component.form.setValue({ username: 'demo', password: '1234' });
    });

    // El botón no tenía [disabled] ni bandera: cada toque lanzaba su propio login.
    it('dos envíos seguidos solo mandan una petición', async () => {
      const loginSpy = spyOn(TestBed.inject(AuthService), 'login').and.callFake(
        () => new Promise(resolve => setTimeout(() => resolve({ mfa: false } as any), 20)));

      const primera = component.submit();
      await component.submit();
      await primera;

      expect(loginSpy).toHaveBeenCalledTimes(1);
      expect(component.entrando).toBeFalse();
    });

    // Si el servidor rechaza las credenciales, el formulario tiene que volver a estar
    // operativo: si no, hace falta cerrar y abrir la app para reintentar.
    it('tras un error, se puede volver a intentar', async () => {
      const loginSpy = spyOn(TestBed.inject(AuthService), 'login').and.rejectWith(new Error('401 Unauthorized'));

      await component.submit();

      expect(component.entrando).toBeFalse();
      expect(component.errorMsg).toBeTruthy();

      await component.submit();
      expect(loginSpy).toHaveBeenCalledTimes(2);
    });

    it('con el formulario incompleto no llama al servidor', async () => {
      const loginSpy = spyOn(TestBed.inject(AuthService), 'login');
      component.form.setValue({ username: '', password: '' });

      await component.submit();

      expect(loginSpy).not.toHaveBeenCalled();
      expect(component.entrando).toBeFalse();
    });
  });
});
