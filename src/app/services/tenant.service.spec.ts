import { TestBed } from '@angular/core/testing';

import { TenantService, TenantConfig } from './tenant.service';

// Decidir si el backend resuelto es de PRUEBAS o de PRODUCCIÓN (2026-09-07). De esto depende que
// se enseñe o no el cartel de "Modo demo", así que equivocarse duele en las dos direcciones:
// enseñarlo en producción asusta a un cliente real; ocultarlo en pruebas deja a alguien emitiendo
// contra la AEAT de verdad sin enterarse.
//
// Se decide por la URL que resuelve el dispatcher, NO por environment.production: la misma build
// de producción puede acabar en un sitio o en otro según la clave de empresa.
describe('TenantService — es un entorno de pruebas?', () => {
  let service: TenantService;

  const CONFIG = (baseUrl: string): TenantConfig =>
    ({ key: 'k', label: 'K', baseUrl, company: 9, businessUnit: 1 });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TenantService] });
    service = TestBed.inject(TenantService);
  });

  it('el backend de producción NO es entorno de pruebas', async () => {
    spyOn(service, 'getTenantConfig').and.resolveTo(
      CONFIG('https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net'));

    expect(await service.esEntornoDePruebas()).toBeFalse();
  });

  it('el backend de development SÍ lo es', async () => {
    spyOn(service, 'getTenantConfig').and.resolveTo(
      CONFIG('https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net'));

    expect(await service.esEntornoDePruebas()).toBeTrue();
  });

  it('no le afecta que la URL venga en mayúsculas', async () => {
    spyOn(service, 'getTenantConfig').and.resolveTo(CONFIG('https://WEBAPIARTIBUSINESSDEVELOPMENT.example.net'));

    expect(await service.esEntornoDePruebas()).toBeTrue();
  });

  // Sin configuración resuelta se asume pruebas: vale más un cartel de más que dejar a alguien
  // creyendo que está en un entorno seguro cuando podría estar emitiendo de verdad.
  it('sin configuración resuelta, se asume que SÍ', async () => {
    spyOn(service, 'getTenantConfig').and.resolveTo(null);

    expect(await service.esEntornoDePruebas()).toBeTrue();
  });
});
