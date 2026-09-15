import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { TenantService } from './tenant.service';
import { LimpiezaDeSesionService } from './limpieza-de-sesion.service';

// Cambio de empresa (2026-09-15): lo que había en memoria de una sesión no puede pasar a la
// siguiente. Ver LimpiezaDeSesionService.
describe('AuthService — la sesión nueva no hereda la memoria de la anterior', () => {
  let auth: AuthService;
  let apiSpy: jasmine.SpyObj<ApiService>;
  let limpiar: jasmine.Spy;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    const tenantSpy = jasmine.createSpyObj<TenantService>('TenantService', ['getTenantConfig']);
    tenantSpy.getTenantConfig.and.resolveTo({ key: 'demo', company: 4, businessUnit: 1 } as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: TenantService, useValue: tenantSpy },
      ],
    });
    auth = TestBed.inject(AuthService);
    limpiar = spyOn(TestBed.inject(LimpiezaDeSesionService), 'limpiar');
  });

  afterEach(() => {
    localStorage.removeItem('arti_access_token');
    localStorage.removeItem('arti_user');
    localStorage.removeItem('arti_employee_id');
    localStorage.removeItem('arti_session_expiry');
  });

  it('cerrar sesión limpia lo que había en memoria', () => {
    auth.logout();

    expect(limpiar).toHaveBeenCalled();
  });

  // Entrar con otro usuario o en otra empresa sin haber pasado por logout() también cuenta.
  it('entrar con usuario y contraseña limpia antes de guardar el token nuevo', async () => {
    let tokenAlLimpiar: string | null = 'sin llamar';
    limpiar.and.callFake(() => { tokenAlLimpiar = localStorage.getItem('arti_access_token'); });
    localStorage.setItem('arti_access_token', 'token-empresa-9');
    apiSpy.post.and.resolveTo({ token: 'token-empresa-4', employeeId: 7 } as any);

    await auth.login({ tenantKey: 'demo', company: 4, businessUnit: 1, username: 'u', password: 'p' });

    expect(tokenAlLimpiar).toBe('token-empresa-9');
    expect(localStorage.getItem('arti_access_token')).toBe('token-empresa-4');
  });

  it('entrar con el código MFA también limpia', async () => {
    apiSpy.post.and.resolveTo({ token: 'token-mfa', employeeId: 7 } as any);

    await auth.verifyMfaCode('reto', '123456', 'u');

    expect(limpiar).toHaveBeenCalled();
  });

  it('un login que pide MFA todavía no limpia: la sesión nueva aún no ha empezado', async () => {
    apiSpy.post.and.resolveTo({ challengeId: 'reto', maskedEmail: 'u***@x.com' } as any);

    await auth.login({ tenantKey: 'demo', company: 4, businessUnit: 1, username: 'u', password: 'p' });

    expect(limpiar).not.toHaveBeenCalled();
  });
});
