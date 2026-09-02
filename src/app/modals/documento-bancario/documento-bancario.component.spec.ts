import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { DocumentoBancarioComponent } from './documento-bancario.component';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('DocumentoBancarioComponent', () => {
  let fixture: ComponentFixture<DocumentoBancarioComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentoBancarioComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting({
          es: {
            common: { yes: 'Sí', no: 'No' },
            bankDocuments: {
              title: 'Documento bancario',
              detectedNotice: 'El lector ha detectado un documento bancario.',
              detectedDescription: 'Se muestran los datos extraídos para su revisión. No se ha creado ninguna factura recibida.',
              confidence: 'Confianza:',
              readerWarnings: 'Avisos del lector',
              noFieldsNotice: 'El lector clasificó el fichero, pero no devolvió campos bancarios para mostrar.',
              viewOriginal: 'Ver documento original',
              analysisId: 'Identificador de análisis:',
              generalDataSection: 'Datos generales',
              valueLabel: 'Valor',
              fields: {
                documentType: 'Tipo de documento',
                debtor: 'Deudor',
                debtorName: 'Nombre del deudor',
                debtorIban: 'IBAN del deudor',
                amounts: 'Importes',
                nominalAmount: 'Importe nominal',
                commission: 'Comisión',
                taxes: 'Impuestos',
                netAmount: 'Importe neto',
              },
            },
          },
        }),
      ],
    });
    fixture = TestBed.createComponent(DocumentoBancarioComponent);
  });

  it('muestra campos anidados y deja claro que no ha creado una factura', async () => {
    fixture.componentInstance.documento = {
      tipoDocumento: 'bank_document',
      nombreArchivo: '4QHPJO04H000.pdf',
      confianza: 0.98,
      avisos: [],
      datos: {
        document_title: 'Abono de remesa de adeudos directos',
        debtor: { debtor_name: 'ACERCA PARTNERS SL', debtor_iban: 'ES13 0081 0640 6800 0190 0597' },
        amounts: { nominal_amount: '641.93', commission: '0.90', tax_amount: '0.19', net_amount: '640.84' },
      },
    };

    // TranslocoPipe resuelve de forma asíncrona (se suscribe a langChanges$, que a su vez
    // depende de que el loader de prueba resuelva su Promise) — un único detectChanges()
    // síncrono deja todas las traducciones vía pipe (a diferencia de las que el propio
    // componente resuelve con transloco.translate() en ngOnInit, esas sí síncronas) en blanco.
    // Bug real encontrado en revisión (2026-09-02): el test no esperaba a que se estabilizara.
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('No se ha creado ninguna factura recibida');
    expect(texto).toContain('Abono de remesa de adeudos directos');
    expect(texto).toContain('ACERCA PARTNERS SL');
    expect(texto).toContain('640.84');
    expect(texto).toContain('Confianza: 98%');
  });

  it('muestra avisos y el request_id para poder rastrear el análisis', async () => {
    fixture.componentInstance.documento = {
      tipoDocumento: 'bank_document',
      nombreArchivo: 'banco.pdf',
      avisos: ['Revisar manualmente el importe líquido.'],
      datos: {},
      requestId: 'ocr-request-123',
    };

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Revisar manualmente el importe líquido.');
    expect(texto).toContain('ocr-request-123');
    expect(texto).toContain('no devolvió campos bancarios');
  });

  it('sin documentoUrl no muestra el botón "Ver documento original"', () => {
    fixture.componentInstance.documento = {
      tipoDocumento: 'bank_document',
      nombreArchivo: 'banco.pdf',
      avisos: [],
      datos: { referencia: '027610026565' },
    };

    fixture.detectChanges();
    const botones = Array.from(fixture.nativeElement.querySelectorAll('ion-button')) as HTMLElement[];
    expect(botones.some(b => b.textContent?.includes('Ver documento original'))).toBeFalse();
  });
});
