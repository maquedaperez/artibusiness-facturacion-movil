import { TestBed } from '@angular/core/testing';

import { HttpIssuedInvoicesRepository } from './issued-invoices.repository.http';
import { MockIssuedInvoicesRepository } from '../mock/issued-invoices.repository.mock';
import { MockFacturasService } from '../../../services/mock-facturas.service';
import { ApiService } from '../../../services/api.service';
import { provideTranslocoTesting } from '../../i18n/testing/transloco-testing.providers';

const TRADUCCIONES_TEST = {
  es: {
    invoices: {
      issued: {
        errors: {
          clientRequired: 'Selecciona el cliente de la lista antes de guardar — no se puede guardar una factura solo con el nombre en texto.',
          paymentMethodRequired: 'Selecciona una forma de pago del catálogo antes de guardar.',
          lineRequired: 'La factura necesita al menos una línea.',
        },
      },
    },
    verifactu: {
      errors: {
        anularBorrador: 'Esta factura todavía no se ha contabilizado — no se puede anular.',
        firmarBorrador: 'Esta factura todavía no se ha guardado ni contabilizado — no se puede firmar.',
        subsanarBorrador: 'Esta factura todavía no se ha contabilizado — no se puede subsanar.',
      },
    },
  },
};

const MEDIOS_PAGO_API = [
  { idMedioPago: 1, descFormaPago: 'Transferencia', descripcion: null },
];

const IMPUESTOS_API = [
  { idImpuesto: 10, descripcion: 'IVA general', porcentaje: 21, literalFactura: null, tipoFacturaE: null },
  { idImpuesto: 11, descripcion: 'IVA reducido', porcentaje: 10, literalFactura: null, tipoFacturaE: null },
];

