import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-ver-documento',
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ nombre || 'Documento' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cerrar()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <img [src]="url" [alt]="nombre || 'Documento adjunto'" class="documento-img" />
    </ion-content>
  `,
  styles: [`
    .documento-img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 8px;
    }
  `],
})
export class VerDocumentoComponent {
  private modalCtrl = inject(ModalController);

  @Input() url = '';
  @Input() nombre = '';

  constructor() {
    addIcons({ closeOutline });
  }

  cerrar() {
    this.modalCtrl.dismiss();
  }
}
