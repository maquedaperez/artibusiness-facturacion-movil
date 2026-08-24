import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { provideTranslocoTesting } from './testing/transloco-testing.providers';

// Se prueba contra los JSON REALES servidos desde src/assets/i18n/ (angular.json ya los expone
// también bajo el builder "test", no solo "build" — ver angular.json:106-120) en vez de contra
// una copia importada en el propio test: así una divergencia entre lo que se sirve de verdad y
// lo que "debería" servirse se detecta igual.
type Traduccion = Record<string, unknown>;

// Sin flatMap a propósito: el "lib" de tsconfig.json de este proyecto es ["es2018", "dom"]
// (sin ES2019), y cambiarlo es una decisión de alcance más amplio que este test — se acumula
// con un array normal en su lugar.
function clavesPlanas(obj: Traduccion, prefijo = ''): string[] {
  const resultado: string[] = [];
  for (const [clave, valor] of Object.entries(obj)) {
    const clavePlana = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor !== null && typeof valor === 'object') {
      resultado.push(...clavesPlanas(valor as Traduccion, clavePlana));
    } else {
      resultado.push(clavePlana);
    }
  }
  return resultado;
}

function valoresVacios(obj: Traduccion, prefijo = ''): string[] {
  const resultado: string[] = [];
  for (const [clave, valor] of Object.entries(obj)) {
    const clavePlana = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor !== null && typeof valor === 'object') {
      resultado.push(...valoresVacios(valor as Traduccion, clavePlana));
    } else if (typeof valor === 'string' && valor.trim() === '') {
      resultado.push(clavePlana);
    }
  }
  return resultado;
}

describe('Ficheros de traducción reales (src/assets/i18n)', () => {
  let http: HttpClient;
  let es: Traduccion;
  let en: Traduccion;
  let uk: Traduccion;

  beforeAll(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    http = TestBed.inject(HttpClient);

    [es, en, uk] = await Promise.all([
      firstValueFrom(http.get<Traduccion>('/assets/i18n/es.json')),
      firstValueFrom(http.get<Traduccion>('/assets/i18n/en.json')),
      firstValueFrom(http.get<Traduccion>('/assets/i18n/uk.json')),
    ]);
  });

  it('los tres ficheros existen y son JSON válido con contenido', () => {
    expect(es).toBeTruthy();
    expect(en).toBeTruthy();
    expect(uk).toBeTruthy();
  });

  it('en.json tiene EXACTAMENTE las mismas claves que es.json (sin faltar ni sobrar ninguna)', () => {
    expect(clavesPlanas(en).sort()).toEqual(clavesPlanas(es).sort());
  });

  it('uk.json tiene EXACTAMENTE las mismas claves que es.json (sin faltar ni sobrar ninguna)', () => {
    expect(clavesPlanas(uk).sort()).toEqual(clavesPlanas(es).sort());
  });

  it('ningún idioma tiene una clave con valor vacío ("")', () => {
    expect(valoresVacios(es)).toEqual([]);
    expect(valoresVacios(en)).toEqual([]);
    expect(valoresVacios(uk)).toEqual([]);
  });

  it('ningún valor es un placeholder sin traducir (TODO/TRANSLATE/FIXME)', () => {
    const patronPendiente = /\b(TODO|TRANSLATE|FIXME)\b/i;
    for (const [nombre, json] of [['es', es], ['en', en], ['uk', uk]] as const) {
      const pendientes = clavesPlanas(json).filter(clave => {
        const partes = clave.split('.');
        let valor: unknown = json;
        for (const parte of partes) valor = (valor as Traduccion)[parte];
        return typeof valor === 'string' && patronPendiente.test(valor);
      });
      expect(pendientes).toEqual([], `${nombre}.json tiene valores pendientes de traducir: ${pendientes.join(', ')}`);
    }
  });
});

describe('Comportamiento de Transloco ante una clave inexistente', () => {
  it('no lanza excepción y devuelve un valor controlado (no undefined/null)', () => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTranslocoTesting({ es: { perfil: { titulo: 'Perfil' } } }),
      ],
    });
    const transloco = TestBed.inject(TranslocoService);

    let resultado: unknown;
    expect(() => { resultado = transloco.translate('profile.claveQueNoExiste'); }).not.toThrow();
    expect(resultado).not.toBeUndefined();
    expect(resultado).not.toBeNull();
  });
});