describe('HttpIssuedInvoicesRepository — Fase 2 (listar/obtenerPorId reales)', () => {
  let repo: HttpIssuedInvoicesRepository;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post', 'get']);
    apiSpy.post.and.callFake((path: string) => {
      if (path === '/api/MediosPago/Enumerar') return Promise.resolve(MEDIOS_PAGO_API as any);
      if (path === '/api/Impuesto/Enumerar') return Promise.resolve(IMPUESTOS_API as any);
      if (path === '/api/FacturaEmitida/Enumerar') return Promise.resolve([] as any);
      throw new Error(`POST no esperado en el test: ${path}`);
    });
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));

    TestBed.configureTestingModule({
      providers: [
        ...provideTranslocoTesting(TRADUCCIONES_TEST),
        HttpIssuedInvoicesRepository,
        MockIssuedInvoicesRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    repo = TestBed.inject(HttpIssuedInvoicesRepository);
  });

  it('listar() mapea las cabeceras reales del backend: estado 131/132/133, medioPago resuelto por catálogo', async () => {
    apiSpy.post.and.callFake((path: string) => {
      if (path === '/api/FacturaEmitida/Enumerar') {
        return Promise.resolve([
          {
            idFacturaEmitida: 501, numFactura: 'A-2026-050', idEmpresa: 9, idCliente: 3,
            clienteVisualizacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
            concepto: 'Servicio de prueba', total: 100, iva: 21, suplidos: 0, irpf: 0, totalFactura: 121,
            cobrada: 0, estado: 133, estadoAeat: 'Correcto',
            fechaFactura: '2026-08-10T00:00:00', fechaVencimiento: '2026-09-10T00:00:00',
            idNumerador: 1, idMedioPago: 1,
          },
        ] as any);
      }
      if (path === '/api/MediosPago/Enumerar') return Promise.resolve(MEDIOS_PAGO_API as any);
      if (path === '/api/Impuesto/Enumerar') return Promise.resolve(IMPUESTOS_API as any);
      throw new Error(`POST no esperado: ${path}`);
    });

    const facturas = await repo.listar('firmada');

    expect(facturas.length).toBe(1);
    const f = facturas[0];
    expect(f.id).toBe(501);
    expect(f.numFactura).toBe('A-2026-050');
    expect(f.estado).toBe('firmada');
    expect(f.estadoAeat).toBe('Correcto');
    expect(f.medioPago).toBe('Transferencia');
    expect(f.destinatario.nombre).toBe('Cliente Real SL');
    expect(f.destinatario.nif).toBe('B12345678');
    expect(f.destinatario.esEmpresa).toBeTrue(); // NIF empieza por letra
    expect(f.idCliente).toBe(3);
    expect(f.totalesReales?.total).toBe(121);
  });

  it('listar() mezcla las cabeceras reales con los borradores locales de esta sesión, nunca con los datos de ejemplo fijos', async () => {
    const local = repo.crearBorrador(1, { nombre: 'Cliente local', nif: '12345678Z', esEmpresa: false });

    const facturas = await repo.listar('borrador');

    // apiSpy.post devuelve [] para Enumerar en este test (ver beforeEach) — así que lo único
    // que puede aparecer es el borrador recién creado, nunca los 4 registros de ejemplo fijos
    // del mock (ninguno tiene esBorradorLocal).
    expect(facturas.length).toBe(1);
    expect(facturas[0].id).toBe(local.id);
    expect(facturas[0].esBorradorLocal).toBeTrue();
  });

  it('obtenerPorId() mapea el detalle real, incluidas las líneas resolviendo idImpuesto al % real', async () => {
    apiSpy.get.and.resolveTo({
      idFacturaEmitida: 501, numFactura: 'A-2026-050', idEmpresa: 9, idCliente: 3,
      concepto: 'Servicio de prueba', total: 300, iva: 51, suplidos: 0, irpf: 0,
      cobrada: 0, fechaFactura: '2026-08-10T00:00:00', fechaVencimiento: '2026-09-10T00:00:00',
      idNumerador: 1, idMedioPago: 1,
      razonSocialDenominacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
      estado: 132, estadoAeat: null, totalFactura: 351, esEmpresa: true,
      lineas: [
        { idFacturaLinea: 1, referencia: null, descripcion: 'Línea A', cantidad: 2, precioUnitario: 100, descuento: 0, idImpuesto: 10, esSuplido: false, precioUnitarioBase: 100 },
        { idFacturaLinea: 2, referencia: null, descripcion: 'Línea B', cantidad: 1, precioUnitario: 100, descuento: 0, idImpuesto: 11, esSuplido: false, precioUnitarioBase: 100 },
      ],
    } as any);

    const factura = await repo.obtenerPorId(501);

    expect(factura?.estado).toBe('contabilizada');
    expect(factura?.estadoAeat).toBeUndefined();
    expect(factura?.destinatario.esEmpresa).toBeTrue();
    expect(factura?.lineas.length).toBe(2);
    expect(factura?.lineas[0].ivaPct).toBe(21);
    expect(factura?.lineas[1].ivaPct).toBe(10);
    expect(factura?.lineas[0].idLineaBackend).toBe(1);
  });

  // Fase 7 (2026-08-21): confirmado en una prueba real que 'PendienteEnvio' SÍ es un valor
  // real de estadoAeat (factura contabilizada/firmada cuyo envío a la AEAT sigue en cola de
  // reintento) — antes caía al 'RequiereRevisionManual' por defecto, un mensaje engañoso.
  it('obtenerPorId() mapea estadoAeat "PendienteEnvio" tal cual, no como RequiereRevisionManual', async () => {
    apiSpy.get.and.resolveTo({
      idFacturaEmitida: 502, numFactura: 'A-2026-051', idEmpresa: 9, idCliente: 3,
      concepto: 'Servicio de prueba', total: 100, iva: 21, suplidos: 0, irpf: 0,
      cobrada: 0, fechaFactura: '2026-08-10T00:00:00', fechaVencimiento: '2026-09-10T00:00:00',
      idNumerador: 1, idMedioPago: 1,
      razonSocialDenominacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
      estado: 133, estadoAeat: 'PendienteEnvio', totalFactura: 121, esEmpresa: true,
      lineas: [],
    } as any);

    const factura = await repo.obtenerPorId(502);

    expect(factura?.estadoAeat).toBe('PendienteEnvio');
  });

  // Fase 7 (2026-08-21): blindaje — cuando la AEAT rechaza/avisa, el motivo real (código +
  // descripción) tiene que llegar hasta el detalle, no solo el estado.
  it('obtenerPorId() combina codigoErrorAeat + descripcionErrorAeat en avisoAeat', async () => {
    apiSpy.get.and.resolveTo({
      idFacturaEmitida: 503, numFactura: 'A-2026-052', idEmpresa: 9, idCliente: 3,
      concepto: 'Servicio de prueba', total: 100, iva: 21, suplidos: 0, irpf: 0,
      cobrada: 0, fechaFactura: '2026-08-10T00:00:00', fechaVencimiento: '2026-09-10T00:00:00',
      idNumerador: 1, idMedioPago: 1,
      razonSocialDenominacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
      estado: 132, estadoAeat: 'Incorrecto', totalFactura: 121, esEmpresa: true,
      codigoErrorAeat: '1117', descripcionErrorAeat: 'El NIF del destinatario no es válido.',
      lineas: [],
    } as any);

    const factura = await repo.obtenerPorId(503);

    expect(factura?.avisoAeat).toBe('[1117] El NIF del destinatario no es válido.');
  });

  it('obtenerPorId() cae al almacén local en un 404 real (borrador todavía sin guardar)', async () => {
    const local = repo.crearBorrador(1, { nombre: 'Cliente local', nif: '12345678Z', esEmpresa: false });

    const factura = await repo.obtenerPorId(local.id);

    expect(factura?.id).toBe(local.id);
    expect(apiSpy.get).toHaveBeenCalled();
  });

  it('totales() usa totalesReales para una factura leída del backend, no recalcula desde líneas', async () => {
    apiSpy.post.and.callFake((path: string) => {
      if (path === '/api/FacturaEmitida/Enumerar') {
        return Promise.resolve([
          {
            idFacturaEmitida: 501, numFactura: 'A-2026-050', idEmpresa: 9, idCliente: 3,
            clienteVisualizacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
            concepto: 'x', total: 100, iva: 21, suplidos: 0, irpf: 5, totalFactura: 116,
            cobrada: 0, estado: 132, estadoAeat: null,
            fechaFactura: '2026-08-10T00:00:00', fechaVencimiento: '2026-09-10T00:00:00',
            idNumerador: 1, idMedioPago: 1,
          },
        ] as any);
      }
      if (path === '/api/MediosPago/Enumerar') return Promise.resolve(MEDIOS_PAGO_API as any);
      if (path === '/api/Impuesto/Enumerar') return Promise.resolve(IMPUESTOS_API as any);
      throw new Error(`POST no esperado: ${path}`);
    });

    const [factura] = await repo.listar('contabilizada');
    const totales = repo.totales(factura);

    expect(totales.total).toBe(116);
    expect(totales.retencion.importe).toBe(5);
  });

  it('obtenerMediosPago() devuelve {id, label}, no string[] (Fase 4)', async () => {
    const catalogo = await repo.obtenerMediosPago();
    expect(catalogo).toEqual([{ id: 1, label: 'Transferencia' }]);
  });

  it('obtenerNumeradores() mapea el catálogo real de series', async () => {
    apiSpy.get.and.resolveTo([
      { idNumerador: 1, nombre: 'Facturas' },
      { idNumerador: 2, nombre: null },
    ] as any);

    const numeradores = await repo.obtenerNumeradores();

    expect(apiSpy.get).toHaveBeenCalledWith('/api/FacturaEmitida/Numeradores');
    expect(numeradores).toEqual([
      { id: 1, nombre: 'Facturas' },
      { id: 2, nombre: 'Serie 2' },
    ]);
  });
});

