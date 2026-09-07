import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';

import { ApiService } from './api.service';
import { TenantService, TenantConfig } from './tenant.service';
import { environment } from 'src/environments/environment';

// Resolución del backend al que habla la app (2026-09-07).
//
// EL BUG QUE MOTIVA ESTE ARCHIVO, reportado por Jose: tras publicar todo en Producción, el
// iPhone seguía ejecutando contra Development aunque el dispatcher devolviera Producción — y
// también con una clave recién creada que nunca había estado en Development. La causa era un
// atajo en resolveBaseUrl que, SOLO en nativo, ignoraba el dispatcher y usaba
// environment.defaultBaseUrl. Con él, la URL no dependía de la clave de empresa en absoluto:
// ninguna clave podía llevar el móvil a Producción.
//
// No había ni un test sobre esto, que es justo por lo que pudo llegar a producción sin que nada
// avisara. Estos fijan la propiedad de fondo: manda el dispatcher, en las dos plataformas.
describe('ApiService — a qué backend habla la app', () => {
  const CONFIG: TenantConfig = {
    key: 'artisoftware',
    label: 'ARTI Software',
    baseUrl: 'https://backend-de-la-empresa.example.com',
    company: 9,
    businessUnit: 1,
  };

  let service: ApiService;
  let tenant: jasmine.SpyObj<TenantService>;

  beforeEach(() => {
    tenant = jasmine.createSpyObj<TenantService>('TenantService', ['getTenantConfig']);
    TestBed.configureTestingModule({
      providers: [ApiService, { provide: TenantService, useValue: tenant }],
    });
    service = TestBed.inject(ApiService);
  });

  function resolver(): Promise<string> {
    return (service as unknown as { resolveBaseUrl(): Promise<string> }).resolveBaseUrl();
  }

  it('usa la URL que devuelve el dispatcher para esa clave de empresa', async () => {
    tenant.getTenantConfig.and.resolveTo(CONFIG);

    expect(await resolver()).toBe(CONFIG.baseUrl);
  });

  // EL TEST QUE HABRÍA CAZADO EL BUG. Antes, en nativo se devolvía environment.defaultBaseUrl
  // pasara lo que pasara, así que esto fallaba.
  it('EN MÓVIL también manda el dispatcher, no la URL por defecto', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    tenant.getTenantConfig.and.resolveTo(CONFIG);

    expect(await resolver()).toBe(CONFIG.baseUrl);
    expect(await resolver()).not.toBe(environment.defaultBaseUrl);
  });

  // Sin clave resuelta (sesión rota, o una llamada anterior a pasar por /setup) queda el
  // respaldo, para no dejar la app inutilizable.
  it('sin clave resuelta cae al respaldo del entorno', async () => {
    tenant.getTenantConfig.and.resolveTo(null);

    expect(await resolver()).toBe(environment.defaultBaseUrl.replace(/\/$/, ''));
  });

  // Un baseUrl con barra final concatenado con '/api/...' daria '//api/...', que algunos
  // backends no encaminan igual.
  it('quita la barra final del baseUrl', async () => {
    tenant.getTenantConfig.and.resolveTo({ ...CONFIG, baseUrl: 'https://con-barra.example.com/' });

    expect(await resolver()).toBe('https://con-barra.example.com');
  });
});
