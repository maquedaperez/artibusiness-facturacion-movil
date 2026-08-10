import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonSearchbar, IonList, IonItem, IonLabel, IonCheckbox, IonInput, IonText,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, personAddOutline } from 'ionicons/icons';

import { MockFacturasService, ClienteMock, Destinatario } from '../../services/mock-facturas.service';

@Component({
  selector: 'app-cliente-selector',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
    IonSearchbar, IonList, IonItem, IonLabel, IonCheckbox, IonInput, IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Seleccionar cliente</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ng-container *ngIf="!modoNuevo">
        <ion-searchbar
          placeholder="Buscar por nombre o NIF"
          [(ngModel)]="query"
          (ionInput)="buscar()"
        ></ion-searchbar>

        <ion-list>
          <ion-item *ngFor="let c of resultados" button (click)="seleccionar(c)">
            <ion-label>
              <h2>{{ c.nombre }}</h2>
              <p>{{ c.nif }} · {{ c.esEmpresa ? 'Empresa' : 'Particular' }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-text color="medium" *ngIf="resultados.length === 0">
          <p class="ion-padding-top">Sin resultados para "{{ query }}".</p>
        </ion-text>

        <ion-button expand="block" fill="outline" class="ion-margin-top" (click)="modoNuevo = true">
          <ion-icon slot="start" name="person-add-outline"></ion-icon>
          Cliente nuevo
        </ion-button>
      </ng-container>

      <ng-container *ngIf="modoNuevo">
        <ion-item>
          <ion-checkbox [(ngModel)]="nuevo.esEmpresa">¿Empresa?</ion-checkbox>
        </ion-item>

        <ion-item>
          <ion-input label="Nombre / Razón social" labelPlacement="stacked" [(ngModel)]="nuevo.nombre"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input [label]="nuevo.esEmpresa ? 'CIF' : 'NIF'" labelPlacement="stacked" [(ngModel)]="nuevo.nif"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="Dirección" labelPlacement="stacked" [(ngModel)]="nuevo.direccion"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="Población" labelPlacement="stacked" [(ngModel)]="nuevo.poblacion"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="Código postal" labelPlacement="stacked" [(ngModel)]="nuevo.cp"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="Provincia" labelPlacement="stacked" [(ngModel)]="nuevo.provincia"></ion-input>
        </ion-item>

        <ion-text color="danger" *ngIf="errorMsg">
          <p class="ion-padding-top">{{ errorMsg }}</p>
        </ion-text>

        <div class="botones">
          <ion-button expand="block" fill="outline" (click)="modoNuevo = false">Volver a buscar</ion-button>
          <ion-button expand="block" (click)="confirmarNuevo()">Usar este cliente</ion-button>
        </div>
      </ng-container>
    </ion-content>
  `,
  styles: [`
    .botones {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }
  `],
})
export class ClienteSelectorComponent implements OnInit {
  query = '';
  resultados: ClienteMock[] = [];
  modoNuevo = false;
  errorMsg = '';

  nuevo: Destinatario = {
    nombre: '', nif: '', esEmpresa: false, direccion: '', poblacion: '', cp: '', provincia: '',
  };

  constructor(
    private mock: MockFacturasService,
    private modalCtrl: ModalController,
  ) {
    addIcons({ closeOutline, personAddOutline });
  }

  ngOnInit() {
    this.buscar();
  }

  buscar() {
    this.resultados = this.mock.buscarClientes(this.query);
  }

  seleccionar(c: ClienteMock) {
    this.modalCtrl.dismiss(c, 'confirm');
  }

  confirmarNuevo() {
    this.errorMsg = '';
    if (!this.nuevo.nombre.trim() || !this.nuevo.nif.trim()) {
      this.errorMsg = 'Nombre y NIF/CIF son obligatorios.';
      return;
    }
    const creado = this.mock.crearClienteAdHoc({ ...this.nuevo });
    this.modalCtrl.dismiss(creado, 'confirm');
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
