import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonText, IonChip, IonLabel,
  IonCard, IonCardContent, IonSpinner,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, documentTextOutline, createOutline, trashOutline,
  attachOutline, eyeOutline,
} from 'ionicons/icons';

import {
  FacturaRecibida, ProveedorMock, IRPF_RATES, TotalesFactura,
  ConfiguracionRetencion, calcularTotalesLineas,
} from '../../services/mock-facturas.service';
import { ReceivedInvoicesRepository } from '../../core/ports';
import { VerDocumentoComponent } from '../../modals/ver-documento/ver-documento.component';
import { ProveedorSelectorComponent } from '../../modals/proveedor-selector/proveedor-selector.component';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { LineasEditorComponent } from '../../shared/lineas-editor/lineas-editor.component';

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
    IonCard, IonCardContent, IonSpinner,
    DemoBannerComponent, LineasEditorComponent,
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
  guardando = false;
  origenOcr = false;

  irpfRates = IRPF_RATES;

  working: FacturaRecibidaForm = this.formularioVacio();

  generarIdLinea = () => this.invoicesRepo.nuevoIdLinea();

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
      lineas: [],
      retencionPct: 0,
      pagada: false, estado: 'contabilizada',
    };
  }

  // Previsualización local con la misma fórmula que usa el mock/backend
  // (calcularTotalesLineas) — el guardado no envía este cálculo, solo las líneas y
  // el % de retención; el total definitivo lo sigue calculando el repositorio/backend.
  totales(): TotalesFactura {
    const cfg: ConfiguracionRetencion = {
      aplicable: this.working.retencionPct > 0,
      tipoCodigo: 'recibida',
      etiqueta: 'Retención',
      porcentaje: this.working.retencionPct,
    };
    return calcularTotalesLineas(this.working.lineas, cfg);
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
    if (this.guardando) return;

    this.errorMsg = '';
    if (!this.working.proveedor.trim() || !this.working.numFactura.trim()) {
      this.errorMsg = 'Proveedor y número de factura son obligatorios.';
      return;
    }

    this.guardando = true;
    try {
      if (this.esNueva) {
        const creada = this.invoicesRepo.crearManual(this.working);
        this.facturaId = creada.id;
        this.esNueva = false;
      } else if (this.facturaId != null) {
        this.invoicesRepo.actualizar(this.facturaId, this.working);
      }

      await this.showToast('Factura guardada.');
    } finally {
      this.guardando = false;
    }
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
