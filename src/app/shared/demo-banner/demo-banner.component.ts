import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';

// Indicador único y reutilizable de "modo demo": se usa en todas las pantallas
// principales del MVP para que quede claro en todo momento que los datos y las
// acciones fiscales (contabilizar/firmar/OCR) son simulados, nunca una conexión
// real a Verifactu/AEAT.
@Component({
  selector: 'app-demo-banner',
  standalone: true,
  imports: [CommonModule, IonChip, IonIcon, IonLabel],
  template: `
    <ion-chip color="medium" class="demo-banner">
      <ion-icon name="information-circle-outline"></ion-icon>
      <ion-label>Modo demo — datos simulados<ng-container *ngIf="detalle">, {{ detalle }}</ng-container></ion-label>
    </ion-chip>
  `,
  styles: [`
    .demo-banner {
      width: 100%;
      max-width: 100%;
      height: auto;
      white-space: normal;
      margin: 0 0 12px;
      padding-top: 6px;
      padding-bottom: 6px;
    }
  `],
})
export class DemoBannerComponent {
  @Input() detalle?: string;

  constructor() {
    addIcons({ informationCircleOutline });
  }
}
