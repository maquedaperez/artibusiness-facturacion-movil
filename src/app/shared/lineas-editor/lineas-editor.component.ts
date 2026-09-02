import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../utils/format-euros';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

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

// Regla unica de validez de una linea, exportada a proposito: la usa este editor para marcar el
// campo y factura-detalle.page.ts para bloquear Guardar/Contabilizar, sin duplicarla en dos
// sitios que puedan divergir. Una linea recien anadida (todo a 0) NO es invalida: 0 es el valor
// de partida legitimo mientras el usuario todavia esta escribiendo.
export function lineaFacturaInvalida(l: LineaFactura): boolean {
  const cantidad = Number(l.cantidad);
  const precio = Number(l.precioUnitario);
  const descuento = Number(l.descuentoPct);
  if (!Number.isFinite(cantidad) || cantidad < 0) return true;
  if (!Number.isFinite(precio) || precio < 0) return true;
  if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) return true;
  return false;
}

// Editor de líneas compartido entre Facturas Emitidas y Recibidas — misma UI, misma
// lógica de añadir/editar/eliminar y de elegir origen. Las diferencias entre las dos
// pantallas se resuelven con inputs (permitirCatalogo/permitirSuscripcion, generarId),
// nunca duplicando este componente.
@Component({
  selector: 'app-lineas-editor',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslocoPipe,
    IonCard, IonCardContent, IonItem, IonInput, IonSelect, IonSelectOption,
    IonButton, IonIcon, IonText, IonChip, IonLabel,
  ],
  templateUrl: './lineas-editor.component.html',
  styleUrls: ['./lineas-editor.component.scss'],
})
export class LineasEditorComponent {
  private actionSheetCtrl = inject(ActionSheetController);
  private modalCtrl = inject(ModalController);
  private transloco = inject(TranslocoService);

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
      buttons.push({ text: this.transloco.translate('common.linesEditor.fromCatalog'), handler: () => this.agregarDesdeCatalogo() });
    }
    if (this.permitirSuscripcion) {
      buttons.push({ text: this.transloco.translate('common.linesEditor.subscription'), handler: () => this.agregarDesdeSuscripcion() });
    }
    buttons.push({ text: this.transloco.translate('common.linesEditor.outsideCatalog'), handler: () => this.agregarManual() });
    buttons.push({ text: this.transloco.translate('common.actions.cancel'), role: 'cancel' });

    const sheet = await this.actionSheetCtrl.create({ header: this.transloco.translate('common.linesEditor.addLine'), buttons });
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
      case 'catalogo': return this.transloco.translate('common.linesEditor.originCatalog');
      case 'suscripcion': return this.transloco.translate('common.linesEditor.originSubscription');
      default: return this.transloco.translate('common.linesEditor.originManual');
    }
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }

  // Validación de rango (2026-09-02): ni este editor ni el backend comprobaban el signo ni el
  // tope de estos tres campos, así que se podía guardar (y contabilizar) una factura con
  // cantidad o precio negativo, o con un descuento superior al 100 % — total negativo. Se marca
  // la línea aquí, junto al campo, en vez de esperar a un rechazo del servidor que además no
  // llegaba. Una línea recién añadida (todo a 0) NO se considera inválida: 0 es el valor de
  // partida legítimo mientras el usuario todavía está escribiendo.
  lineaInvalida(l: LineaFactura): boolean {
    return lineaFacturaInvalida(l);
  }

  // Base de la línea (cantidad × precio − descuento), sin IVA — misma fórmula exacta que
  // usa calcularTotalesLineas() para "Base imponible", así que el importe que se ve aquí
  // siempre cuadra con el desglose de Totales.
  lineaTotal(l: LineaFactura): number {
    const cantidad = Number(l.cantidad) || 0;
    const precioUnitario = Number(l.precioUnitario) || 0;
    const descuentoPct = Number(l.descuentoPct) || 0;
    const importe = cantidad * precioUnitario * (1 - descuentoPct / 100);
    return Math.round(importe * 100) / 100;
  }
}
