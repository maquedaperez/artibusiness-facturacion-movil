import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonTextarea, IonText, IonBadge, IonCard, IonCardContent,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { FacturaEmitida } from '../../services/mock-facturas.service';
import { IssuedInvoicesRepository } from '../../core/ports';

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
    CommonModule, FormsModule,
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

  facturaId!: number;
  factura: FacturaEmitida | null = null;
  cargando = true;
  procesando = false;
  errorMsg = '';
  motivo = '';

  constructor() {
    addIcons({ arrowBackOutline });
  }

  async ngOnInit() {
    this.facturaId = Number(this.route.snapshot.paramMap.get('id'));
    try {
      const factura = await this.invoicesRepo.obtenerPorId(this.facturaId);
      if (!factura) {
        this.errorMsg = 'Factura no encontrada.';
        return;
      }
      this.factura = factura;
      if (!this.puedeSubsanar) {
        this.errorMsg = this.factura.anulada
          ? 'Esta factura está anulada; no se puede subsanar.'
          : 'Solo se puede subsanar una factura ya contabilizada.';
      }
    } catch (e: any) {
      this.errorMsg = e?.message ?? 'No se pudo cargar la factura.';
    } finally {
      this.cargando = false;
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
    if (!this.factura || this.procesando || !this.puedeSubsanar) return;
    if (!this.motivo.trim()) {
      this.errorMsg = 'Indica el motivo de la subsanación.';
      return;
    }
    this.errorMsg = '';

    const alert = await this.alertCtrl.create({
      header: 'Subsanar factura',
      message: `¿Confirmar la subsanación de la factura ${this.factura.numFactura}? Esto genera un registro nuevo en VERI*FACTU (la factura y el Alta original no se modifican). Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Subsanar',
          handler: async () => {
            if (this.procesando) return;
            this.procesando = true;
            try {
              this.factura = await this.invoicesRepo.subsanar(this.facturaId, this.motivo.trim());
              await this.showToast('Subsanación registrada.');
              this.router.navigate(['/app/emitidas', this.facturaId], { replaceUrl: true });
            } catch (e: any) {
              await this.showToast(e?.message ?? 'No se pudo subsanar la factura.', 'danger');
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
