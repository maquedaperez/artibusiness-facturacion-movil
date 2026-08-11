import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSegment, IonSegmentButton, IonLabel,
  IonSelect, IonSelectOption,
  IonCard, IonCardContent,
  IonText, IonIcon, IonButton, IonFab, IonFabButton,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline,
} from 'ionicons/icons';

import { AccionesPermitidas, EstadoFactura, FacturaEmitida, Numerador } from '../../services/mock-facturas.service';
import { IssuedInvoicesRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';

@Component({
  selector: 'app-facturas-emitidas',
  templateUrl: './facturas-emitidas.page.html',
  styleUrls: ['./facturas-emitidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonSegment, IonSegmentButton, IonLabel,
    IonSelect, IonSelectOption,
    IonCard, IonCardContent,
    IonText, IonIcon, IonButton, IonFab, IonFabButton,
    DemoBannerComponent,
  ],
})
export class FacturasEmitidasPage implements OnInit {
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  estado: EstadoFactura = 'borrador';
  numeradorId: number | null = null;
  numeradores: Numerador[] = [];
  facturas: FacturaEmitida[] = [];

  constructor() {
    addIcons({
      documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.numeradores = this.invoicesRepo.getNumeradores();

    const estadoParam = this.route.snapshot.queryParamMap.get('estado');
    if (estadoParam === 'borrador' || estadoParam === 'contabilizada' || estadoParam === 'firmada') {
      this.estado = estadoParam;
    }

    this.refresh();
  }

  ionViewWillEnter() {
    this.refresh();
  }

  onEstadoChange(value: EstadoFactura) {
    this.estado = value;
    this.refresh();
  }

  onNumeradorChange(value: number | null) {
    this.numeradorId = value;
    this.refresh();
  }

  refresh() {
    this.facturas = this.invoicesRepo.listar(this.estado, this.numeradorId);
  }

  abrir(f: FacturaEmitida) {
    this.router.navigate(['/app/emitidas', f.id]);
  }

  crearBorrador() {
    this.router.navigate(['/app/emitidas', 'nueva']);
  }

  clienteNombre(f: FacturaEmitida): string {
    return f.destinatario.nombre?.trim() || 'Cliente no disponible';
  }

  conceptoResumen(f: FacturaEmitida): string {
    return f.concepto?.trim() || 'Sin concepto';
  }

  totalFactura(f: FacturaEmitida): number {
    return this.invoicesRepo.totales(f).total;
  }

  numeradorNombre(f: FacturaEmitida): string {
    return this.invoicesRepo.numeradorNombre(f.numeradorId);
  }

  estadoAeatLabel(f: FacturaEmitida): string {
    return this.invoicesRepo.estadoAeatLabel(f.estadoAeat);
  }

  estadoAeatColor(f: FacturaEmitida): string {
    switch (f.estadoAeat) {
      case 'Correcto': return 'success';
      case 'AceptadoConErrores': return 'warning';
      case 'RechazadoAeat': return 'danger';
      case 'RequiereRevisionManual': return 'warning';
      default: return 'medium';
    }
  }

  accionesPermitidas(f: FacturaEmitida): AccionesPermitidas {
    return this.invoicesRepo.accionesPermitidas(f);
  }

  async duplicar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const copia = this.invoicesRepo.duplicar(f.id);
    if (!copia) return;
    this.refresh();
    await this.showToast(`Borrador ${copia.numFactura} creado a partir de ${f.numFactura}.`);
  }

  async descargar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(f.id);
      descargarBlob(blob, nombre);
      await this.showToast('Documento descargado (simulado, no válido fiscalmente).');
    } catch {
      await this.showToast('No se pudo generar el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async compartir(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(f.id);
      await compartirBlob(blob, nombre);
    } catch {
      await this.showToast('No se pudo compartir el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async confirmarEliminar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar borrador',
      message: `¿Eliminar el borrador ${f.numFactura} de ${f.destinatario.nombre}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.invoicesRepo.eliminar(f.id);
            this.refresh();
            this.showToast('Borrador eliminado.');
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarContabilizar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura (simulado)',
      message: `¿Contabilizar la factura de ${f.destinatario.nombre} por ${this.formatEuros(this.totalFactura(f))}? En este entorno de demostración esto simula el envío a Verifactu/AEAT — no se realiza ninguna comunicación real con la Agencia Tributaria.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            this.invoicesRepo.contabilizar(f.id);
            this.refresh();
            await this.showToast(`Factura de ${f.destinatario.nombre} contabilizada (simulado).`);
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarFirmar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Firmar factura (simulado)',
      message: `¿Firmar la factura de ${f.destinatario.nombre}? En este entorno de demostración esto simula el proceso de autofirma — no se genera ninguna firma electrónica real.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Firmar',
          handler: async () => {
            this.invoicesRepo.firmar(f.id);
            this.refresh();
            await this.showToast(`Factura de ${f.destinatario.nombre} firmada (simulado).`);
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

  formatEuros(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }

  formatFecha(f: string): string {
    const d = new Date(`${f}T00:00:00`);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
}
