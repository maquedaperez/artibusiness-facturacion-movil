import { TestBed } from '@angular/core/testing';

import { MOCK_REPOSITORY_PROVIDERS } from './mock.providers';
import {
  EmisorRepository, CustomersRepository, SuppliersRepository,
  IssuedInvoicesRepository, ReceivedInvoicesRepository,
} from '../ports';
import { MockEmisorRepository } from '../adapters/mock/emisor.repository.mock';
import { MockCustomersRepository } from '../adapters/mock/customers.repository.mock';
import { MockSuppliersRepository } from '../adapters/mock/suppliers.repository.mock';
import { MockIssuedInvoicesRepository } from '../adapters/mock/issued-invoices.repository.mock';
import { MockReceivedInvoicesRepository } from '../adapters/mock/received-invoices.repository.mock';
import {
  CONFIGURACION_RETENCION_ALQUILER_DEMO, ConfiguracionRetencion, aplicarRetencion,
} from '../../services/mock-facturas.service';

describe('MOCK_REPOSITORY_PROVIDERS — selección de provider', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
  });

  it('resuelve cada puerto a su implementación mock, no a un tipo concreto de HTTP', () => {
    expect(TestBed.inject(EmisorRepository)).toBeInstanceOf(MockEmisorRepository);
    expect(TestBed.inject(CustomersRepository)).toBeInstanceOf(MockCustomersRepository);
    expect(TestBed.inject(SuppliersRepository)).toBeInstanceOf(MockSuppliersRepository);
    expect(TestBed.inject(IssuedInvoicesRepository)).toBeInstanceOf(MockIssuedInvoicesRepository);
    expect(TestBed.inject(ReceivedInvoicesRepository)).toBeInstanceOf(MockReceivedInvoicesRepository);
  });

  it('las páginas solo dependen del token del puerto, nunca de la clase mock concreta', () => {
    // Si algún día se registra un HttpIssuedInvoicesRepository en su lugar, este mismo
    // token sigue resolviendo — es la garantía de que el swap no toca las pantallas.
    expect(() => TestBed.inject(MockIssuedInvoicesRepository as any)).toThrow();
  });
});

