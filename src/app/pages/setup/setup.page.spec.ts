import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { SetupPage } from './setup.page';
import { TenantService } from '../../services/tenant.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('SetupPage', () => {
  let component: SetupPage;
  let fixture: ComponentFixture<SetupPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SetupPage, RouterTestingModule],
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(SetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('comprobación de la clave', () => {
    beforeEach(() => {
      component.form.setValue({ tenantKey: 'demo' });
    });

    // La bandera 'loading' existía y funcionaba, pero la plantilla no la usaba: el usuario no
    // veía nada mientras se consultaba el dispatcher, que es la llamada más lenta del arranque.
    it('deja loading en false al terminar y no admite dos envíos a la vez', async () => {
      const validarSpy = spyOn(TestBed.inject(TenantService), 'isTenantKeyValid').and.callFake(
        () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 20)));
      spyOn(TestBed.inject(TenantService), 'setTenantKey').and.resolveTo();
      spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);

      const primera = component.submit();
      await component.submit();
      await primera;

      expect(validarSpy).toHaveBeenCalledTimes(1);
      expect(component.loading).toBeFalse();
    });

    // errorMsg se calculaba y no se pintaba: ahora la plantilla lo muestra, así que el caso
    // queda fijado aquí.
    it('si el dispatcher falla, deja el motivo en errorMsg y se puede reintentar', async () => {
      spyOn(TestBed.inject(TenantService), 'isTenantKeyValid').and.rejectWith(new Error('sin conexión'));

      await component.submit();

      expect(component.errorMsg).toBeTruthy();
      expect(component.loading).toBeFalse();
      expect(component.invalidTenant).toBeFalse();
    });

    it('una clave que el dispatcher no reconoce marca invalidTenant, no error de servidor', async () => {
      spyOn(TestBed.inject(TenantService), 'isTenantKeyValid').and.resolveTo(false);

      await component.submit();

      expect(component.invalidTenant).toBeTrue();
      expect(component.errorMsg).toBe('');
      expect(component.loading).toBeFalse();
    });
  });
});
