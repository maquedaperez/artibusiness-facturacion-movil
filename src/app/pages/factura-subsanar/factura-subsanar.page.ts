import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonTextarea, IonText, IonBadge, IonCard, IonCardContent,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { FacturaEmitida } from '../../services/mock-facturas.service';
import { DiferenciaCampoFiscal, IssuedInvoicesRepository } from '../../core/ports';

// Fase 7 (Subsanar, 2026-08-24): pantalla DEDICADA y de solo lectura para la factura y el
// registro original — Subsanar no es un editor (ver issued-invoices.repository.ts), así que a
// propósito NO reutiliza el formulario de factura-detalle. Lo único que aporta el usuario es el
// motivo; el resto se reconstruye en el backend a partir de los datos ya guardados.
@Component({
  selector: 'app-factura-subsanar',
  templateUrl: './factura-subsanar.page.html',
  styleUrls: ['./factura-subsanar.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslocoPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
    IonItem, IonTextarea, IonText, IonBadge, IonCard, IonCardContent,
  ],
})
export class FacturaSubsanarPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private transloco = inject(TranslocoService);

  facturaId!: number;
  factura: FacturaEmitida | null = null;
  cargando = true;
  procesando = false;
  errorMsg = '';
  motivo = '';

  // Blindaje 2026-08-24: previsualización de las diferencias fiscales reales — el backend hace
  // la MISMA comprobación justo antes de enviar, esto es solo para que el usuario la vea ANTES
  // de confirmar y no descubra el rechazo después.
  cargandoPrevisualizacion = true;
  diferencias: DiferenciaCampoFiscal[] = [];
  hayDiferencias = false;

  constructor() {
    addIcons({ arrowBackOutline });
  }

  async ngOnInit() {
    this.facturaId = Number(this.route.snapshot.paramMap.get('id'));
    try {
      const factura = await this.invoicesRepo.obtenerPorId(this.facturaId);
      if (!factura) {
        this.errorMsg = this.transloco.translate('invoices.issued.detail.notFound');
        return;
      }
      this.factura = factura;
      if (!this.puedeSubsanar) {
        this.errorMsg = this.factura.anulada
          ? this.transloco.translate('verifactu.errors.subsanarAnulada')
          : this.transloco.translate('verifactu.errors.subsanarBorrador');
        return;
      }
      await this.cargarPrevisualizacion();
    } catch (e: any) {
      this.errorMsg = e?.message ?? this.transloco.translate('invoices.issued.detail.loadError');
    } finally {
      this.cargando = false;
    }
  }

  private async cargarPrevisualizacion() {
    this.cargandoPrevisualizacion = true;
    try {
      const previsualizacion = await this.invoicesRepo.previsualizarSubsanacion(this.facturaId);
      this.hayDiferencias = previsualizacion.hayDiferencias;
      this.diferencias = previsualizacion.diferencias;
    } catch (e: any) {
      this.errorMsg = e?.message ?? this.transloco.translate('invoices.issued.correct.previewError');
    } finally {
      this.cargandoPrevisualizacion = false;
    }
  }

  get puedeSubsanar(): boolean {
    return !!this.factura && this.factura.estado !== 'borrador' && !this.factura.anulada;
  }

  estadoAeatLabel(): string {
    return this.factura ? this.invoicesRepo.estadoAeatLabel(this.factura.estadoAeat) : '—';
  }

  estadoSubsanacionLabel(): string {
    return this.invoicesRepo.estadoSubsanacionLabel(this.factura?.estadoSubsanacion);
  }

  totalFactura(): number {
    return this.factura ? this.invoicesRepo.totales(this.factura).total : 0;
  }

  async confirmar() {
    if (!this.factura || this.procesando || !this.puedeSubsanar || !this.hayDiferencias) return;
    if (!this.motivo.trim()) {
      this.errorMsg = this.transloco.translate('invoices.issued.correct.reasonRequired');
      return;
    }
    this.errorMsg = '';

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.correct.title'),
      message: this.transloco.translate('invoices.issued.correct.confirmMessage', { num: this.factura.numFactura }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.issued.correct.confirm'),
          handler: async () => {
            if (this.procesando) return;
            this.procesando = true;
            try {
              this.factura = await this.invoicesRepo.subsanar(this.facturaId, this.motivo.trim());
              await this.showToast(this.transloco.translate('invoices.issued.correct.registeredSuccess'));
              this.router.navigate(['/app/emitidas', this.facturaId], { replaceUrl: true });
            } catch (e: any) {
              await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.correct.error'), 'danger');
            } finally {
              this.procesando = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  volver() {
    this.router.navigate(['/app/emitidas', this.facturaId], { replaceUrl: true });
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color });
    await toast.present();
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }
}
