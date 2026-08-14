import { TestBed } from '@angular/core/testing';

import { HttpReceivedInvoicesRepository } from './received-invoices.repository.http';
import { MockReceivedInvoicesRepository } from '../mock/received-invoices.repository.mock';
import { FacturaRecibida, MockFacturasService } from '../../../services/mock-facturas.service';
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
          issuer: {
            legal_name: 'Demo Telecom S.L.', tax_id: 'B99999999',
            address: 'Calle Falsa 123', postal_code: '28001', city: 'Madrid', province: 'Madrid',
          },
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
    expect(factura.proveedorDireccion).toBe('Calle Falsa 123');
    expect(factura.proveedorCp).toBe('28001');
    expect(factura.proveedorPoblacion).toBe('Madrid');
    expect(factura.proveedorProvincia).toBe('Madrid');
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

describe('HttpReceivedInvoicesRepository — listar/obtenerPorId/eliminar/duplicar/guardado real', () => {
  let repo: HttpReceivedInvoicesRepository;

  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['postMultipart', 'post', 'get', 'delete']);
    apiSpy.post.and.resolveTo([]);
    apiSpy.get.and.rejectWith(new Error('HTTP 404'));
    apiSpy.delete.and.rejectWith(new Error('HTTP 404'));
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

  it('listar() manda query/pagada como nombreProveedor/pagada en el body de Enumerar', async () => {
    await repo.listar({ query: 'Iberdrola', pagada: true });

    expect(apiSpy.post).toHaveBeenCalledWith(
      '/api/FacturasRecibidas/Enumerar',
      jasmine.objectContaining({ nombreProveedor: 'Iberdrola', pagada: true, top: 50 }),
    );
  });

  it('listar() sin filtros no manda nombreProveedor ni pagada, solo top', async () => {
    await repo.listar();

    const [, body] = apiSpy.post.calls.mostRecent().args;
    expect(body).toEqual({ top: 50 });
  });

  // BUG real encontrado en pruebas manuales 2026-08-14: antes los borradores locales se
  // anexaban siempre al final, así que un borrador recién creado (fecha de hoy) quedaba
  // enterrado detrás de facturas reales más antiguas y parecía "no haberse guardado".
  it('mezcla facturas reales y borradores locales ordenados por fecha, no con los locales siempre al final', async () => {
    apiSpy.post.and.resolveTo([
      {
        idFacturaRecibida: 1, numFacRec: 'R-1', idProveedor: 1, nombreProveedor: 'Antigua',
        concepto: 'x', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
        pagada: false, estado: 131, escaneada: false,
        fechaFactura: '2020-01-01', fechaVencimiento: '2020-02-01',
        idMedioPago: null, idTipoFactura: 1, lineas: [],
      },
    ]);
    const mockAdapter = TestBed.inject(MockReceivedInvoicesRepository);
    const borrador = await mockAdapter.crearManual({
      proveedor: 'Borrador de hoy', numFactura: 'L-1', fecha: '2030-01-01', vencimiento: '',
      lineas: [{ id: mockAdapter.nuevoIdLinea(), origen: 'manual', descripcion: 'x', cantidad: 1, precioUnitario: 10, descuentoPct: 0, ivaPct: 21 }],
      retencionPct: 0, pagada: false, estado: 'borrador',
    });

    const lista = await repo.listar();

    expect(lista[0].id).toBe(borrador.id); // el borrador (fecha futura/más reciente) va primero
    expect(lista[1].proveedor).toBe('Antigua');
  });

  // Confirmado con el jefe: Recibidas reutiliza los códigos de Estado de Emitidas —
  // 131 = borrador, 132 = revisada.
  it('listar() manda el filtro de estado como el código numérico confirmado (131/132)', async () => {
    await repo.listar({ estado: 'borrador' });
    expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Enumerar', jasmine.objectContaining({ estado: 131 }));

    await repo.listar({ estado: 'revisada' });
    expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Enumerar', jasmine.objectContaining({ estado: 132 }));
  });

  it('obtenerPorId() mapea el estado numérico del backend (131/132) al estado de la app', async () => {
    apiSpy.get.and.resolveTo({
      idFacturaRecibida: 500, numFacRec: 'F-500', idProveedor: 1, nombreProveedor: 'Proveedor',
      concepto: 'x', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
      pagada: false, estado: 131, escaneada: false,
      fechaFactura: '2026-08-01', fechaVencimiento: '2026-09-01',
      idMedioPago: null, idTipoFactura: 1, lineas: [],
    });

    const factura = await repo.obtenerPorId(500);
    expect(factura?.estado).toBe('borrador');
  });

  // Cubre el flujo "recargar el detalle y conservar IVA e identificadores" pedido en
  // revisión 2026-08-14: al reabrir una factura real, cada línea debe traer de vuelta su %
  // de IVA real (reconstruido desde idImpuesto, nunca 0%) y su id real de línea, para que un
  // guardado posterior actualice en vez de duplicar.
  it('obtenerPorId() reconstruye ivaPct e idLineaBackend de cada línea desde el catálogo de impuestos', async () => {
    apiSpy.post.and.resolveTo([
      { idImpuesto: 1, descripcion: 'IVA 21%', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' },
      { idImpuesto: 2, descripcion: 'IVA 10%', porcentaje: 10, literalFactura: null, tipoFacturaE: 'IVA' },
    ]);
    apiSpy.get.and.resolveTo({
      idFacturaRecibida: 503, numFacRec: 'F-503', idProveedor: 1, nombreProveedor: 'Proveedor',
      concepto: 'x', total: 140, iva: 25, suplidos: 0, irpf: 0, importe: 165,
      pagada: false, estado: 131, escaneada: false,
      fechaFactura: '2026-08-01', fechaVencimiento: '2026-09-01',
      idMedioPago: null, idTipoFactura: 1,
      lineas: [
        { idFacturaRecibidaLinea: 10, descripcion: 'Línea A', cantidad: 2, precioUnitario: 50, importe: 100, idImpuesto: 1 },
        { idFacturaRecibidaLinea: 11, descripcion: 'Línea B', cantidad: 1, precioUnitario: 40, importe: 40, idImpuesto: 2 },
      ],
    });

    const factura = await repo.obtenerPorId(503);

    expect(factura?.lineas[0].ivaPct).toBe(21);
    expect(factura?.lineas[0].idLineaBackend).toBe(10);
    expect(factura?.lineas[1].ivaPct).toBe(10);
    expect(factura?.lineas[1].idLineaBackend).toBe(11);
  });

  it('limpia el punto de relleno del apellido1 al final de nombreProveedor', async () => {
    apiSpy.get.and.resolveTo({
      idFacturaRecibida: 502, numFacRec: 'F-502', idProveedor: 1,
      nombreProveedor: 'Iberdrola Clientes, S.A.U. .',
      concepto: 'x', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
      pagada: false, estado: 131, escaneada: false,
      fechaFactura: '2026-08-01', fechaVencimiento: '2026-09-01',
      idMedioPago: null, idTipoFactura: 1, lineas: [],
    });

    const factura = await repo.obtenerPorId(502);
    expect(factura?.proveedor).toBe('Iberdrola Clientes, S.A.U.');
  });

  it('obtenerPorId() copia idMedioPago del backend cuando viene informado', async () => {
    apiSpy.get.and.resolveTo({
      idFacturaRecibida: 501, numFacRec: 'F-501', idProveedor: 1, nombreProveedor: 'Proveedor',
      concepto: 'x', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
      pagada: false, estado: 131, escaneada: false,
      fechaFactura: '2026-08-01', fechaVencimiento: '2026-09-01',
      idMedioPago: 3, idTipoFactura: 1, lineas: [],
    });

    const factura = await repo.obtenerPorId(501);
    expect(factura?.idMedioPago).toBe(3);
  });

  // BUG real corregido 2026-08-14 (auditoría): antes cualquier fallo del GET (no solo un
  // 404) caía al almacén local — un 500/timeout real hacía que, si por casualidad existía
  // un borrador local con el mismo id numérico, se mostrara esa factura equivocada sin
  // ningún aviso de que hubo un error real.
  it('si el GET falla por algo que NO es un 404, propaga el error en vez de caer al almacén local', async () => {
    apiSpy.get.and.rejectWith(new Error('HTTP 500 - Error interno del servidor.'));

    await expectAsync(repo.obtenerPorId(502)).toBeRejectedWithError(/500/);
  });

  describe('obtenerMediosPago() / obtenerPorcentajesIva()', () => {
    it('obtenerMediosPago() llama a MediosPago/Enumerar y arma la etiqueta con descFormaPago + descripcion', async () => {
      apiSpy.post.and.resolveTo([
        { idMedioPago: 1, descFormaPago: 'Transferencia', descripcion: 'Sabadell' },
        { idMedioPago: 2, descFormaPago: 'Contado', descripcion: null },
      ]);

      const opciones = await repo.obtenerMediosPago();

      expect(apiSpy.post).toHaveBeenCalledWith('/api/MediosPago/Enumerar', {});
      expect(opciones).toEqual([
        { id: 1, label: 'Transferencia — Sabadell' },
        { id: 2, label: 'Contado' },
      ]);
    });

    it('obtenerPorcentajesIva() reutiliza el catálogo de Impuestos, sin duplicados y ordenado', async () => {
      apiSpy.post.and.resolveTo([
        { idImpuesto: 1, descripcion: 'IVA 21%', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' },
        { idImpuesto: 2, descripcion: 'IVA 21% (otro)', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' },
        { idImpuesto: 3, descripcion: 'IVA 10%', porcentaje: 10, literalFactura: null, tipoFacturaE: 'IVA' },
      ]);

      const porcentajes = await repo.obtenerPorcentajesIva();

      expect(porcentajes).toEqual([10, 21]);
    });
  });

  // Regresión: antes duplicar() recibía solo el id y delegaba en el mock, que buscaba ese
  // id en su propio almacén — las facturas reales del backend NUNCA están ahí (solo viven
  // en la respuesta de Enumerar/Obtener), así que "Copiar" sobre cualquier factura real
  // fallaba en silencio. Ahora recibe el objeto completo, así que no hace falta ninguna
  // búsqueda y funciona igual para facturas reales que para locales.
  it('duplicar() funciona con una factura "real" (accountingLocked, ausente del almacén del mock)', () => {
    const facturaReal: FacturaRecibida = {
      id: 999999, proveedor: 'Iberdrola', proveedorNif: 'A95758389', numFactura: 'F-999999',
      fecha: '2026-08-01', lineas: [], retencionPct: 0, pagada: true, estado: 'revisada',
      origenOcr: false, accountingLocked: true,
    };

    const copia = repo.duplicar(facturaReal);

    expect(copia).toBeTruthy();
    expect(copia.proveedor).toBe('Iberdrola');
    expect(copia.id).not.toBe(facturaReal.id);
    expect(copia.estado).toBe('borrador'); // una copia siempre nace como borrador nuevo
  });

  describe('eliminar()', () => {
    it('llama a DELETE /api/FacturasRecibidas/{id}', async () => {
      apiSpy.delete.and.resolveTo(undefined);
      await repo.eliminar(500);
      expect(apiSpy.delete).toHaveBeenCalledWith('/api/FacturasRecibidas/500');
    });

    it('si el DELETE falla (404, borrador local todavía sin guardar), cae al almacén local', async () => {
      const mockAdapter = TestBed.inject(MockReceivedInvoicesRepository);
      const creada = await mockAdapter.crearManual({
        proveedor: 'Borrador local', numFactura: 'L-1', fecha: '2026-08-11', vencimiento: '',
        lineas: [{ id: mockAdapter.nuevoIdLinea(), origen: 'manual', descripcion: 'x', cantidad: 1, precioUnitario: 10, descuentoPct: 0, ivaPct: 21 }],
        retencionPct: 0, pagada: false, estado: 'borrador',
      });

      await repo.eliminar(creada.id);

      expect(await mockAdapter.obtenerPorId(creada.id)).toBeUndefined();
    });

    // BUG real corregido 2026-08-14: antes se caía al almacén local con CUALQUIER error del
    // DELETE, no solo un 404 — si el backend rechazaba el borrado por una regla de negocio
    // real (ej. factura pagada / con analítica asociada, mencionado por el jefe en reunión),
    // el usuario veía "Factura eliminada" como si hubiera ido bien, sin haberse borrado de
    // verdad. Ahora solo un 404 cae al almacén local; cualquier otro error se propaga.
    it('si el DELETE falla por algo que NO es un 404 (ej. rechazado por regla de negocio), propaga el error en vez de tragárselo', async () => {
      apiSpy.delete.and.rejectWith(new Error('HTTP 400 - No se puede eliminar: la factura ya está pagada.'));

      await expectAsync(repo.eliminar(777)).toBeRejectedWithError(/ya está pagada/);
    });
  });

  describe('crearManual() / actualizar() — guardado real contra POST Guardar', () => {
    const datosBase = {
      proveedor: 'Proveedor manual', idProveedor: 7, numFactura: 'M-1', fecha: '2026-08-11', vencimiento: '',
      concepto: 'Prueba', formaPago: 'Transferencia',
      lineas: [{ id: 1, origen: 'manual' as const, descripcion: 'Línea', cantidad: 2, precioUnitario: 50, descuentoPct: 0, ivaPct: 21 }],
      retencionPct: 0, pagada: false, estado: 'borrador' as const,
    };

    function stubCatalogos() {
      apiSpy.post.and.callFake((path: string): Promise<any> => {
        if (path === '/api/Impuesto/Enumerar') {
          return Promise.resolve([
            { idImpuesto: 1, descripcion: 'IVA 21%', porcentaje: 21, literalFactura: 'IVA 21%', tipoFacturaE: 'IVA' },
            { idImpuesto: 2, descripcion: 'IVA 10%', porcentaje: 10, literalFactura: 'IVA 10%', tipoFacturaE: 'IVA' },
          ]);
        }
        if (path === '/api/FacturasRecibidas/Guardar') {
          return Promise.resolve({
            idFacturaRecibida: 900, numFacRec: 'M-1', idProveedor: 7, nombreProveedor: 'Proveedor manual',
            concepto: 'Prueba', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
            pagada: false, estado: 131, escaneada: false,
            fechaFactura: '2026-08-11', fechaVencimiento: '2026-08-11',
            idMedioPago: null, idTipoFactura: 3, lineas: [],
          });
        }
        return Promise.resolve([]);
      });
      apiSpy.get.and.resolveTo({ idTipoFactura: 3, descriTipoNumerador: 'Facturas', textoMail: null });
    }

    it('rechaza sin llamar a nada si falta idProveedor', async () => {
      await expectAsync(repo.crearManual({ ...datosBase, idProveedor: undefined }))
        .toBeRejectedWithError(/Selecciona el proveedor/);
      expect(apiSpy.post).not.toHaveBeenCalled();
    });

    it('rechaza sin llamar a nada si falta el número de factura', async () => {
      await expectAsync(repo.crearManual({ ...datosBase, numFactura: '' }))
        .toBeRejectedWithError('El número de factura es obligatorio.');
      expect(apiSpy.post).not.toHaveBeenCalled();
    });

    it('resuelve idImpuesto por porcentaje y manda idTipoFactura + idProveedor a Guardar', async () => {
      stubCatalogos();

      const creada = await repo.crearManual(datosBase);

      expect(apiSpy.post).toHaveBeenCalledWith('/api/Impuesto/Enumerar', { tipo: 'IVA' });
      expect(apiSpy.get).toHaveBeenCalledWith('/api/FacturasRecibidas/TipoFactura');
      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({
        idProveedor: 7,
        numFacRec: 'M-1',
        idTipoFactura: 3,
        idMedioPago: null, // no se eligió forma de pago en datosBase
        lineas: [jasmine.objectContaining({ idImpuesto: 1 })], // 21% → idImpuesto 1
      }));
      expect(creada.id).toBe(900);
    });

    it('manda idMedioPago cuando el usuario eligió una forma de pago del desplegable', async () => {
      stubCatalogos();

      await repo.crearManual({ ...datosBase, idMedioPago: 4 });

      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({
        idMedioPago: 4,
      }));
    });

    it('con porcentajes duplicados en el catálogo, usa el primero que devuelve el backend', async () => {
      apiSpy.post.and.callFake((path: string): Promise<any> => {
        if (path === '/api/Impuesto/Enumerar') {
          return Promise.resolve([
            { idImpuesto: 5, descripcion: 'IVA 21% (antiguo)', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' },
            { idImpuesto: 6, descripcion: 'IVA 21% (nuevo)', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' },
          ]);
        }
        return Promise.resolve({
          idFacturaRecibida: 901, numFacRec: 'M-1', idProveedor: 7, nombreProveedor: null,
          concepto: 'Prueba', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
          pagada: false, estado: 131, escaneada: false,
          fechaFactura: '2026-08-11', fechaVencimiento: '2026-08-11',
          idMedioPago: null, idTipoFactura: 3, lineas: [],
        });
      });
      apiSpy.get.and.resolveTo({ idTipoFactura: 3, descriTipoNumerador: 'Facturas', textoMail: null });

      await repo.crearManual(datosBase);

      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({
        lineas: [jasmine.objectContaining({ idImpuesto: 5 })],
      }));
    });

    it('si ningún % del catálogo coincide con el de la línea, rechaza con un mensaje claro', async () => {
      apiSpy.post.and.callFake((path: string): Promise<any> => {
        if (path === '/api/Impuesto/Enumerar') {
          return Promise.resolve([{ idImpuesto: 2, descripcion: 'IVA 10%', porcentaje: 10, literalFactura: null, tipoFacturaE: 'IVA' }]);
        }
        return Promise.resolve([]);
      });
      apiSpy.get.and.resolveTo({ idTipoFactura: 3, descriTipoNumerador: 'Facturas', textoMail: null });

      await expectAsync(repo.crearManual(datosBase)).toBeRejectedWithError(/21%/);
    });

    it('cachea Impuestos y TipoFactura: dos guardados seguidos solo piden cada catálogo una vez', async () => {
      stubCatalogos();

      await repo.crearManual(datosBase);
      await repo.crearManual(datosBase);

      const llamadasImpuesto = apiSpy.post.calls.allArgs().filter(([path]) => path === '/api/Impuesto/Enumerar');
      expect(llamadasImpuesto.length).toBe(1);
      expect(apiSpy.get).toHaveBeenCalledTimes(1);
    });

    it('actualizar() sobre un borrador local (primera vez) manda un alta y borra el borrador local previo', async () => {
      stubCatalogos();
      const mockAdapter = TestBed.inject(MockReceivedInvoicesRepository);
      const borrador = await mockAdapter.crearManual(datosBase);

      const guardada = await repo.actualizar(borrador.id, datosBase);

      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({ idFacturaRecibida: undefined }));
      expect(guardada.id).toBe(900); // id real devuelto por Guardar, no el id local del borrador
      expect(await mockAdapter.obtenerPorId(borrador.id)).toBeUndefined(); // borrador local limpiado
    });

    // BUG real corregido 2026-08-14 (guardado duplicado): antes actualizar() SIEMPRE mandaba
    // un alta, incluso sobre un id que ya era real (guardado antes en la misma sesión) —
    // pulsar "Guardar" una segunda vez creaba una fila nueva en vez de actualizar la
    // existente, dejando la anterior huérfana. Ahora, una vez que el id ya no está en el
    // almacén local (se limpió tras el primer guardado), actualizar() manda idFacturaRecibida
    // y el mismo id se conserva.
    it('actualizar() una segunda vez sobre la misma factura ya real actualiza la misma fila, no crea otra', async () => {
      stubCatalogos();

      const primera = await repo.crearManual(datosBase);
      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({ idFacturaRecibida: undefined }));

      const segunda = await repo.actualizar(primera.id, { ...datosBase, concepto: 'Corregido tras el primer guardado' });

      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({ idFacturaRecibida: primera.id }));
      expect(segunda.id).toBe(primera.id);
    });

    it('preserva idLineaBackend de las líneas ya existentes al reguardar (GuardarAsync las actualiza, no las duplica)', async () => {
      stubCatalogos();
      const conLineaReal = {
        ...datosBase,
        lineas: [{ id: 1, origen: 'manual' as const, descripcion: 'Línea real', cantidad: 1, precioUnitario: 100, descuentoPct: 0, ivaPct: 21, idLineaBackend: 555 }],
      };

      await repo.crearManual(conLineaReal);

      expect(apiSpy.post).toHaveBeenCalledWith('/api/FacturasRecibidas/Guardar', jasmine.objectContaining({
        lineas: [jasmine.objectContaining({ idFacturaRecibidaLinea: 555 })],
      }));
    });
  });

  describe('crearDesdeDocumentoDirecto() — "guardado rápido" contra el endpoint todo-en-uno', () => {
    it('sube el fichero a CrearDesdeDocumento, mapea la respuesta y reconstruye ivaPct/idLineaBackend', async () => {
      apiSpy.post.and.resolveTo([
        { idImpuesto: 1, descripcion: 'IVA 21%', porcentaje: 21, literalFactura: null, tipoFacturaE: 'IVA' },
      ]);
      apiSpy.postMultipart.and.resolveTo({
        factura: {
          idFacturaRecibida: 700, numFacRec: 'D-1', idProveedor: 7, nombreProveedor: 'Iberdrola Clientes, S.A.U. .',
          concepto: 'Pendiente de revisar', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
          pagada: false, estado: 131, escaneada: true,
          fechaFactura: '2026-08-14', fechaVencimiento: '2026-08-14',
          idMedioPago: null, idTipoFactura: 3,
          lineas: [{ idFacturaRecibidaLinea: 55, descripcion: 'Luz', cantidad: 1, precioUnitario: 100, importe: 100, idImpuesto: 1 }],
        },
        avisos: [],
      });

      const factura = await repo.crearDesdeDocumentoDirecto(archivoDePrueba());

      expect(apiSpy.postMultipart).toHaveBeenCalledWith('/api/FacturasRecibidas/CrearDesdeDocumento', jasmine.anything(), 'file');
      expect(factura.id).toBe(700);
      expect(factura.proveedor).toBe('Iberdrola Clientes, S.A.U.'); // limpia el punto de apellido1
      expect(factura.lineas.length).toBe(1);
      expect(factura.lineas[0].ivaPct).toBe(21); // reconstruido desde idImpuesto→% del catálogo
      expect(factura.lineas[0].idLineaBackend).toBe(55);
      // estado 131/borrador: se puede reeditar y volver a guardar — ya no se bloquea
      // indiscriminadamente toda factura leída del backend (corregido 2026-08-14).
      expect(factura.accountingLocked).toBeFalse();
    });

    it('añade los avisos propios del endpoint (ej. documento no subido) a avisosOcr', async () => {
      apiSpy.postMultipart.and.resolveTo({
        factura: {
          idFacturaRecibida: 701, numFacRec: 'D-2', idProveedor: 7, nombreProveedor: 'Proveedor',
          concepto: 'x', total: 100, iva: 21, suplidos: 0, irpf: 0, importe: 121,
          pagada: false, estado: 131, escaneada: true,
          fechaFactura: '2026-08-14', fechaVencimiento: '2026-08-14',
          idMedioPago: null, idTipoFactura: 3, lineas: [],
        },
        avisos: ['La factura se guardó correctamente, pero no se pudo subir el documento original.'],
      });

      const factura = await repo.crearDesdeDocumentoDirecto(archivoDePrueba());

      expect(factura.avisosOcr).toContain('La factura se guardó correctamente, pero no se pudo subir el documento original.');
    });

    it('propaga el error del backend (ej. proveedor no reconocido por NIF, 400) sin envolverlo', async () => {
      apiSpy.postMultipart.and.rejectWith(new Error("HTTP 400 - No existe ningún proveedor con NIF 'B00000000' para esta empresa."));

      await expectAsync(repo.crearDesdeDocumentoDirecto(archivoDePrueba())).toBeRejectedWithError(/NIF/);
    });
  });
});
