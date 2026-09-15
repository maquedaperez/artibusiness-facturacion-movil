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
  let catalogos: jasmine.Spy;
  let borradores: jasmine.Spy;

  const entrar = (company: number, username = 'abraham@artisoftware.com') => {
    apiSpy.post.and.resolveTo({ token: `token-${company}-${username}`, employeeId: 7, userEmail: username } as any);
    return auth.login({ tenantKey: 'arti', company, businessUnit: 1, username, password: 'p' });
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    const tenantSpy = jasmine.createSpyObj<TenantService>('TenantService', ['getTenantConfig']);
    tenantSpy.getTenantConfig.and.resolveTo({ key: 'arti', company: 4, businessUnit: 1 } as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: TenantService, useValue: tenantSpy },
      ],
    });
    auth = TestBed.inject(AuthService);
    const limpieza = TestBed.inject(LimpiezaDeSesionService);
    catalogos = jasmine.createSpy('catalogos');
    borradores = jasmine.createSpy('borradores');
    limpieza.registrar(catalogos);
    limpieza.registrarSoloAlCambiarDeEmpresa(borradores);
  });

  afterEach(() => {
    localStorage.removeItem('arti_access_token');
    localStorage.removeItem('arti_user');
    localStorage.removeItem('arti_employee_id');
    localStorage.removeItem('arti_session_expiry');
  });

  it('cerrar sesión tira los catálogos, no los borradores sin guardar', async () => {
    await entrar(9);
    catalogos.calls.reset();

    auth.logout();

    expect(catalogos).toHaveBeenCalled();
    expect(borradores).not.toHaveBeenCalled();
  });

  it('salir y volver a la misma empresa conserva los borradores sin guardar', async () => {
    await entrar(9);
    auth.logout();

    await entrar(9);

    expect(borradores).not.toHaveBeenCalled();
  });

  // EL CASO DE LA DEMO (2026-09-14): de ARTI Software (9) a la empresa demo (4).
  it('salir y entrar en otra empresa tira los borradores de la anterior', async () => {
    await entrar(9);
    auth.logout();

    await entrar(4);

    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('entrar en otra empresa sin haber cerrado sesión también los tira', async () => {
    await entrar(9);

    await entrar(4);

    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('la limpieza se hace antes de guardar el token nuevo', async () => {
    await entrar(9);
    let tokenAlLimpiar = null as string | null;
    catalogos.and.callFake(() => { tokenAlLimpiar = localStorage.getItem('arti_access_token'); });

    await entrar(4);

    expect(tokenAlLimpiar).toBe('token-9-abraham@artisoftware.com');
    expect(localStorage.getItem('arti_access_token')).toBe('token-4-abraham@artisoftware.com');
  });

  it('entrar con el código MFA en otra empresa también tira los borradores', async () => {
    await entrar(9);
    auth.logout();
    apiSpy.post.and.resolveTo({ token: 'token-mfa', employeeId: 7, userEmail: 'abraham@artisoftware.com' } as any);

    await auth.verifyMfaCode('reto', '123456', 'abraham@artisoftware.com');

    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('un login que pide MFA todavía no limpia nada: la sesión nueva aún no ha empezado', async () => {
    apiSpy.post.and.resolveTo({ challengeId: 'reto', maskedEmail: 'a***@artisoftware.com' } as any);

    await auth.login({ tenantKey: 'arti', company: 4, businessUnit: 1, username: 'u', password: 'p' });

    expect(catalogos).not.toHaveBeenCalled();
    expect(borradores).not.toHaveBeenCalled();
  });
});
