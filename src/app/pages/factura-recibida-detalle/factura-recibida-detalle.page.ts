import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonText, IonChip, IonLabel,
  IonCard, IonCardContent,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, documentTextOutline, createOutline, trashOutline,
  attachOutline, eyeOutline,
} from 'ionicons/icons';

import { FacturaRecibida, ProveedorMock, IVA_RATES, IRPF_RATES } from '../../services/mock-facturas.service';
import { ReceivedInvoicesRepository } from '../../core/ports';
import { VerDocumentoComponent } from '../../modals/ver-documento/ver-documento.component';
import { ProveedorSelectorComponent } from '../../modals/proveedor-selector/proveedor-selector.component';

type FacturaRecibidaForm = Omit<FacturaRecibida, 'id' | 'origenOcr'>;

@Component({
  selector: 'app-factura-recibida-detalle',
  templateUrl: './factura-recibida-detalle.page.html',
  styleUrls: ['./factura-recibida-detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
    IonItem, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonText, IonChip, IonLabel,
    IonCard, IonCardContent,
  ],
})
export class FacturaRecibidaDetallePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  facturaId: number | null = null;
  esNueva = false;
  errorMsg = '';
  adjuntando = false;
  origenOcr = false;

  ivaRates = IVA_RATES;
  irpfRates = IRPF_RATES;

  working: FacturaRecibidaForm = this.formularioVacio();

  constructor() {
    addIcons({ arrowBackOutline, documentTextOutline, createOutline, trashOutline, attachOutline, eyeOutline });
  }

  ngOnInit() {
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      return;
    }

    const id = Number(param);
    const factura = this.invoicesRepo.obtenerPorId(id);
    if (!factura) {
      this.errorMsg = 'Factura no encontrada.';
      return;
    }

    this.facturaId = id;
    this.origenOcr = factura.origenOcr;
    const { id: _id, origenOcr: _ocr, ...resto } = factura;
    this.working = { ...resto };
  }

  private formularioVacio(): FacturaRecibidaForm {
    return {
      proveedor: '', proveedorNif: '', numFactura: '',
      fecha: new Date().toISOString().slice(0, 10), vencimiento: '',
      concepto: '', formaPago: '',
      baseImponible: 0, ivaPct: 21, iva: 0, irpfPct: 0, irpf: 0, totalFactura: 0,
      pagada: false, estado: 'contabilizada',
    };
  }

  private redondear(v: number): number {
    return Math.round(v * 100) / 100;
  }

  // Number(...) por seguridad: ion-input puede entregar baseImponible como texto,
  // lo que rompería el "+" del total (concatenaría en vez de sumar).
  private get baseNum(): number {
    return Number(this.working.baseImponible) || 0;
  }

  get ivaCuota(): number {
    return this.redondear(this.baseNum * (Number(this.working.ivaPct) || 0) / 100);
  }

  get irpfCuota(): number {
    return this.redondear(this.baseNum * (Number(this.working.irpfPct) || 0) / 100);
  }

  get total(): number {
    return this.redondear(this.baseNum + this.ivaCuota - this.irpfCuota);
  }

  async elegirProveedor() {
    const modal = await this.modalCtrl.create({ component: ProveedorSelectorComponent });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    const p: ProveedorMock = data;
    this.working.proveedor = p.nombre;
    this.working.proveedorNif = p.nif;
  }

  triggerAdjuntar() {
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.adjuntando = true;
    try {
      const { documentoUrl, documentoNombre } = await this.invoicesRepo.adjuntarDocumento(file);
      this.working.documentoUrl = documentoUrl;
      this.working.documentoNombre = documentoNombre;
    } finally {
      this.adjuntando = false;
    }
  }

  async verDocumento() {
    if (!this.working.documentoUrl) return;
    const modal = await this.modalCtrl.create({
      component: VerDocumentoComponent,
      componentProps: { url: this.working.documentoUrl, nombre: this.working.documentoNombre },
    });
    await modal.present();
  }

  async guardar() {
    this.errorMsg = '';
    if (!this.working.proveedor.trim() || !this.working.numFactura.trim()) {
      this.errorMsg = 'Proveedor y número de factura son obligatorios.';
      return;
    }

    const datos: FacturaRecibidaForm = {
      ...this.working,
      baseImponible: this.baseNum,
      iva: this.ivaCuota,
      irpf: this.irpfCuota,
      totalFactura: this.total,
    };

    if (this.esNueva) {
      const creada = this.invoicesRepo.crearManual(datos);
      this.facturaId = creada.id;
      this.esNueva = false;
    } else if (this.facturaId != null) {
      this.invoicesRepo.actualizar(this.facturaId, datos);
    }

    await this.showToast('Factura guardada.');
  }

  async eliminar() {
    if (this.facturaId == null) return;

    const alert = await this.alertCtrl.create({
      header: 'Eliminar factura',
      message: `¿Eliminar la factura ${this.working.numFactura} de ${this.working.proveedor}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            this.invoicesRepo.eliminar(this.facturaId!);
            await this.showToast('Factura eliminada.');
            this.volver();
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2000, position: 'bottom', color: 'success' });
    await toast.present();
  }

  volver() {
    this.router.navigateByUrl('/app/recibidas', { replaceUrl: true });
  }

  formatEuros(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }
}
