import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemoBannerComponent } from './demo-banner.component';
import { TenantService } from '../../services/tenant.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

// El cartel de "Modo demo: entorno de pruebas" (2026-09-07).
//
// Hasta hoy estaba FIJO: se pintaba en cinco pantallas pasara lo que pasara. Mientras la app solo
// hablaba con Development daba igual, pero en cuanto paso a apuntar a Produccion significaba un
// cliente real —y el revisor de Apple— leyendo que sus facturas, las que se registran en la AEAT
// de verdad, son simuladas.
//
// Equivocarse aqui duele en las dos direcciones: enseñarlo en produccion asusta a un cliente;
// ocultarlo en pruebas deja a alguien emitiendo contra la AEAT sin saberlo. De ahi los dos tests.
describe('DemoBannerComponent', () => {
  let fixture: ComponentFixture<DemoBannerComponent>;
  let tenant: jasmine.SpyObj<TenantService>;

  beforeEach(async () => {
    tenant = jasmine.createSpyObj<TenantService>('TenantService', ['esEntornoDePruebas']);
    await TestBed.configureTestingModule({
      imports: [DemoBannerComponent],
      providers: [...provideTranslocoTesting(), { provide: TenantService, useValue: tenant }],
    }).compileComponents();
    fixture = TestBed.createComponent(DemoBannerComponent);
  });

  async function pintar(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('se ve cuando el backend es de pruebas', async () => {
    tenant.esEntornoDePruebas.and.resolveTo(true);

    expect((await pintar()).querySelector('ion-chip')).not.toBeNull();
  });

  it('NO se ve cuando el backend es de producción', async () => {
    tenant.esEntornoDePruebas.and.resolveTo(false);

    expect((await pintar()).querySelector('ion-chip')).toBeNull();
  });

  // Arranca visible: hasta que se resuelve, es mas seguro avisar de mas.
  it('mientras no se sabe, se ve', () => {
    tenant.esEntornoDePruebas.and.returnValue(new Promise(() => { /* nunca resuelve */ }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('ion-chip')).not.toBeNull();
  });
});
