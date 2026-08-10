import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSegment, IonSegmentButton, IonLabel,
  IonSelect, IonSelectOption,
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonText, IonIcon, IonButton, IonBadge, IonChip, IonFab, IonFabButton,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline } from 'ionicons/icons';

import { MockFacturasService, EstadoFactura, FacturaEmitida, Numerador } from '../../services/mock-facturas.service';

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
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonText, IonIcon, IonButton, IonBadge, IonChip, IonFab, IonFabButton,
  ],
})
export class FacturasEmitidasPage implements OnInit {
  estado: EstadoFactura = 'borrador';
  numeradorId: number | null = null;
  numeradores: Numerador[] = [];
  facturas: FacturaEmitida[] = [];

  constructor(
    private mock: MockFacturasService,
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
  ) {
    addIcons({ documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline });
  }

  ngOnInit() {
    this.numeradores = this.mock.getNumeradores();

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
    this.facturas = this.mock.getFacturasEmitidas(this.estado, this.numeradorId);
  }

  abrir(f: FacturaEmitida) {
    this.router.navigate(['/app/emitidas', f.id]);
  }

  crearBorrador() {
    this.router.navigate(['/app/emitidas', 'nueva']);
  }

  clienteNombre(f: FacturaEmitida): string {
    return f.destinatario.nombre;
  }

  totalFactura(f: FacturaEmitida): number {
    return this.mock.totalesFactura(f).total;
  }

  numeradorNombre(f: FacturaEmitida): string {
    return this.mock.numeradorNombre(f.numeradorId);
  }

  estadoAeatLabel(f: FacturaEmitida): string {
    return this.mock.estadoAeatLabel(f.estadoAeat);
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

  async confirmarContabilizar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura',
      message: `¿Contabilizar la factura de ${f.destinatario.nombre} por ${this.formatEuros(this.totalFactura(f))}? Esta acción envía la factura a Verifactu/AEAT.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            this.mock.contabilizar(f.id);
            this.refresh();
            await this.showToast(`Factura de ${f.destinatario.nombre} contabilizada.`);
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarFirmar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Firmar factura',
      message: `¿Firmar la factura de ${f.destinatario.nombre}? Esta acción inicia el proceso de autofirma.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Firmar',
          handler: async () => {
            this.mock.firmar(f.id);
            this.refresh();
            await this.showToast(`Factura de ${f.destinatario.nombre} firmada.`);
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color: 'success' });
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
