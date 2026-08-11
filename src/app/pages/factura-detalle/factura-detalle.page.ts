import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge,
  IonCard, IonCardContent, IonSpinner,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, addOutline, trashOutline, personCircleOutline, documentTextOutline } from 'ionicons/icons';

import {
  FacturaEmitida, LineaFactura, Destinatario, Numerador,
  IVA_RATES, IRPF_RATES, MEDIO_PAGO_OPTIONS,
} from '../../services/mock-facturas.service';
import { IssuedInvoicesRepository } from '../../core/ports';
import { ClienteSelectorComponent } from '../../modals/cliente-selector/cliente-selector.component';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';

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
    DemoBannerComponent,
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
  irpfRates = IRPF_RATES;
  medioPagoOptions = MEDIO_PAGO_OPTIONS;

  working: FacturaEmitida | null = null;
  errorMsg = '';

  constructor() {
    addIcons({ arrowBackOutline, addOutline, trashOutline, personCircleOutline, documentTextOutline });
  }

  ngOnInit() {
    this.numeradores = this.invoicesRepo.getNumeradores();
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      this.numeradorSeleccionado = this.numeradores[0]?.id ?? null;
      this.cargando = false;
      return;
    }

    const id = Number(param);
    const factura = this.invoicesRepo.obtenerPorId(id);
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
      const creada = this.invoicesRepo.crearBorrador(numeradorId, destinatario);
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
      id: this.invoicesRepo.nuevoIdLinea(),
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
    if (!this.working) return { base: 0, desgloseIva: [], ivaTotal: 0, irpfPct: 0, irpfCuota: 0, total: 0 };
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
        irpfPct: this.working.irpfPct,
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

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color: 'success' });
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
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }
}
