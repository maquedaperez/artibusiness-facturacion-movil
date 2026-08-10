import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonText, IonBadge, IonChip, IonLabel, IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, receiptOutline, documentTextOutline } from 'ionicons/icons';

import { MockFacturasService, FacturaRecibida } from '../../services/mock-facturas.service';

@Component({
  selector: 'app-facturas-recibidas',
  templateUrl: './facturas-recibidas.page.html',
  styleUrls: ['./facturas-recibidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonText, IonBadge, IonChip, IonLabel, IonSpinner,
  ],
})
export class FacturasRecibidasPage implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  facturas: FacturaRecibida[] = [];
  processing = false;

  constructor(
    private mock: MockFacturasService,
    private toastCtrl: ToastController,
  ) {
    addIcons({ cameraOutline, receiptOutline, documentTextOutline });
  }

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.facturas = this.mock.getFacturasRecibidas();
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
      const nueva = await this.mock.crearDesdeOcr(file.name);
      this.refresh();
      await this.showToast(`Borrador creado desde "${file.name}": ${nueva.proveedor}.`);
    } finally {
      this.processing = false;
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom', color: 'success' });
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