describe('HttpIssuedInvoicesRepository.guardar — Fase 4 (alta/edición real)', () => {
  let repo: HttpIssuedInvoicesRepository;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const lineaBase = { id: 1, origen: 'manual' as const, descripcion: 'Servicio', cantidad: 2, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 };
  const destinatario = { nombre: 'Cliente Real SL', nif: 'B12345678', esEmpresa: true };

  function respuestaGuardar(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      idFacturaEmitida: 900, numFactura: 'A-2026-090', idEmpresa: 9, idCliente: 3,
      concepto: 'Servicio', total: 200, iva: 42, suplidos: 0, irpf: 0,
      cobrada: 0, fechaFactura: '2026-08-20T00:00:00', fechaVencimiento: '2026-09-20T00:00:00',
      idNumerador: 1, idMedioPago: 1,
      razonSocialDenominacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
      estado: 131, estadoAeat: null, totalFactura: 242, esEmpresa: true,
      lineas: [{ idFacturaLinea: 55, referencia: null, descripcion: 'Servicio', cantidad: 2, precioUnitario: 100, descuento: 0, idImpuesto: 10, esSuplido: false, precioUnitarioBase: 100 }],
      ...overrides,
    };
  }

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post', 'get']);
    apiSpy.post.and.callFake((path: string) => {
      if (path === '/api/MediosPago/Enumerar') return Promise.resolve(MEDIOS_PAGO_API as any);
      if (path === '/api/Impuesto/Enumerar') return Promise.resolve(IMPUESTOS_API as any);
      if (path === '/api/FacturaEmitida/Guardar') return Promise.resolve(respuestaGuardar() as any);
      throw new Error(`POST no esperado en el test: ${path}`);
    });
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));

    TestBed.configureTestingModule({
      providers: [
        ...provideTranslocoTesting(TRADUCCIONES_TEST),
        HttpIssuedInvoicesRepository,
        MockIssuedInvoicesRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    repo = TestBed.inject(HttpIssuedInvoicesRepository);
  });

  it('un borrador local (crearBorrador, todavía sin guardar) hace un ALTA — sin idFacturaEmitida en el body', async () => {
    const local = repo.crearBorrador(1, destinatario);

    const guardada = await repo.guardar(local.id, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: 1, destinatario, idCliente: 3,
      numeradorId: 1, lineas: [lineaBase],
    });

    expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturaEmitida/Guardar', jasmine.objectContaining({
      idFacturaEmitida: undefined, idCliente: 3, idNumerador: 1, idMedioPago: 1,
    }));
    expect(guardada.id).toBe(900);
    expect(guardada.numFactura).toBe('A-2026-090'); // el número real lo asigna el backend
    expect(guardada.estado).toBe('borrador');

    // El borrador local se descarta: ya no hace falta, la factura real lo sustituye.
    expect(await repo.obtenerPorId(local.id)).toBeUndefined();
  });

  it('un id que ya no está en el almacén local (factura real leída antes) hace una ACTUALIZACIÓN', async () => {
    // 501 nunca se creó vía crearBorrador() en este test — simula una factura real ya leída
    // (obtenerPorId) que el usuario está reeditando.
    const guardada = await repo.guardar(501, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: 1, destinatario, idCliente: 3,
      numeradorId: 1, lineas: [lineaBase],
    });

    expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturaEmitida/Guardar', jasmine.objectContaining({
      idFacturaEmitida: 501,
    }));
    expect(guardada.id).toBe(900);
  });

  it('conserva el idLineaBackend de la línea guardada (posición 0 del array de respuesta)', async () => {
    const guardada = await repo.guardar(501, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: 1, destinatario, idCliente: 3,
      numeradorId: 1, lineas: [lineaBase],
    });

    expect(guardada.lineas[0].idLineaBackend).toBe(55);
    expect(guardada.lineas[0].id).toBe(lineaBase.id); // el id LOCAL de la línea no cambia
  });

  it('rechaza guardar sin idCliente — no se puede guardar una factura solo con el nombre en texto', async () => {
    await expectAsync(repo.guardar(501, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: 1, destinatario, idCliente: undefined,
      numeradorId: 1, lineas: [lineaBase],
    })).toBeRejectedWithError(/Selecciona el cliente/);
    expect(apiSpy.post).not.toHaveBeenCalledWith('/api/FacturaEmitida/Guardar', jasmine.anything());
  });

  it('rechaza guardar sin idMedioPago', async () => {
    await expectAsync(repo.guardar(501, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: undefined, destinatario, idCliente: 3,
      numeradorId: 1, lineas: [lineaBase],
    })).toBeRejectedWithError(/forma de pago/);
  });

  it('rechaza guardar sin líneas', async () => {
    await expectAsync(repo.guardar(501, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: 1, destinatario, idCliente: 3,
      numeradorId: 1, lineas: [],
    })).toBeRejectedWithError(/al menos una línea/);
  });

  it('resuelve idImpuesto de cada línea a partir de ivaPct, y lo manda al backend', async () => {
    await repo.guardar(501, {
      fecha: '2026-08-20', vencimiento: '2026-09-20', concepto: 'Servicio',
      medioPago: 'Transferencia', idMedioPago: 1, destinatario, idCliente: 3,
      numeradorId: 1, lineas: [lineaBase, { ...lineaBase, id: 2, ivaPct: 10 }],
    });

    const body = apiSpy.post.calls.allArgs().find(([path]) => path === '/api/FacturaEmitida/Guardar')?.[1] as any;
    expect(body.lineas[0].idImpuesto).toBe(10); // 21% → idImpuesto 10
    expect(body.lineas[1].idImpuesto).toBe(11); // 10% → idImpuesto 11
  });
});

