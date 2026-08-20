import { crearBorradorDesdeDocumentoBancario, DocumentoBancarioAnalizado, esDocumentoBancarioAnalizado } from './documento-bancario';

describe('esDocumentoBancarioAnalizado', () => {
  it('reconoce un DocumentoBancarioAnalizado válido', () => {
    expect(esDocumentoBancarioAnalizado({
      tipoDocumento: 'bank_document', datos: {}, avisos: [], nombreArchivo: 'x.pdf',
    })).toBeTrue();
  });

  it('rechaza cualquier otra cosa (factura, null, primitivo)', () => {
    expect(esDocumentoBancarioAnalizado({ id: 1, proveedor: 'x' })).toBeFalse();
    expect(esDocumentoBancarioAnalizado(null)).toBeFalse();
    expect(esDocumentoBancarioAnalizado('bank_document')).toBeFalse();
  });
});

describe('crearBorradorDesdeDocumentoBancario', () => {
  let nuevoId: number;
  const nuevoIdLinea = () => ++nuevoId;

  beforeEach(() => { nuevoId = 0; });

  // Caso real de aceptación: 4QHPJO04H000.pdf (Sabadell) — respuesta REAL capturada de
  // /api/FacturasRecibidas/CrearDesdeDocumento el 2026-08-20 (ver el JSON completo en el
  // historial de conversación). Los importes van dentro de `totals`, no de un supuesto
  // `amounts` — la primera versión de este mapeo adivinó mal esa clave y dejaba el importe a
  // 0€ en el borrador real; este test reproduce exactamente esa forma para que no vuelva a
  // pasar desapercibido.
  it('mapea un abono de remesa real (respuesta real capturada) a un borrador revisable', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document',
      nombreArchivo: '4QHPJO04H000.pdf',
      documentoUrl: 'data:application/pdf;base64,AAAA',
      confianza: 0.98,
      avisos: [],
      datos: {
        bank_name: 'Sabadell',
        document_subtype: 'direct_debit_remittance',
        reference: 'B8475038920260717090115',
        document_date: '2026-07-17',
        account_holder: null,
        account_iban: 'ES4300817118520001205528',
        currency: 'EUR',
        entries: [{
          reference: '027610026565',
          counterparty_name: 'ACERCA PARTNERS SL .',
          counterparty_iban: 'ES1300810640680001900597',
          description: '4QHPJO04H000',
          amount: '641.93',
          currency: 'EUR',
          due_date: '2026-07-17',
          value_date: '2026-07-17',
          commission: '0.9',
          postage: '0.0',
          tax_amount: '0.19',
          net_amount: '640.84',
          status: 'EN GESTION',
        }],
        totals: {
          nominal_amount: '641.93',
          commission_amount: '0.9',
          postage_amount: '0.0',
          tax_amount: '0.19',
          net_amount: '640.84',
        },
        value_date: '2026-07-17',
        notes: [],
      },
    };

    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);

    expect(borrador.proveedor).toBe('Banco Sabadell');
    expect(borrador.numFactura).toBe('B8475038920260717090115');
    expect(borrador.fecha).toBe('2026-07-17');
    expect(borrador.concepto).toBe('Abono de remesa de adeudos directos');
    expect(borrador.idProveedor).toBeUndefined(); // sin proveedor real: exige completar a mano
    expect(borrador.estado).toBe('borrador');
    expect(borrador.pagada).toBeFalse();
    expect(borrador.lineas.length).toBe(1);
    expect(borrador.lineas[0].precioUnitario).toBe(640.84); // neto de totals, no el nominal
    expect(borrador.lineas[0].ivaPct).toBe(0);
    expect(borrador.documentoUrl).toBe('data:application/pdf;base64,AAAA');
    expect(borrador.documentoNombre).toBe('4QHPJO04H000.pdf');
    expect(borrador.avisosOcr?.[0]).toContain('revisa proveedor, concepto e importe');
  });

  it('sin totals.net_amount, cae al nominal de totals', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [],
      datos: { totals: { nominal_amount: '100.00' } },
    };
    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(borrador.lineas[0].precioUnitario).toBe(100);
  });

  it('sin totals, cae al importe de la primera entrada (entries[0])', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [],
      datos: { entries: [{ amount: '50.00', net_amount: '49.50' }] },
    };
    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(borrador.lineas[0].precioUnitario).toBe(49.5); // neto de la entrada, no el bruto
  });

  it('un document_subtype desconocido se muestra legible en vez de crudo', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [],
      datos: { document_subtype: 'unknown_future_subtype' },
    };
    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(borrador.concepto).toBe('Unknown future subtype');
  });

  it('sin ningún importe reconocible, no revienta: usa 0', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [], datos: {},
    };
    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(borrador.lineas[0].precioUnitario).toBe(0);
    expect(borrador.proveedor).toBe('Documento bancario sin proveedor identificado');
    expect(borrador.numFactura).toBe('');
  });

  it('acepta importes ya numéricos (no solo strings) y con coma decimal', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [],
      datos: { net_amount: '640,84' },
    };
    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(borrador.lineas[0].precioUnitario).toBe(640.84);
  });

  it('cada línea generada usa un id nuevo real, no un valor fijo', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [], datos: {},
    };
    const b1 = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    const b2 = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(b1.lineas[0].id).not.toBe(b2.lineas[0].id);
  });
});
