import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import { TranslocoPipe } from '@jsverse/transloco';

// Indicador único y reutilizable del entorno de esta demo: por defecto avisa de que los
// datos son simulados (la mayoría de módulos todavía lo son), pero el texto es
// configurable por página vía [titulo] — Facturas Recibidas, por ejemplo, ya habla con el
// backend real de Development, así que usa un mensaje distinto (ver
// facturas-recibidas.page.html) en vez de decir "simulado" sobre datos que sí se guardan
// de verdad. Nunca representa una conexión real a Verifactu/AEAT en ningún módulo.
@Component({
  selector: 'app-demo-banner',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, IonChip, IonIcon, IonLabel],
  template: `
    <ion-chip color="medium" class="demo-banner">
      <ion-icon name="information-circle-outline"></ion-icon>
      <ion-label>{{ titulo || ('common.demoBanner.default' | transloco) }}<ng-container *ngIf="detalle">, {{ detalle }}</ng-container></ion-label>
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
  // Configurable por página, no por un flag global: distintos módulos pueden estar en
  // estados distintos a la vez (Recibidas ya habla con el backend real de Development;
  // otros siguen siendo mock puro) — cada página sabe la verdad sobre sus propios datos,
  // así que decide su propio texto en vez de una comprobación repartida por toda la app.
  @Input() titulo?: string;
  @Input() detalle?: string;

  constructor() {
    addIcons({ informationCircleOutline });
  }
}