describe('HttpIssuedInvoicesRepository.eliminar/duplicar — Fase 6', () => {
  let repo: HttpIssuedInvoicesRepository;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const destinatario = { nombre: 'Cliente Real SL', nif: 'B12345678', esEmpresa: true };
  const lineaBase = { id: 1, origen: 'manual' as const, descripcion: 'Servicio', cantidad: 2, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 };

  function detalleReal(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      idFacturaEmitida: 501, numFactura: 'A-2026-050', idEmpresa: 9, idCliente: 3,
      concepto: 'Servicio', total: 200, iva: 42, suplidos: 0, irpf: 0,
      cobrada: 0, fechaFactura: '2026-08-10T00:00:00', fechaVencimiento: '2026-09-10T00:00:00',
      idNumerador: 1, idMedioPago: 1,
      razonSocialDenominacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
      estado: 133, estadoAeat: 'Correcto', totalFactura: 242, esEmpresa: true,
      lineas: [{ idFacturaLinea: 77, referencia: null, descripcion: 'Servicio', cantidad: 2, precioUnitario: 100, descuento: 0, idImpuesto: 10, esSuplido: false, precioUnitarioBase: 100 }],
      ...overrides,
    };
  }

  function respuestaDuplicar() {
    return {
      idFacturaEmitida: 900, numFactura: 'A-2026-090', idEmpresa: 9, idCliente: 3,
      concepto: 'Servicio', total: 200, iva: 42, suplidos: 0, irpf: 0,
      cobrada: 0, fechaFactura: '2026-08-20T00:00:00', fechaVencimiento: '2026-08-20T00:00:00',
      idNumerador: 1, idMedioPago: 1,
      razonSocialDenominacion: 'Cliente Real SL', razonSocialNif: 'B12345678',
      estado: 131, estadoAeat: null, totalFactura: 242, esEmpresa: true,
      lineas: [{ idFacturaLinea: 78, referencia: null, descripcion: 'Servicio', cantidad: 2, precioUnitario: 100, descuento: 0, idImpuesto: 10, esSuplido: false, precioUnitarioBase: 100 }],
    };
  }

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post', 'get', 'delete']);
    apiSpy.post.and.callFake((path: string) => {
      if (path === '/api/MediosPago/Enumerar') return Promise.resolve(MEDIOS_PAGO_API as any);
      if (path === '/api/Impuesto/Enumerar') return Promise.resolve(IMPUESTOS_API as any);
      if (path === '/api/FacturaEmitida/Guardar') return Promise.resolve(respuestaDuplicar() as any);
      throw new Error(`POST no esperado en el test: ${path}`);
    });
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));
    apiSpy.delete.and.rejectWith(new Error('HTTP 404'));

    TestBed.configureTestingModule({
      providers: [
        ...provideTranslocoTesting(TRADUCCIONES_TEST),
        HttpIssuedInvoicesRepository,
        MockIssuedInvoicesRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    repo = TestBed.inject(HttpIssuedInvoicesRepository);
  });

  it('eliminar() llama al DELETE real cuando el backend lo acepta', async () => {
    apiSpy.delete.and.resolveTo(undefined as any);

    await repo.eliminar(501);

    expect(apiSpy.delete).toHaveBeenCalledWith('/api/FacturaEmitida/501');
  });

  it('eliminar() cae al almacén local en un 404 real (borrador todavía sin guardar)', async () => {
    const local = repo.crearBorrador(1, destinatario);

    await repo.eliminar(local.id);

    expect(await repo.obtenerPorId(local.id)).toBeUndefined();
  });

  it('eliminar() propaga el error del backend (ej. factura ya no está en borrador) sin envolverlo', async () => {
    apiSpy.delete.and.rejectWith(new Error('HTTP 400 - Solo se puede eliminar una factura en borrador.'));

    await expectAsync(repo.eliminar(501)).toBeRejectedWithError(/borrador/);
  });

  it('duplicar() sobre un borrador local todavía no lo guarda de verdad — se queda en local', async () => {
    const local = repo.crearBorrador(1, destinatario);
    local.lineas.push(lineaBase);

    const copia = await repo.duplicar(local.id);

    expect(copia).toBeTruthy();
    expect(copia?.estado).toBe('borrador');
    expect(apiSpy.post).not.toHaveBeenCalledWith('/api/FacturaEmitida/Guardar', jasmine.anything());
  });

  it('duplicar() sobre una factura real (firmada) relee el detalle y crea un borrador nuevo, sin número/estado/OperacionId heredados', async () => {
    apiSpy.get.and.resolveTo(detalleReal() as any);

    const copia = await repo.duplicar(501);

    expect(copia?.id).toBe(900);
    expect(copia?.numFactura).toBe('A-2026-090'); // número nuevo, no el 'A-2026-050' original
    expect(copia?.estado).toBe('borrador');
    expect(copia?.estadoAeat).toBeUndefined();
    expect(copia?.operacionId).toBe('');

    const body = apiSpy.post.calls.allArgs().find(([path]) => path === '/api/FacturaEmitida/Guardar')?.[1] as any;
    expect(body.idFacturaEmitida).toBeUndefined(); // alta, no actualización
    expect(body.lineas[0].idFacturaLinea).toBeUndefined(); // línea nueva, no la 77 del original
  });

  it('duplicar() sobre un id que no existe (ni real ni local) devuelve undefined', async () => {
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));

    const copia = await repo.duplicar(999999);

    expect(copia).toBeUndefined();
    expect(apiSpy.post).not.toHaveBeenCalledWith('/api/FacturaEmitida/Guardar', jasmine.anything());
  });
});
