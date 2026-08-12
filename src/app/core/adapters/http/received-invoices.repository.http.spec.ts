import { TestBed } from '@angular/core/testing';

import { HttpReceivedInvoicesRepository } from './received-invoices.repository.http';
import { MockReceivedInvoicesRepository } from '../mock/received-invoices.repository.mock';
import { MockFacturasService } from '../../../services/mock-facturas.service';
import { ApiService } from '../../../services/api.service';

function archivoDePrueba(nombre = 'factura.pdf'): File {
  return new File(['contenido de prueba'], nombre, { type: 'application/pdf' });
}

describe('HttpReceivedInvoicesRepository.crearDesdeOcr — mapeo de la respuesta de OCR', () => {
  let repo: HttpReceivedInvoicesRepository;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['postMultipart']);

    TestBed.configureTestingModule({
      providers: [
        HttpReceivedInvoicesRepository,
        MockReceivedInvoicesRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    repo = TestBed.inject(HttpReceivedInvoicesRepository);
  });

  it('mapea una respuesta completa a una FacturaRecibida borrador con origen OCR', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          invoice_number: 'DEMO-2026-0001',
          issue_date: '2026-08-01',
          issuer: { legal_name: 'Demo Telecom S.L.', tax_id: 'B99999999' },
          lines: [
            { description: 'Licencia mensual', quantity: '2', unit_price: '15.00', discount_percent: '0', tax_rate: '21' },
          ],
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());

    expect(factura.origenOcr).toBeTrue();
    expect(factura.estado).toBe('borrador');
    expect(factura.proveedor).toBe('Demo Telecom S.L.');
    expect(factura.proveedorNif).toBe('B99999999');
    expect(factura.numFactura).toBe('DEMO-2026-0001');
    expect(factura.fecha).toBe('2026-08-01');
    expect(factura.lineas.length).toBe(1);
    expect(factura.lineas[0].descripcion).toBe('Licencia mensual');
    expect(factura.lineas[0].cantidad).toBe(2);
    expect(factura.lineas[0].precioUnitario).toBe(15);
    expect(factura.lineas[0].ivaPct).toBe(21);
    expect(factura.documentoNombre).toBe('factura.pdf');
    expect(factura.documentoUrl).toContain('data:');

    expect(apiSpy.postMultipart).toHaveBeenCalledWith('/api/FacturaRecibida/desde-ocr', jasmine.any(File), 'file');
  });

  it('rellena con valores por defecto razonables cuando la extracción viene incompleta', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          invoice_number: null,
          issue_date: null,
          issuer: null,
          lines: [
            { description: null, quantity: null, unit_price: null, discount_percent: null, tax_rate: null },
          ],
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba('recibo.jpg'));

    expect(factura.proveedor).toBe('Proveedor detectado (recibo.jpg)');
    expect(factura.numFactura).toBe('');
    expect(factura.fecha).toBeTruthy(); // hoy, por defecto
    expect(factura.lineas[0].descripcion).toBe('Pendiente de revisar');
    expect(factura.lineas[0].cantidad).toBe(1);
    expect(factura.lineas[0].precioUnitario).toBe(0);
    expect(factura.lineas[0].ivaPct).toBe(21); // tipo general por defecto si no se pudo leer
  });

  it('si la extracción no trae ninguna línea, añade una línea vacía para que el usuario la revise', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: { invoice: { lines: [] } },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas.length).toBe(1);
    expect(factura.lineas[0].descripcion).toBe('Pendiente de revisar');
  });

  it('lanza un error legible si el backend responde success:false', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: false,
      error: { code: 'DOCUMENT_NOT_PROCESSABLE', message: 'no se pudo leer' },
    });

    await expectAsync(repo.crearDesdeOcr(archivoDePrueba())).toBeRejectedWithError(/No se pudo extraer/);
  });

  it('lanza un error legible si la respuesta no trae bloque de factura', async () => {
    apiSpy.postMultipart.and.resolveTo({ success: true, document: {} });

    await expectAsync(repo.crearDesdeOcr(archivoDePrueba())).toBeRejectedWithError(/No se pudo extraer/);
  });

  it('la factura extraída queda accesible a través del resto del repositorio (mismo almacén que el mock)', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: { invoice: { invoice_number: 'F-9', lines: [] } },
    });

    const antes = repo.listar().length;
    const creada = await repo.crearDesdeOcr(archivoDePrueba());

    expect(repo.listar().length).toBe(antes + 1);
    expect(repo.obtenerPorId(creada.id)?.numFactura).toBe('F-9');
  });
});

describe('HttpReceivedInvoicesRepository — el resto de operaciones sigue delegando en el mock', () => {
  let repo: HttpReceivedInvoicesRepository;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['postMultipart']);
    TestBed.configureTestingModule({
      providers: [
        HttpReceivedInvoicesRepository,
        MockReceivedInvoicesRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    repo = TestBed.inject(HttpReceivedInvoicesRepository);
  });

  it('crearManual/listar/eliminar siguen funcionando igual que en el mock (sin backend de Recibidas aún)', () => {
    const inicial = repo.listar().length;

    const creada = repo.crearManual({
      proveedor: 'Proveedor manual', numFactura: 'M-1', fecha: '2026-08-11', vencimiento: '',
      lineas: [{ id: repo.nuevoIdLinea(), origen: 'manual', descripcion: 'x', cantidad: 1, precioUnitario: 10, descuentoPct: 0, ivaPct: 21 }],
      retencionPct: 0, pagada: false, estado: 'borrador',
    });

    expect(repo.listar().length).toBe(inicial + 1);
    expect(creada.origenOcr).toBeFalse();

    repo.eliminar(creada.id);
    expect(repo.listar().length).toBe(inicial);
  });
});
