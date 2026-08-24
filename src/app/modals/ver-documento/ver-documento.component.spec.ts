import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { VerDocumentoComponent } from './ver-documento.component';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

// Encontrado en revisión 2026-08-19: <img> nunca ha podido mostrar un PDF (el tipo más
// habitual en una factura) — mostraba un icono de imagen rota. 'tipo' decide si se usa
// <embed type="application/pdf"> o <img>, para que un PDF real se vea de verdad.
describe('VerDocumentoComponent', () => {
  let fixture: ComponentFixture<VerDocumentoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VerDocumentoComponent],
      providers: [provideIonicAngular(), ...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(VerDocumentoComponent);
  });

  it('con tipo application/pdf, muestra un <embed> en vez de un <img>', () => {
    fixture.componentInstance.url = 'blob:mock';
    fixture.componentInstance.tipo = 'application/pdf';
    fixture.detectChanges();

    const embed = fixture.nativeElement.querySelector('embed');
    const img = fixture.nativeElement.querySelector('img');
    expect(embed).not.toBeNull();
    expect(embed.getAttribute('src')).toBe('blob:mock');
    expect(img).toBeNull();
  });

  it('con un tipo de imagen, muestra un <img> en vez de un <embed>', () => {
    fixture.componentInstance.url = 'blob:mock';
    fixture.componentInstance.tipo = 'image/jpeg';
    fixture.detectChanges();

    const embed = fixture.nativeElement.querySelector('embed');
    const img = fixture.nativeElement.querySelector('img');
    expect(img).not.toBeNull();
    expect(embed).toBeNull();
  });

  it('sin tipo informado, cae a <img> (comportamiento anterior, no rompe nada)', () => {
    fixture.componentInstance.url = 'data:image/png;base64,AAAA';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });
});
