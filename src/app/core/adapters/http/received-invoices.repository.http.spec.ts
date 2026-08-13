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
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['postMultipart', 'post', 'get']);
    // listar()/obtenerPorId() no son el foco de este describe (mapeo de OCR) — se dejan
    // resolviendo "sin datos en el backend real" para que las pruebas que sí los tocan
    // (ver más abajo) caigan siempre al almacén local, igual que hoy sin backend de Recibidas.
    apiSpy.post.and.resolveTo([]);
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));

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
          payment: { payment_method: 'Transferencia', due_date: '2026-09-01' },
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
    expect(factura.vencimiento).toBe('2026-09-01');
    expect(factura.formaPago).toBe('Transferencia');
    expect(factura.lineas.length).toBe(1);
    expect(factura.lineas[0].descripcion).toBe('Licencia mensual');
    expect(factura.lineas[0].cantidad).toBe(2);
    expect(factura.lineas[0].precioUnitario).toBe(15);
    expect(factura.lineas[0].ivaPct).toBe(21);
    expect(factura.documentoNombre).toBe('factura.pdf');
    expect(factura.documentoUrl).toContain('data:');

    expect(apiSpy.postMultipart).toHaveBeenCalledWith('/api/Documento/analizar', jasmine.any(File), 'file');
  });

  it('usa el due_date a nivel de factura cuando no hay payment.due_date', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          invoice_number: 'DEMO-2026-0002',
          due_date: '2026-10-15',
          lines: [],
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.vencimiento).toBe('2026-10-15');
    expect(factura.formaPago).toBeUndefined();
  });

  it('sin unit_price, usa taxable_base como importe de la línea (1 unidad) — caso real Movistar', async () => {
    // Caso real: factura de Movistar donde el OCR no da quantity/unit_price (es un abono,
    // no "cantidad × precio unitario"), pero sí taxable_base y line_total por línea.
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          invoice_number: 'FMDVAGJ0044689',
          issue_date: '2026-07-13',
          issuer: { legal_name: 'Telefónica de España, S.A.U.', tax_id: 'A-82018474' },
          lines: [
            {
              description: 'Fusión Total Plus (28 May a 27 Jun)',
              quantity: null, unit_price: null, discount_percent: null, tax_rate: '21.0',
              taxable_base: '180.1653', line_total: '180.1653',
            },
            {
              description: '687119577 - Contenidos',
              quantity: null, unit_price: null, discount_percent: null, tax_rate: '21.0',
              taxable_base: '0.7417', line_total: '0.7417',
            },
          ],
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());

    expect(factura.lineas[0].cantidad).toBe(1);
    expect(factura.lineas[0].precioUnitario).toBe(180.1653);
    expect(factura.lineas[1].precioUnitario).toBe(0.7417);
    // Antes del arreglo esto daba 0 — es justo el bug real que reportó el usuario.
    expect(factura.lineas[0].precioUnitario).not.toBe(0);
  });

  it('sin taxable_base, cae a line_total como último recurso', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: { lines: [{ description: 'x', quantity: null, unit_price: null, taxable_base: null, line_total: '42.50', tax_rate: '21' }] },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas[0].cantidad).toBe(1);
    expect(factura.lineas[0].precioUnitario).toBe(42.5);
  });

  it('con taxable_base y unit_price presentes a la vez, taxable_base gana siempre (más fiable que recalcular)', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: { lines: [{ description: 'x', quantity: '3', unit_price: '10.00', taxable_base: '29.97', tax_rate: '21' }] },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas[0].cantidad).toBe(1);
    expect(factura.lineas[0].precioUnitario).toBe(29.97);
  });

  it('sin taxable_base ni line_total, cae a cantidad × unit_price como último recurso', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: { lines: [{ description: 'x', quantity: '3', unit_price: '10.00', taxable_base: null, line_total: null, tax_rate: '21' }] },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas[0].cantidad).toBe(3);
    expect(factura.lineas[0].precioUnitario).toBe(10);
  });

  it('toma la retención de withholding_rate de línea si viene, redondeada a la tarifa IRPF más cercana', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: { lines: [{ description: 'x', unit_price: '100', withholding_rate: '15.2' }] },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.retencionPct).toBe(15); // 15.2 -> tarifa válida más cercana (IRPF_RATES)
  });

  it('sin withholding_rate por línea, calcula la retención a partir de los totales', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          lines: [{ description: 'x', unit_price: '100' }],
          totals: { taxable_base: '100', withholding: '19' },
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.retencionPct).toBe(19); // 19/100 = 19% exacto
  });

  it('sin ningún dato de retención, queda en 0 (como antes) — caso real Movistar', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          lines: [{ description: 'x', unit_price: '100' }],
          totals: { taxable_base: '100', withholding: null },
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.retencionPct).toBe(0);
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

    const antes = (await repo.listar()).length;
    const creada = await repo.crearDesdeOcr(archivoDePrueba());

    expect((await repo.listar()).length).toBe(antes + 1);
    expect((await repo.obtenerPorId(creada.id))?.numFactura).toBe('F-9');
  });

  it('una línea "non_subject" sin tax_rate se mapea a 0% de IVA, nunca al 21% por defecto', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          lines: [{ description: 'Canon Saneamiento', unit_price: '11.21', tax_rate: null, tax_treatment: 'non_subject' }],
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas[0].ivaPct).toBe(0);
  });

  it('una línea "exempt" también se mapea a 0% de IVA', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: { lines: [{ description: 'x', unit_price: '10', tax_rate: null, tax_treatment: 'exempt' }] },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas[0].ivaPct).toBe(0);
  });

  it('una línea "taxable" con tax_rate explícito sigue usando ese tipo, no se ve afectada por el arreglo', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: { lines: [{ description: 'x', unit_price: '10', tax_rate: '10.0', tax_treatment: 'taxable' }] },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.lineas[0].ivaPct).toBe(10);
  });

  it('reproduce la factura real de Aguas de Alicante: el total cuadra con los 56,81 € reales, no 60,37 €', async () => {
    // Antes del arreglo, las dos líneas de Canon Saneamiento (non_subject, tax_rate null)
    // caían al 21% por defecto y el total salía en 60,37 € — la factura real y el propio
    // totals.total del OCR dicen 56,81 €.
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          invoice_number: '00002026AA00468352',
          issue_date: '2026-07-14',
          issuer: { legal_name: 'AGUAS MUNICIPALIZADAS DE ALICANTE, E.M.', tax_id: 'B03002441' },
          lines: [
            { description: 'AGUA - CUOTA DE SERVICIO', taxable_base: '27.0', tax_rate: '10.0', tax_treatment: 'taxable' },
            { description: 'AGUA - CONSUMO hasta 12 m3/Trim.', quantity: '12.0', unit_price: '0.01', taxable_base: '0.12', tax_rate: '10.0', tax_treatment: 'taxable' },
            { description: 'AGUA - CONSUMO de 13 a 30 m3/Trimestre', quantity: '1.0', unit_price: '0.85', taxable_base: '0.85', tax_rate: '10.0', tax_treatment: 'taxable' },
            { description: 'CONSERVACIÓN - CONTADOR', taxable_base: '1.86', tax_rate: '21.0', tax_treatment: 'taxable' },
            { description: 'ALCANTARILLADO - CUOTA DE SERVICIO', taxable_base: '6.03', tax_rate: '10.0', tax_treatment: 'taxable' },
            { description: 'ALCANTARILLADO - CONSUMO hasta 12 m3/Trimestre', quantity: '12.0', unit_price: '0.01', taxable_base: '0.12', tax_rate: '10.0', tax_treatment: 'taxable' },
            { description: 'ALCANTARILLADO - CONSUMO de 13 a 30 m3/Trimestre', quantity: '1.0', unit_price: '0.08', taxable_base: '0.08', tax_rate: '10.0', tax_treatment: 'taxable' },
            { description: 'CANON SANEAMIENTO - CUOTA DE SERVICIO', taxable_base: '11.21', tax_rate: null, tax_treatment: 'non_subject' },
            { description: 'CANON SANEAMIENTO - CONSUMO', quantity: '13.0', unit_price: '0.441', taxable_base: '5.73', tax_rate: null, tax_treatment: 'non_subject' },
          ],
          totals: { taxable_base: '36.06', tax: '3.81', total: '56.81' },
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    const totales = repo.totales(factura);

    expect(totales.base).toBe(53); // suma de las 9 líneas, sin cambios
    expect(totales.total).toBe(56.81); // no 60.37
  });

  it('reproduce la factura real de Iberdrola: usa taxable_base aunque unit_price esté presente, incluye la línea negativa exenta', async () => {
    // Antes del arreglo, con unit_price presente se recalculaba cantidad × precio (menos
    // preciso que el taxable_base ya calculado por el emisor) y el total salía en 36,48 €
    // — la factura real dice 36,49 €. La línea de devolución de depósito (-36,40 €) es
    // "exempt": entra en la Base pero con 0% de IVA, no se excluye de la factura.
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        warnings: ['Significant discrepancy between the reconciled total (72.89) and the stated total (36.49); diff=36.40'],
        invoice: {
          invoice_number: '21260721010279545',
          issue_date: '2026-07-21',
          due_date: '2026-07-29',
          issuer: { legal_name: 'IBERDROLA CLIENTES, S.A.U.', tax_id: 'A-95758389' },
          payment: { payment_method: 'DOMICILIACION BANCARIA', due_date: '2026-07-29' },
          lines: [
            { description: 'Potencia facturada Punta', quantity: '123.2', unit_price: '0.120743', taxable_base: '14.88', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Potencia facturada Valle', quantity: '123.2', unit_price: '0.044026', taxable_base: '5.42', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Energía consumida', quantity: '171', unit_price: '0.165741', taxable_base: '28.34', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Financiación bono social fijo (1)', quantity: '14', unit_price: '0.019121', taxable_base: '0.27', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Financiación bono social fijo (2)', quantity: '14', unit_price: '0.024688', taxable_base: '0.35', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Impuesto sobre electricidad', taxable_base: '2.52', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Alquiler equipos medida', quantity: '28', unit_price: '0.02663014', taxable_base: '0.75', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Urgencias Electricas Negocios', quantity: '0.92', unit_price: '8.38', taxable_base: '7.71', tax_rate: '21', tax_treatment: 'taxable' },
            { description: 'Devolución depósito de garantía', taxable_base: '-36.4', tax_rate: null, tax_treatment: 'exempt' },
          ],
          totals: { taxable_base: '60.24', tax: '12.65', total: '36.49' },
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    const totales = repo.totales(factura);

    expect(totales.base).toBe(23.84); // no 23.83
    expect(totales.total).toBe(36.49); // no 36.48

    // El aviso propio del OCR se conserva aunque nuestro cálculo ya cuadre — es
    // información sobre la consistencia interna del documento, no de nuestro cálculo.
    expect(factura.avisosOcr?.length).toBe(1);
    expect(factura.avisosOcr?.[0]).toContain('Significant discrepancy');
  });

  it('sin avisos del OCR y con el total cuadrado, avisosOcr queda sin definir (no un array vacío)', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          lines: [{ description: 'x', taxable_base: '100', tax_rate: '21' }],
          totals: { total: '121' }, // 100 + 21% = 121, cuadra exacto
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.avisosOcr).toBeUndefined();
  });

  it('si nuestro total calculado no coincide con el declarado, añade un aviso propio explicando el desajuste', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          lines: [{ description: 'x', taxable_base: '100', tax_rate: '21' }],
          totals: { total: '999' }, // deliberadamente distinto de 121 (100 + 21%)
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.avisosOcr?.length).toBe(1);
    expect(factura.avisosOcr?.[0]).toContain('no coincide');
    expect(factura.avisosOcr?.[0]).toContain('999');
  });

  it('una diferencia de solo 1 céntimo (redondeo normal) NO genera aviso — el margen es intencional', async () => {
    apiSpy.postMultipart.and.resolveTo({
      success: true,
      document: {
        invoice: {
          lines: [{ description: 'x', taxable_base: '100', tax_rate: '21' }],
          totals: { total: '121.01' }, // 1 céntimo de diferencia, dentro del margen
        },
      },
    });

    const factura = await repo.crearDesdeOcr(archivoDePrueba());
    expect(factura.avisosOcr).toBeUndefined();
  });
});

describe('HttpReceivedInvoicesRepository — el resto de operaciones sigue delegando en el mock', () => {
  let repo: HttpReceivedInvoicesRepository;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['postMultipart', 'post', 'get']);
    apiSpy.post.and.resolveTo([]);
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));
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

  it('crearManual/listar/eliminar siguen funcionando igual que en el mock (sin backend de Recibidas aún)', async () => {
    const inicial = (await repo.listar()).length;

    const creada = repo.crearManual({
      proveedor: 'Proveedor manual', numFactura: 'M-1', fecha: '2026-08-11', vencimiento: '',
      lineas: [{ id: repo.nuevoIdLinea(), origen: 'manual', descripcion: 'x', cantidad: 1, precioUnitario: 10, descuentoPct: 0, ivaPct: 21 }],
      retencionPct: 0, pagada: false, estado: 'borrador',
    });

    expect((await repo.listar()).length).toBe(inicial + 1);
    expect(creada.origenOcr).toBeFalse();

    repo.eliminar(creada.id);
    expect((await repo.listar()).length).toBe(inicial);
  });
});
