import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, from, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonSearchbar, IonList, IonItem, IonLabel, IonInput, IonText, IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, addOutline } from 'ionicons/icons';

import { ProveedorMock } from '../../services/mock-facturas.service';
import { SuppliersRepository } from '../../core/ports';

const MIN_CARACTERES_BUSQUEDA = 2;
const DEBOUNCE_MS = 350;

type EstadoBusqueda = 'inicial' | 'buscando' | 'ok' | 'sin-resultados' | 'error';

@Component({
  selector: 'app-proveedor-selector',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
    IonSearchbar, IonList, IonItem, IonLabel, IonInput, IonText, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Seleccionar proveedor</ion-title>
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
          placeholder="Buscar por nombre o NIF (mínimo 2 caracteres)"
          [(ngModel)]="query"
          (ionInput)="onQueryChange()"
        ></ion-searchbar>

        <ion-text color="medium" *ngIf="estado === 'inicial'">
          <p class="ion-padding-top">Escribe al menos 2 caracteres para buscar.</p>
        </ion-text>

        <div class="estado-buscando" *ngIf="estado === 'buscando'">
          <ion-spinner name="dots"></ion-spinner>
          <ion-text color="medium"><p class="ion-no-margin">Buscando...</p></ion-text>
        </div>

        <ion-text color="medium" *ngIf="estado === 'sin-resultados'">
          <p class="ion-padding-top">Sin resultados para "{{ query }}".</p>
        </ion-text>

        <ion-text color="danger" *ngIf="estado === 'error'">
          <p class="ion-padding-top">No se pudo completar la búsqueda. Inténtalo de nuevo.</p>
        </ion-text>

        <ion-list *ngIf="estado === 'ok'">
          <ion-item *ngFor="let p of resultados" button (click)="seleccionar(p)">
            <ion-label>
              <h2>{{ p.nombre }}</h2>
              <p>{{ p.nif }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-button expand="block" fill="outline" class="ion-margin-top" (click)="modoNuevo = true">
          <ion-icon slot="start" name="add-outline"></ion-icon>
          Proveedor nuevo
        </ion-button>
      </ng-container>

      <ng-container *ngIf="modoNuevo">
        <ion-item>
          <ion-input label="Nombre / Razón social" labelPlacement="stacked" [(ngModel)]="nuevo.nombre"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="NIF/CIF" labelPlacement="stacked" [(ngModel)]="nuevo.nif"></ion-input>
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
          <ion-button expand="block" (click)="confirmarNuevo()">Usar este proveedor</ion-button>
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

    .estado-buscando {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 12px;
    }
  `],
})
export class ProveedorSelectorComponent implements OnDestroy {
  private suppliersRepo = inject(SuppliersRepository);
  private modalCtrl = inject(ModalController);

  private querySubject = new Subject<string>();
  private busquedaSub: Subscription;

  query = '';
  resultados: ProveedorMock[] = [];
  estado: EstadoBusqueda = 'inicial';
  modoNuevo = false;
  errorMsg = '';

  nuevo: Omit<ProveedorMock, 'id'> = {
    nombre: '', nif: '', direccion: '', poblacion: '', cp: '', provincia: '',
  };

  constructor() {
    addIcons({ closeOutline, addOutline });

    this.busquedaSub = this.querySubject.pipe(
      debounceTime(DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < MIN_CARACTERES_BUSQUEDA) return of('corta' as const);
        this.estado = 'buscando';
        return from(this.suppliersRepo.buscar(q)).pipe(
          catchError(() => of('error' as const))
        );
      })
    ).subscribe(resultado => {
      if (resultado === 'corta') {
        this.resultados = [];
        this.estado = 'inicial';
        return;
      }
      if (resultado === 'error') {
        this.resultados = [];
        this.estado = 'error';
        return;
      }
      this.resultados = resultado.items;
      this.estado = resultado.items.length === 0 ? 'sin-resultados' : 'ok';
    });
  }

  ngOnDestroy() {
    this.busquedaSub.unsubscribe();
  }

  onQueryChange() {
    if (!this.query.trim()) {
      this.resultados = [];
      this.estado = 'inicial';
    }
    this.querySubject.next(this.query);
  }

  seleccionar(p: ProveedorMock) {
    this.modalCtrl.dismiss(p, 'confirm');
  }

  confirmarNuevo() {
    this.errorMsg = '';
    if (!this.nuevo.nombre.trim() || !this.nuevo.nif.trim()) {
      this.errorMsg = 'Nombre y NIF son obligatorios.';
      return;
    }
    const creado = this.suppliersRepo.crearAdHoc({ ...this.nuevo });
    this.modalCtrl.dismiss(creado, 'confirm');
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
