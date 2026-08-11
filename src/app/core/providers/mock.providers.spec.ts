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

  it('crea un borrador de factura emitida y calcula sus totales de forma coherente', async () => {
    const numerador = issuedRepo.getNumeradores()[0];
    const cliente = (await customersRepo.buscar('Sonrisas')).items[0];

    const borrador = issuedRepo.crearBorrador(numerador.id, cliente);
    expect(borrador.estado).toBe('borrador');
    expect(borrador.lineas.length).toBe(0);

    borrador.lineas.push({
      id: issuedRepo.nuevoIdLinea(),
      descripcion: 'Servicio de ejemplo',
      cantidad: 2,
      precioUnitario: 100,
      descuentoPct: 0,
      ivaPct: 21,
    });
    borrador.irpfPct = 15;

    const totales = issuedRepo.totales(borrador);
    // base = 2 * 100 = 200; IVA 21% = 42; IRPF 15% sobre base (no sobre el total con IVA) = 30.
    expect(totales.base).toBe(200);
    expect(totales.ivaTotal).toBe(42);
    expect(totales.irpfCuota).toBe(30);
    expect(totales.total).toBe(212);
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
      baseImponible: 100, ivaPct: 21, iva: 21, irpfPct: 0, irpf: 0, totalFactura: 121,
      pagada: false, estado: 'borrador',
    });

    expect(receivedRepo.listar().length).toBe(inicial + 1);
    expect(receivedRepo.obtenerPorId(creada.id)?.proveedor).toBe('Proveedor de prueba');

    receivedRepo.eliminar(creada.id);
    expect(receivedRepo.listar().length).toBe(inicial);
    expect(receivedRepo.obtenerPorId(creada.id)).toBeUndefined();
  });
});