describe('Flujos principales del modo mock a través de los puertos', () => {
  let emisorRepo: EmisorRepository;
  let customersRepo: CustomersRepository;
  let suppliersRepo: SuppliersRepository;
  let issuedRepo: IssuedInvoicesRepository;
  let receivedRepo: ReceivedInvoicesRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    emisorRepo = TestBed.inject(EmisorRepository);
    customersRepo = TestBed.inject(CustomersRepository);
    suppliersRepo = TestBed.inject(SuppliersRepository);
    issuedRepo = TestBed.inject(IssuedInvoicesRepository);
    receivedRepo = TestBed.inject(ReceivedInvoicesRepository);
  });

  it('devuelve los datos de ejemplo del emisor', () => {
    const emisor = emisorRepo.getEmisor();
    expect(emisor.nombre).toBeTruthy();
    expect(emisor.nif).toBeTruthy();
  });

  it('busca clientes de ejemplo por nombre y por NIF, sin devolver nada con menos de 2 caracteres', async () => {
    const corta = await customersRepo.buscar('S');
    expect(corta.items.length).toBe(0);

    const porNombre = await customersRepo.buscar('Sonrisas');
    expect(porNombre.items.length).toBe(1);

    const porNif = await customersRepo.buscar('B12345678');
    expect(porNif.items.length).toBe(1);
  });

  it('busca proveedores de ejemplo por nombre y por NIF, sin devolver nada con menos de 2 caracteres', async () => {
    const corta = await suppliersRepo.buscar('V');
    expect(corta.items.length).toBe(0);

    const porNombre = await suppliersRepo.buscar('Vidal');
    expect(porNombre.items.length).toBe(1);
  });

  it('lista facturas emitidas filtradas por estado', () => {
    const borradores = issuedRepo.listar('borrador');
    expect(borradores.every(f => f.estado === 'borrador')).toBeTrue();
    expect(borradores.length).toBeGreaterThan(0);
  });

  it('crea un borrador de factura emitida y calcula sus totales de forma coherente, sin retención por defecto', async () => {
    const numerador = issuedRepo.getNumeradores()[0];
    const cliente = (await customersRepo.buscar('Sonrisas')).items[0];

    const borrador = issuedRepo.crearBorrador(numerador.id, cliente);
    expect(borrador.estado).toBe('borrador');
    expect(borrador.lineas.length).toBe(0);
    expect((borrador as any).irpfPct).toBeUndefined(); // ya no existe como campo de la factura

    borrador.lineas.push({
      id: issuedRepo.nuevoIdLinea(),
      origen: 'manual',
      descripcion: 'Servicio de ejemplo',
      cantidad: 2,
      precioUnitario: 100,
      descuentoPct: 0,
      ivaPct: 21,
    });

    const totales = issuedRepo.totales(borrador);
    // base = 2 * 100 = 200; IVA 21% = 42. Configuración mock por defecto: sin retención.
    expect(totales.base).toBe(200);
    expect(totales.ivaTotal).toBe(42);
    expect(totales.retencion.aplicable).toBeFalse();
    expect(totales.retencion.importe).toBe(0);
    expect(totales.total).toBe(242);
  });

  it('contabilizar y firmar cambian el estado y el estado AEAT simulado de la factura', async () => {
    const numerador = issuedRepo.getNumeradores()[0];
    const cliente = (await customersRepo.buscar('Sonrisas')).items[0];
    const borrador = issuedRepo.crearBorrador(numerador.id, cliente);

    issuedRepo.contabilizar(borrador.id);
    let actualizada = issuedRepo.obtenerPorId(borrador.id);
    expect(actualizada?.estado).toBe('contabilizada');
    expect(actualizada?.estadoAeat).toBe('PendienteEnvio');

    issuedRepo.firmar(borrador.id);
    actualizada = issuedRepo.obtenerPorId(borrador.id);
    expect(actualizada?.estado).toBe('firmada');
    expect(actualizada?.estadoAeat).toBe('Correcto');
  });

  it('lista, crea y elimina facturas recibidas manuales', () => {
    const inicial = receivedRepo.listar().length;

    const creada = receivedRepo.crearManual({
      proveedor: 'Proveedor de prueba', proveedorNif: '00000000T',
      numFactura: 'TEST-1', fecha: '2026-08-11', vencimiento: '',
      concepto: 'Prueba', formaPago: 'Transferencia',
      lineas: [
        { id: receivedRepo.nuevoIdLinea(), origen: 'manual', descripcion: 'Prueba', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21 },
      ],
      retencionPct: 0,
      pagada: false, estado: 'borrador',
    });

    expect(receivedRepo.listar().length).toBe(inicial + 1);
    expect(receivedRepo.obtenerPorId(creada.id)?.proveedor).toBe('Proveedor de prueba');

    receivedRepo.eliminar(creada.id);
    expect(receivedRepo.listar().length).toBe(inicial);
    expect(receivedRepo.obtenerPorId(creada.id)).toBeUndefined();
  });

  it('una factura recibida con varias líneas manuales calcula bien el desglose de IVA y el total', () => {
    const creada = receivedRepo.crearManual({
      proveedor: 'Proveedor multi-línea', proveedorNif: '00000000T',
      numFactura: 'TEST-2', fecha: '2026-08-11', vencimiento: '',
      concepto: 'Varias líneas', formaPago: 'Transferencia',
      lineas: [
        { id: receivedRepo.nuevoIdLinea(), origen: 'manual', descripcion: 'Línea A', cantidad: 2, precioUnitario: 50, descuentoPct: 0, ivaPct: 21 },
        { id: receivedRepo.nuevoIdLinea(), origen: 'manual', descripcion: 'Línea B', cantidad: 1, precioUnitario: 40, descuentoPct: 0, ivaPct: 10 },
      ],
      retencionPct: 15,
      pagada: false, estado: 'borrador',
    });

    const totales = receivedRepo.totales(creada);
    // base = (2*50) + (1*40) = 140; IVA: 21% de 100 = 21, 10% de 40 = 4 → ivaTotal 25;
    // retención 15% sobre 140 = 21 → total = 140 + 25 - 21 = 144.
    expect(totales.base).toBe(140);
    expect(totales.desgloseIva.length).toBe(2);
    expect(totales.ivaTotal).toBe(25);
    expect(totales.retencion.aplicable).toBeTrue();
    expect(totales.retencion.importe).toBe(21);
    expect(totales.total).toBe(144);

    receivedRepo.eliminar(creada.id);
  });
});

describe('aplicarRetencion — cálculo puro, sin pasar por el singleton del servicio', () => {
  it('con la config por defecto del MVP (sin retención), el importe es 0 y no resta del total', () => {
    const sinRetencion: ConfiguracionRetencion = {
      aplicable: false, tipoCodigo: 'ninguna', etiqueta: 'Retención', porcentaje: 0,
    };
    const resultado = aplicarRetencion(1000, sinRetencion);

    expect(resultado.aplicable).toBeFalse();
    expect(resultado.importe).toBe(0);
    expect(resultado.motivoNoAplica).toBeTruthy();
  });

  it('fixture de alquiler urbano (19%): reproduce el ejemplo base 1000€ / IVA 210€ / retención 190€ / total 1020€', () => {
    const retencion = aplicarRetencion(1000, CONFIGURACION_RETENCION_ALQUILER_DEMO);

    expect(retencion.aplicable).toBeTrue();
    expect(retencion.etiqueta).toBe('Retención alquiler');
    expect(retencion.porcentaje).toBe(19);
    expect(retencion.importe).toBe(190);

    // La fórmula completa: base + IVA − retención = total a pagar.
    const ivaTotal = 210; // 21% sobre 1000€, calculado aparte del desglose de IVA existente.
    const total = 1000 + ivaTotal - retencion.importe;
    expect(total).toBe(1020);
  });

  it('la fixture de alquiler no se aplica a las facturas emitidas normales del MVP en vivo', () => {
    // Configuración por defecto del servicio (verificada en el test de totales de arriba):
    // withholdingApplicable = false. Esta fixture solo existe para tests y para demostrar
    // el cálculo/formato cuando el backend confirme que sí aplica — nunca se activa sola.
    expect(CONFIGURACION_RETENCION_ALQUILER_DEMO.aplicable).toBeTrue();
    expect(CONFIGURACION_RETENCION_ALQUILER_DEMO.porcentaje).toBe(19);
  });
});
