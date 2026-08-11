import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../utils/format-euros';

import {
  IonCard, IonCardContent, IonItem, IonInput, IonSelect, IonSelectOption,
  IonButton, IonIcon, IonText, IonChip, IonLabel,
  ActionSheetController, ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, trashOutline } from 'ionicons/icons';

import { LineaFactura, ProductoCatalogo, Suscripcion, IVA_RATES } from '../../services/mock-facturas.service';
import { CatalogoSelectorComponent } from '../../modals/catalogo-selector/catalogo-selector.component';
import { SuscripcionSelectorComponent } from '../../modals/suscripcion-selector/suscripcion-selector.component';

// Editor de líneas compartido entre Facturas Emitidas y Recibidas — misma UI, misma
// lógica de añadir/editar/eliminar y de elegir origen. Las diferencias entre las dos
// pantallas se resuelven con inputs (permitirCatalogo/permitirSuscripcion, generarId),
// nunca duplicando este componente.
@Component({
  selector: 'app-lineas-editor',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonCard, IonCardContent, IonItem, IonInput, IonSelect, IonSelectOption,
    IonButton, IonIcon, IonText, IonChip, IonLabel,
  ],
  templateUrl: './lineas-editor.component.html',
  styleUrls: ['./lineas-editor.component.scss'],
})
export class LineasEditorComponent {
  private actionSheetCtrl = inject(ActionSheetController);
  private modalCtrl = inject(ModalController);

  @Input({ required: true }) lineas: LineaFactura[] = [];
  @Input() editable = true;
  @Input() ivaRates: number[] = IVA_RATES;
  @Input() permitirCatalogo = true;
  @Input() permitirSuscripcion = true;
  // Generador de ids único que inyecta la pantalla (issuedRepo.nuevoIdLinea() o
  // receivedRepo.nuevoIdLinea()) — este componente no sabe de qué tipo de factura es.
  @Input({ required: true }) generarId!: () => number;

  constructor() {
    addIcons({ addOutline, trashOutline });
  }

  async elegirOrigen() {
    if (!this.editable) return;

    if (!this.permitirCatalogo && !this.permitirSuscripcion) {
      this.agregarManual();
      return;
    }

    const buttons: any[] = [];
    if (this.permitirCatalogo) {
      buttons.push({ text: 'Producto/servicio de catálogo', handler: () => this.agregarDesdeCatalogo() });
    }
    if (this.permitirSuscripcion) {
      buttons.push({ text: 'Suscripción', handler: () => this.agregarDesdeSuscripcion() });
    }
    buttons.push({ text: 'Fuera de catálogo', handler: () => this.agregarManual() });
    buttons.push({ text: 'Cancelar', role: 'cancel' });

    const sheet = await this.actionSheetCtrl.create({ header: 'Añadir línea', buttons });
    await sheet.present();
  }

  agregarManual() {
    this.lineas.push({
      id: this.generarId(),
      origen: 'manual',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuentoPct: 0,
      ivaPct: this.ivaRates[this.ivaRates.length - 1] ?? 21,
    });
  }

  async agregarDesdeCatalogo() {
    const modal = await this.modalCtrl.create({ component: CatalogoSelectorComponent });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    const p: ProductoCatalogo = data;
    this.lineas.push({
      id: this.generarId(),
      origen: 'catalogo',
      origenRef: { tipo: 'catalogo', id: p.id },
      descripcion: p.nombre,
      cantidad: 1,
      precioUnitario: p.precioUnitario,
      descuentoPct: 0,
      ivaPct: p.ivaPct,
    });
  }

  async agregarDesdeSuscripcion() {
    const modal = await this.modalCtrl.create({ component: SuscripcionSelectorComponent });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    const s: Suscripcion = data;
    this.lineas.push({
      id: this.generarId(),
      origen: 'suscripcion',
      origenRef: { tipo: 'suscripcion', id: s.id },
      descripcion: s.nombre,
      cantidad: 1,
      precioUnitario: s.precio,
      descuentoPct: 0,
      ivaPct: s.ivaPct,
    });
  }

  eliminarLinea(linea: LineaFactura) {
    const idx = this.lineas.indexOf(linea);
    if (idx >= 0) this.lineas.splice(idx, 1);
  }

  origenLabel(linea: LineaFactura): string {
    switch (linea.origen) {
      case 'catalogo': return 'Catálogo';
      case 'suscripcion': return 'Suscripción';
      default: return 'Manual';
    }
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }
}
