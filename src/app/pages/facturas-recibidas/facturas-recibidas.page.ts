import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonCard, IonCardContent,
  IonText, IonSpinner, IonFab, IonFabButton,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cameraOutline, receiptOutline, documentTextOutline, addOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline,
} from 'ionicons/icons';

import { AccionesPermitidas, FacturaRecibida } from '../../services/mock-facturas.service';
import { ReceivedInvoicesRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';

@Component({
  selector: 'app-facturas-recibidas',
  templateUrl: './facturas-recibidas.page.html',
  styleUrls: ['./facturas-recibidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonCard, IonCardContent,
    IonText, IonSpinner, IonFab, IonFabButton,
    DemoBannerComponent,
  ],
})
export class FacturasRecibidasPage implements OnInit {
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  facturas: FacturaRecibida[] = [];
  processing = false;

  constructor() {
    addIcons({
      cameraOutline, receiptOutline, documentTextOutline, addOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.refresh();
  }

  ionViewWillEnter() {
    this.refresh();
  }

  refresh() {
    this.facturas = this.invoicesRepo.listar();
  }

  abrir(f: FacturaRecibida) {
    this.router.navigate(['/app/recibidas', f.id]);
  }

  totalFactura(f: FacturaRecibida): number {
    return this.invoicesRepo.totales(f).total;
  }

  proveedorResumen(f: FacturaRecibida): string {
    return f.proveedor?.trim() || 'Proveedor no disponible';
  }

  conceptoResumen(f: FacturaRecibida): string {
    return f.concepto?.trim() || 'Sin concepto';
  }

  nuevaManual() {
    this.router.navigate(['/app/recibidas', 'nueva']);
  }

  triggerUpload() {
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.processing = true;
    try {
      // El servicio recibe el File real: la integración real solo cambia la
      // implementación interna por una subida multipart a POST /api/FacturaRecibida/desde-ocr.
      const nueva = await this.invoicesRepo.crearDesdeOcr(file);
      this.refresh();
      await this.showToast(`Borrador creado desde "${file.name}": ${nueva.proveedor}.`, 'success');
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo procesar la imagen. Inténtalo de nuevo.', 'danger');
    } finally {
      this.processing = false;
    }
  }

  accionesPermitidas(f: FacturaRecibida): AccionesPermitidas {
    return this.invoicesRepo.accionesPermitidas(f);
  }

  async duplicar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    const copia = this.invoicesRepo.duplicar(f.id);
    if (!copia) return;
    this.refresh();
    await this.showToast(`Borrador creado a partir de la factura de ${f.proveedor}.`);
  }

  private async adjuntoABlob(f: FacturaRecibida): Promise<Blob> {
    const respuesta = await fetch(f.documentoUrl!);
    return respuesta.blob();
  }

  async descargarAdjunto(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    try {
      const blob = await this.adjuntoABlob(f);
      descargarBlob(blob, f.documentoNombre || 'documento-adjunto');
      await this.showToast('Documento descargado.');
    } catch {
      await this.showToast('No se pudo descargar el documento.', 'danger');
    }
  }

  async compartirAdjunto(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    try {
      const blob = await this.adjuntoABlob(f);
      await compartirBlob(blob, f.documentoNombre || 'documento-adjunto');
    } catch {
      await this.showToast('No se pudo compartir el documento.', 'danger');
    }
  }

  async confirmarEliminar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar factura',
      message: `¿Eliminar la factura de ${f.proveedor}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.invoicesRepo.eliminar(f.id);
            this.refresh();
            this.showToast('Factura eliminada.');
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom', color });
    await toast.present();
  }

  formatEuros(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }

  formatFecha(f: string): string {
    const d = new Date(`${f}T00:00:00`);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
}
