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

  // El desvio por el proxy de Netlify en el despliegue de la rama de pruebas (2026-09-07).
  //
  // Los App Service tienen una lista blanca de CORS que no incluye https://pruebas--..., asi que
  // desde ahi el navegador corta hasta el login. Reenviando por el propio origen no hay CORS.
  //
  // Lo que de verdad importa de estos tests no es que el desvio funcione, sino que NO SE ACTIVE
  // en ningun otro sitio: si se colara en produccion, todo el trafico real pasaria por un proxy
  // que solo existe para probar.
  // Qué mensaje se saca del cuerpo de error del backend (2026-09-11).
  //
  // El caso es literal: lo capturó Abraham en la demo al firmar. El backend envuelve el fallo
  // de FacturaE en { error, detalle }, y el motivo de verdad viaja DENTRO de 'detalle', en un
  // JSON escapado. Antes se tiraba entero y quedaba solo el envoltorio de arriba, que se limita
  // a repetir la acción que ha fallado.
  describe('mensaje de error del backend', () => {
    function extraer(valor: unknown): string | null {
      return (service as unknown as { extraerMensajeDeJson(v: unknown): string | null }).extraerMensajeDeJson(valor);
    }

    it('saca el motivo real de dentro de detalle, no el envoltorio', () => {
      const cuerpo = {
        error: 'FacturaE no pudo firmar la factura.',
        detalle: 'FacturaE respondió 409 Conflict: {\"error\":\"El XML del lote (Id=229) no coincide con el registro fiscal de la factura \'ART60\'.\"}',
      };

      expect(extraer(cuerpo)).toBe("El XML del lote (Id=229) no coincide con el registro fiscal de la factura 'ART60'.");
    });

    it('si detalle es prosa, se añade al mensaje en vez de buscarle JSON', () => {
      const cuerpo = { error: 'No se pudo generar el documento.', detalle: 'El proveedor no tiene dirección.' };

      expect(extraer(cuerpo)).toBe('No se pudo generar el documento.: El proveedor no tiene dirección.');
    });

    it('si de detalle no se puede sacar nada, queda el error de arriba', () => {
      const cuerpo = { error: 'FacturaE no pudo firmar la factura.', detalle: '{\"vacio\":true}' };

      expect(extraer(cuerpo)).toBe('FacturaE no pudo firmar la factura.');
    });
  });

  describe('proxy de la rama de pruebas', () => {
    const DEV = 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net';
    const PRO = 'https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net';
    const HOST_PRUEBAS = 'pruebas--artibusiness-facturacion.netlify.app';

    function desviar(baseUrl: string, hostname: string): string {
      return (service as unknown as {
        baseUrlDePruebas(b: string, h: string): string;
      }).baseUrlDePruebas(baseUrl, hostname);
    }

    it('en la URL de pruebas, Development va por su proxy', () => {
      expect(desviar(DEV, HOST_PRUEBAS)).toBe('/be-dev');
    });

    // El nombre de Development CONTIENE el de produccion como prefijo. Si el orden de las
    // comprobaciones se invirtiera, una prueba acabaria hablando con el backend real.
    it('en la URL de pruebas, Producción va por el SUYO, no por el de Development', () => {
      expect(desviar(PRO, HOST_PRUEBAS)).toBe('/be-pro');
    });

    it('en producción NO se desvía nada', () => {
      expect(desviar(DEV, 'artibusiness-facturacion.netlify.app')).toBe(DEV);
      expect(desviar(PRO, 'artibusiness-facturacion.netlify.app')).toBe(PRO);
    });

    it('en local NO se desvía nada', () => {
      expect(desviar(DEV, 'localhost')).toBe(DEV);
    });

    // En nativo no hay CORS que esquivar y 'location' no significa lo mismo: se sale antes.
    it('en móvil NO se desvía nada, aunque el host lo pareciera', () => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);

      expect(desviar(DEV, HOST_PRUEBAS)).toBe(DEV);
    });

    // El dispatcher puede devolver el backend de otra empresa. No lo conocemos, no hay proxy
    // para el: se deja pasar tal cual en vez de mandarlo a un prefijo que no existe.
    it('un backend desconocido se deja pasar directo', () => {
      expect(desviar('https://otro-backend.example.com', HOST_PRUEBAS)).toBe('https://otro-backend.example.com');
    });
  });
});
