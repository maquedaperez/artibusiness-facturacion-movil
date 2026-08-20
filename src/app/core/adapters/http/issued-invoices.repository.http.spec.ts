import { TestBed } from '@angular/core/testing';

import { HttpIssuedInvoicesRepository } from './issued-invoices.repository.http';
import { MockIssuedInvoicesRepository } from '../mock/issued-invoices.repository.mock';
import { MockFacturasService } from '../../../services/mock-facturas.service';
import { ApiService } from '../../../services/api.service';

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
});
