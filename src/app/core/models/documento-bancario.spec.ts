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

  // Caso real de aceptación: 4QHPJO04H000.pdf (Sabadell).
  it('mapea un abono de remesa real a un borrador revisable', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document',
      nombreArchivo: '4QHPJO04H000.pdf',
      documentoUrl: 'data:application/pdf;base64,AAAA',
      confianza: 0.98,
      avisos: ['Revisar la conciliación antes de contabilizar.'],
      datos: {
        bank: 'Sabadell',
        document_title: 'Abono de remesa de adeudos directos',
        reference: '027610026565',
        value_date: '2026-07-17',
        amounts: { nominal: '641.93', commission: '0.90', net: '640.84' },
      },
    };

    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);

    expect(borrador.proveedor).toBe('Banco Sabadell');
    expect(borrador.numFactura).toBe('027610026565');
    expect(borrador.fecha).toBe('2026-07-17');
    expect(borrador.concepto).toBe('Abono de remesa de adeudos directos');
    expect(borrador.idProveedor).toBeUndefined(); // sin proveedor real: exige completar a mano
    expect(borrador.estado).toBe('borrador');
    expect(borrador.pagada).toBeFalse();
    expect(borrador.lineas.length).toBe(1);
    expect(borrador.lineas[0].precioUnitario).toBe(640.84); // neto, no el nominal ni la comisión
    expect(borrador.lineas[0].ivaPct).toBe(0);
    expect(borrador.documentoUrl).toBe('data:application/pdf;base64,AAAA');
    expect(borrador.documentoNombre).toBe('4QHPJO04H000.pdf');
    expect(borrador.avisosOcr).toContain('Revisar la conciliación antes de contabilizar.');
    expect(borrador.avisosOcr?.[0]).toContain('revisa proveedor, concepto e importe');
  });

  it('sin neto, cae al nominal', () => {
    const documento: DocumentoBancarioAnalizado = {
      tipoDocumento: 'bank_document', nombreArchivo: 'x.pdf', avisos: [],
      datos: { amounts: { nominal: '100.00' } },
    };
    const borrador = crearBorradorDesdeDocumentoBancario(documento, nuevoIdLinea);
    expect(borrador.lineas[0].precioUnitario).toBe(100);
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
