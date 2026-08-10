import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge, IonChip, IonLabel,
  IonCard, IonCardContent,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, addOutline, trashOutline, personCircleOutline, documentTextOutline } from 'ionicons/icons';

import {
  MockFacturasService, FacturaEmitida, LineaFactura, Destinatario, Numerador, IVA_RATES,
} from '../../services/mock-facturas.service';
import { ClienteSelectorComponent } from '../../modals/cliente-selector/cliente-selector.component';

@Component({
  selector: 'app-factura-detalle',
  templateUrl: './factura-detalle.page.html',
  styleUrls: ['./factura-detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
    IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge, IonChip, IonLabel,
    IonCard, IonCardContent,
  ],
})
export class FacturaDetallePage implements OnInit {
  facturaId: number | null = null;
  esNueva = false;
  cargando = true;

  numeradores: Numerador[] = [];
  numeradorSeleccionado: number | null = null;
  ivaRates = IVA_RATES;

  working: FacturaEmitida | null = null;
  errorMsg = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mock: MockFacturasService,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
  ) {
    addIcons({ arrowBackOutline, addOutline, trashOutline, personCircleOutline, documentTextOutline });
  }

  ngOnInit() {
    this.numeradores = this.mock.getNumeradores();
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      this.numeradorSeleccionado = this.numeradores[0]?.id ?? null;
      this.cargando = false;
      return;
    }

    const id = Number(param);
    const factura = this.mock.getFacturaById(id);
    if (!factura) {
      this.errorMsg = 'Factura no encontrada.';
      this.cargando = false;
      return;
    }

    this.facturaId = id;
    this.working = structuredClone(factura);
    this.cargando = false;
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
      const creada = this.mock.crearBorrador(numeradorId, destinatario);
      this.working = structuredClone(creada);
      this.facturaId = creada.id;
      this.esNueva = false;
    } else if (this.working) {
      this.working.destinatario = destinatario;
    }
  }

  agregarLinea() {
    if (!this.working) return;
    const nueva: LineaFactura = {
      id: this.mock.nuevoIdLinea(),
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuentoPct: 0,
      ivaPct: 21,
    };
    this.working.lineas.push(nueva);
  }

  eliminarLinea(linea: LineaFactura) {
    if (!this.working) return;
    this.working.lineas = this.working.lineas.filter(l => l.id !== linea.id);
  }

  totales() {
    if (!this.working) return { base: 0, desgloseIva: [], ivaTotal: 0, total: 0 };
    return this.mock.totalesFactura(this.working);
  }

  async guardar() {
    if (!this.working || this.facturaId == null) return;

    this.mock.actualizarBorrador(this.facturaId, {
      fecha: this.working.fecha,
      destinatario: this.working.destinatario,
      lineas: this.working.lineas,
      irpfBase: this.working.irpfBase,
      numeradorId: this.working.numeradorId,
    });

    await this.showToast('Borrador guardado.');
  }

  async confirmarContabilizar() {
    if (!this.working || this.facturaId == null) return;

    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura',
      message: `¿Contabilizar la factura de ${this.working.destinatario.nombre} por ${this.formatEuros(this.totales().total)}? Se guardarán los cambios pendientes.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            await this.guardar();
            this.mock.contabilizar(this.facturaId!);
            await this.showToast('Factura contabilizada.');
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
      header: 'Firmar factura',
      message: `¿Firmar esta factura? Esta acción envía la factura a Verifactu/AEAT.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Firmar',
          handler: async () => {
            this.mock.firmar(this.facturaId!);
            await this.showToast('Factura firmada.');
            this.volver();
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

  volver() {
    this.router.navigateByUrl('/app/emitidas', { replaceUrl: true });
  }

  estadoAeatLabel(): string {
    return this.working ? this.mock.estadoAeatLabel(this.working.estadoAeat) : '—';
  }

  formatEuros(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }
}
