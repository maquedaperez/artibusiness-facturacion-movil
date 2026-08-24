import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-ver-documento',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ nombre || ('common.documentViewer.defaultTitle' | transloco) }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cerrar()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Encontrado en revisión 2026-08-19: un <img> nunca ha podido mostrar un PDF (el
           tipo más habitual en una factura) — mostraba un icono de imagen rota en vez del
           documento. Con 'tipo' (el content-type real del blob) se puede elegir el visor
           correcto en vez de asumir siempre imagen. -->
      <embed *ngIf="tipo === 'application/pdf'; else imagen" [src]="urlSegura" type="application/pdf" class="documento-pdf" />
      <ng-template #imagen>
        <img [src]="url" [alt]="nombre || altPorDefecto" class="documento-img" />
      </ng-template>
    </ion-content>
  `,
  styles: [`
    .documento-img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 8px;
    }

    .documento-pdf {
      width: 100%;
      height: calc(100vh - 120px);
      display: block;
      border: none;
    }
  `],
})
export class VerDocumentoComponent {
  private modalCtrl = inject(ModalController);
  private sanitizer = inject(DomSanitizer);
  private transloco = inject(TranslocoService);

  @Input() url = '';
  @Input() nombre = '';
  @Input() tipo = '';

  get altPorDefecto(): string {
    return this.transloco.translate('common.documentViewer.defaultAlt');
  }

  // El binding [src] de <embed> es un contexto RESOURCE_URL para Angular (igual que
  // <iframe>/<object>) — a diferencia de <img src>, lo bloquea con NG0904 salvo que se
  // marque explícitamente como segura. 'url' siempre viene de nosotros mismos (un blob:
  // object URL creado a partir de la respuesta del propio backend, o una Data URL de una
  // vista previa local) — nunca texto arbitrario de fuera, así que confiar en ella aquí es
  // seguro.
  //
  // Getter en vez de calcularlo una vez en ngOnChanges/ngOnInit: ModalController.create()
  // fija componentProps por asignación directa, no a través de un binding de plantilla —
  // ngOnChanges nunca llega a dispararse en ese caso (comprobado en revisión 2026-08-19,
  // el test con ngOnChanges fallaba en la práctica), así que un valor calculado una sola vez
  // en un lifecycle hook se habría quedado vacío para siempre.
  get urlSegura(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
  }

  constructor() {
    addIcons({ closeOutline });
  }

  cerrar() {
    this.modalCtrl.dismiss();
  }
}
