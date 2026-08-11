import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonCard, IonCardContent,
  IonText, IonChip, IonLabel, IonSpinner, IonFab, IonFabButton,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, receiptOutline, documentTextOutline, addOutline } from 'ionicons/icons';

import { FacturaRecibida } from '../../services/mock-facturas.service';
import { ReceivedInvoicesRepository } from '../../core/ports';

@Component({
  selector: 'app-facturas-recibidas',
  templateUrl: './facturas-recibidas.page.html',
  styleUrls: ['./facturas-recibidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonCard, IonCardContent,
    IonText, IonChip, IonLabel, IonSpinner, IonFab, IonFabButton,
  ],
})
export class FacturasRecibidasPage implements OnInit {
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  facturas: FacturaRecibida[] = [];
  processing = false;

  constructor() {
    addIcons({ cameraOutline, receiptOutline, documentTextOutline, addOutline });
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
