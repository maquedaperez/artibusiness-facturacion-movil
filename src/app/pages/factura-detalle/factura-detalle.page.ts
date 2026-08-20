import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge,
  IonCard, IonCardContent, IonSpinner,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, personCircleOutline, documentTextOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline,
} from 'ionicons/icons';

import {
  AccionesPermitidas, FacturaEmitida, Destinatario, Numerador,
  IVA_RATES, MEDIO_PAGO_OPTIONS,
} from '../../services/mock-facturas.service';
import { IssuedInvoicesRepository } from '../../core/ports';
import { ClienteSelectorComponent } from '../../modals/cliente-selector/cliente-selector.component';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { LineasEditorComponent } from '../../shared/lineas-editor/lineas-editor.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';

@Component({
  selector: 'app-factura-detalle',
  templateUrl: './factura-detalle.page.html',
  styleUrls: ['./factura-detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
    IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge,
    IonCard, IonCardContent, IonSpinner,
    DemoBannerComponent, LineasEditorComponent,
  ],
})
export class FacturaDetallePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  facturaId: number | null = null;
  esNueva = false;
  cargando = true;
  guardando = false;

  numeradores: Numerador[] = [];
  numeradorSeleccionado: number | null = null;
  ivaRates = IVA_RATES;
  medioPagoOptions = MEDIO_PAGO_OPTIONS;

  working: FacturaEmitida | null = null;
  errorMsg = '';

  constructor() {
    addIcons({
      arrowBackOutline, personCircleOutline, documentTextOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.cargarCatalogos();
    this.numeradores = this.invoicesRepo.getNumeradores();
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      this.numeradorSeleccionado = this.numeradores[0]?.id ?? null;
      this.cargando = false;
      return;
    }

    this.cargarFactura(Number(param));
  }

  // Fase 2 del plan de integración de Emitidas (2026-08-20): obtenerPorId ya es asíncrono
  // (habla con el backend real) — mismo patrón que factura-recibida-detalle.page.ts.
  private async cargarFactura(id: number) {
    try {
      const factura = await this.invoicesRepo.obtenerPorId(id);
      if (!factura) {
        this.errorMsg = 'Factura no encontrada.';
        return;
      }

      this.facturaId = id;
      this.working = structuredClone(factura);
    } catch (e: any) {
      this.errorMsg = e?.message ?? 'No se pudo cargar la factura.';
    } finally {
      this.cargando = false;
    }
  }

  // Fase 1 del plan de integración de Emitidas (2026-08-20): sustituye IVA_RATES/
  // MEDIO_PAGO_OPTIONS hardcodeados por los catálogos reales de la empresa — mismo patrón ya
  // probado en factura-recibida-detalle.page.ts. Si la carga falla, se queda con los valores
  // fijos con los que ya arrancan ivaRates/medioPagoOptions, no bloquea ver/editar la factura.
  private async cargarCatalogos() {
    try {
      const porcentajes = await this.invoicesRepo.obtenerPorcentajesIva();
      if (porcentajes.length > 0) this.ivaRates = porcentajes;
    } catch {
      // Se mantiene IVA_RATES como valor por defecto.
    }
    try {
      const mediosPago = await this.invoicesRepo.obtenerMediosPago();
      if (mediosPago.length > 0) this.medioPagoOptions = mediosPago;
    } catch {
      // Se mantiene MEDIO_PAGO_OPTIONS como valor por defecto.
    }
  }

  get esEditable(): boolean {
    return this.esNueva || this.working?.estado === 'borrador';
  }

  async elegirCliente() {
    const modal = await this.modalCtrl.create({ component: ClienteSelectorComponent });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    const destinatario: Destinatario = data;

    if (this.esNueva) {
      const numeradorId = this.numeradorSeleccionado ?? this.numeradores[0]?.id;
      if (numeradorId == null) return;
      const creada = this.invoicesRepo.crearBorrador(numeradorId, destinatario);
      this.working = structuredClone(creada);
      this.facturaId = creada.id;
      this.esNueva = false;
    } else if (this.working) {
      this.working.destinatario = destinatario;
    }
  }

  generarIdLinea = () => this.invoicesRepo.nuevoIdLinea();

  totales() {
    if (!this.working) {
      return {
        base: 0, desgloseIva: [], ivaTotal: 0,
        retencion: { aplicable: false, etiqueta: 'Retención', porcentaje: 0, base: 0, importe: 0 },
        total: 0,
      };
    }
    return this.invoicesRepo.totales(this.working);
  }

  async guardar() {
    if (!this.working || this.facturaId == null || this.guardando) return;

    this.guardando = true;
    try {
      this.invoicesRepo.actualizarBorrador(this.facturaId, {
        fecha: this.working.fecha,
        vencimiento: this.working.vencimiento,
        concepto: this.working.concepto,
        medioPago: this.working.medioPago,
        destinatario: this.working.destinatario,
        lineas: this.working.lineas,
        numeradorId: this.working.numeradorId,
      });

      await this.showToast('Borrador guardado.');
    } finally {
      this.guardando = false;
    }
  }

  async confirmarContabilizar() {
    if (!this.working || this.facturaId == null) return;

    // El servidor real rechaza la factura (error AEAT 4102) si el concepto va vacío,
    // y el medio de pago es obligatorio en el modelo — se valida aquí antes de intentarlo.
    if (!this.working.concepto?.trim() || !this.working.medioPago?.trim()) {
      this.errorMsg = 'Concepto y forma de pago son obligatorios para contabilizar.';
      return;
    }
    this.errorMsg = '';

    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura (simulado)',
      message: `¿Contabilizar la factura de ${this.working.destinatario.nombre} por ${this.formatEuros(this.totales().total)}? En este entorno de demostración esto simula el envío a Verifactu/AEAT — no se realiza ninguna comunicación real con la Agencia Tributaria. Se guardarán los cambios pendientes.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            await this.guardar();
            this.invoicesRepo.contabilizar(this.facturaId!);
            await this.showToast('Factura contabilizada (simulado).');
            this.volver();
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarFirmar() {
    if (!this.working || this.facturaId == null) return;

    const alert = await this.alertCtrl.create({
      header: 'Firmar factura (simulado)',
      message: `¿Firmar esta factura? En este entorno de demostración esto simula el proceso de autofirma — no se genera ninguna firma electrónica real.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Firmar',
          handler: async () => {
            this.invoicesRepo.firmar(this.facturaId!);
            await this.showToast('Factura firmada (simulado).');
            this.volver();
          },
        },
      ],
    });
    await alert.present();
  }

  accionesPermitidas(): AccionesPermitidas {
    if (!this.working) return { editar: false, eliminar: false, copiar: false, descargar: false, compartir: false };
    return this.invoicesRepo.accionesPermitidas(this.working);
  }

  async duplicar() {
    if (!this.working) return;
    const copia = this.invoicesRepo.duplicar(this.working.id);
    if (!copia) return;
    await this.showToast(`Borrador ${copia.numFactura} creado a partir de ${this.working.numFactura}.`);
    this.router.navigate(['/app/emitidas', copia.id], { replaceUrl: true });
  }

  async descargar() {
    if (!this.working) return;
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(this.working.id);
      descargarBlob(blob, nombre);
      await this.showToast('Documento descargado (simulado, no válido fiscalmente).');
    } catch {
      await this.showToast('No se pudo generar el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async compartir() {
    if (!this.working) return;
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(this.working.id);
      await compartirBlob(blob, nombre);
    } catch {
      await this.showToast('No se pudo compartir el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async confirmarEliminar() {
    if (!this.working) return;
    const f = this.working;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar borrador',
      message: `¿Eliminar el borrador ${f.numFactura} de ${f.destinatario.nombre}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            this.invoicesRepo.eliminar(f.id);
            await this.showToast('Borrador eliminado.');
            this.volver();
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color });
    await toast.present();
  }

  volver() {
    const estado = this.working?.estado ?? 'borrador';
    this.router.navigate(['/app/emitidas'], { queryParams: { estado }, replaceUrl: true });
  }

  estadoAeatLabel(): string {
    return this.working ? this.invoicesRepo.estadoAeatLabel(this.working.estadoAeat) : '—';
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }
}
