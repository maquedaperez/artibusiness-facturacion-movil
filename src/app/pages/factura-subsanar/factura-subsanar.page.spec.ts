import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { FacturaSubsanarPage } from './factura-subsanar.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';
import { IssuedInvoicesRepository } from '../../core/ports';
import { FacturaEmitida } from '../../services/mock-facturas.service';
import ES from '../../../assets/i18n/es.json';

// Traducciones REALES de la app, no una copia: este spec comprueba el texto que de verdad ve el
// usuario, y una copia a mano se queda obsoleta en cuanto se reescribe la traduccion — el test
// seguiria verde comprobando un texto que ya no existe.
const TRADUCCIONES_TEST = { es: ES };

// La auditoria (2026-09-02) acerto en que esta pantalla no tenia ninguna cobertura. Se cubre
// aqui la politica de "que se puede subsanar", que es lo unico que decide de verdad si el
// usuario avanza por un flujo fiscal o se le corta antes.
describe('FacturaSubsanarPage', () => {
  let component: FacturaSubsanarPage;
  let fixture: ComponentFixture<FacturaSubsanarPage>;

  function factura(overrides: Partial<FacturaEmitida> = {}): FacturaEmitida {
    return {
      id: 7,
      numFactura: 'A-2026-7',
      numeradorId: 2,
      fecha: '2026-09-02',
      vencimiento: '',
      concepto: 'Servicios',
      medioPago: 'Transferencia',
      destinatario: { nombre: 'Cliente SL', nif: 'B12345678', esEmpresa: true },
      lineas: [],
      estado: 'contabilizada',
      operacionId: 'op-7',
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FacturaSubsanarPage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS, ...provideTranslocoTesting(TRADUCCIONES_TEST), provideIonicAngular()],
    });
    fixture = TestBed.createComponent(FacturaSubsanarPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('puedeSubsanar', () => {
    it('permite subsanar una factura completa ya contabilizada', () => {
      component.factura = factura();
      expect(component.puedeSubsanar).toBeTrue();
    });

    // G05 de la auditoria: esta comprobacion se habia quedado sin '!esSimplificada', a
    // diferencia de la del detalle, asi que entrando por URL directa a
    // /app/emitidas/{idTicket}/subsanar se cargaba la previsualizacion y el boton de confirmar
    // llegaba a habilitarse para un ticket F2. El backend lo rechaza igualmente
    // (FacturaEmitidaAeatService), pero no tiene sentido dejar avanzar por un flujo cerrado.
    it('NO permite subsanar un ticket (factura simplificada), ni por URL directa', () => {
      component.factura = factura({ esSimplificada: true });
      expect(component.puedeSubsanar).toBeFalse();
    });

    it('no permite subsanar un borrador', () => {
      component.factura = factura({ estado: 'borrador' });
      expect(component.puedeSubsanar).toBeFalse();
    });

    it('no permite subsanar una factura ya anulada', () => {
      component.factura = factura({ anulada: true });
      expect(component.puedeSubsanar).toBeFalse();
    });
  });

  describe('carga inicial', () => {
    it('un ticket no llega a pedir la previsualizacion y explica por que', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'obtenerPorId').and.resolveTo(factura({ esSimplificada: true }));
      const previsualizarSpy = spyOn(repo, 'previsualizarSubsanacion');

      await component.ngOnInit();

      expect(previsualizarSpy).not.toHaveBeenCalled();
      // El motivo es el especifico del ticket, no el generico de "todavia es un borrador".
      // Con las traducciones reales cargadas, errorMsg trae el texto, no la clave. Se compara
      // contra el mismo JSON, asi que sigue verificando que sale el motivo ESPECIFICO del ticket
      // y no el generico de "todavia es un borrador".
      expect(component.errorMsg).toBe(ES.verifactu.errors.subsanarSimplificada);
      expect(component.errorMsg).not.toBe(ES.verifactu.errors.subsanarBorrador);
      expect(component.cargando).toBeFalse();
    });

    it('una factura completa contabilizada si pide la previsualizacion', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'obtenerPorId').and.resolveTo(factura());
      const previsualizarSpy = spyOn(repo, 'previsualizarSubsanacion')
        .and.resolveTo({ hayDiferencias: false, diferencias: [] });

      await component.ngOnInit();

      expect(previsualizarSpy).toHaveBeenCalled();
      expect(component.errorMsg).toBe('');
    });
  });
  // La pantalla se quedaba en un callejon sin salida cuando no habia diferencias: boton
  // deshabilitado y un mensaje que remitia a una rectificativa que la app todavia no emite.
  describe('cuando no hay nada que subsanar', () => {
    it('explica las dos vias reales en vez de dejar solo el boton deshabilitado', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'obtenerPorId').and.resolveTo(factura());
      spyOn(repo, 'previsualizarSubsanacion').and.resolveTo({ hayDiferencias: false, diferencias: [] });

      await component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(component.hayDiferencias).toBeFalse();
      // Los datos del emisor se releen en vivo al regenerar el registro, asi que corregirlos
      // (fuera de la app: esa ficha no se edita aqui) SI produce una subsanacion con contenido.
      expect(texto).toContain('datos fiscales de tu empresa');
      // El contenido de la factura quedo congelado al contabilizarla: la via es anular y reemitir.
      expect(texto).toContain('Anula la factura');
    });

    it('con diferencias reales no muestra esa explicacion', async () => {
      const repo = TestBed.inject(IssuedInvoicesRepository);
      spyOn(repo, 'obtenerPorId').and.resolveTo(factura());
      spyOn(repo, 'previsualizarSubsanacion').and.resolveTo({
        hayDiferencias: true,
        diferencias: [{ campo: 'Emisor NIF', valorAnterior: 'B1', valorNuevo: 'B2' }],
      });

      await component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).not.toContain('datos fiscales de tu empresa');
      expect(texto).toContain('Emisor NIF');
    });
  });
});
