import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { DocumentoBancarioComponent } from './documento-bancario.component';

describe('DocumentoBancarioComponent', () => {
  let fixture: ComponentFixture<DocumentoBancarioComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentoBancarioComponent],
      providers: [provideIonicAngular()],
    });
    fixture = TestBed.createComponent(DocumentoBancarioComponent);
  });

  it('muestra campos anidados y deja claro que no ha creado una factura', () => {
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

    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('No se ha creado ninguna factura recibida');
    expect(texto).toContain('Abono de remesa de adeudos directos');
    expect(texto).toContain('ACERCA PARTNERS SL');
    expect(texto).toContain('640.84');
    expect(texto).toContain('Confianza: 98%');
  });

  it('muestra avisos y el request_id para poder rastrear el análisis', () => {
    fixture.componentInstance.documento = {
      tipoDocumento: 'bank_document',
      nombreArchivo: 'banco.pdf',
      avisos: ['Revisar manualmente el importe líquido.'],
      datos: {},
      requestId: 'ocr-request-123',
    };

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
