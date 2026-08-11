import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, from, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonSearchbar, IonList, IonItem, IonLabel, IonText, IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

import { Suscripcion } from '../../services/mock-facturas.service';
import { SubscriptionsRepository } from '../../core/ports';

const MIN_CARACTERES_BUSQUEDA = 2;
const DEBOUNCE_MS = 350;

type EstadoBusqueda = 'inicial' | 'buscando' | 'ok' | 'sin-resultados' | 'error';

// Selector de "línea de suscripción": busca bajo demanda, igual que el de catálogo.
// Solo elige el origen de una línea puntual — no genera renovaciones/cobros.
@Component({
  selector: 'app-suscripcion-selector',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
    IonSearchbar, IonList, IonItem, IonLabel, IonText, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Suscripción / servicio recurrente</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-searchbar
        placeholder="Buscar por nombre (mínimo 2 caracteres)"
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
        <ion-item *ngFor="let s of resultados" button [disabled]="s.estado !== 'activa'" (click)="seleccionar(s)">
          <ion-label>
            <h2>{{ s.nombre }}</h2>
            <p>{{ s.periodicidad }} · {{ formatEuros(s.precio) }} · IVA {{ s.ivaPct }}%
              <ng-container *ngIf="s.estado !== 'activa'"> · {{ s.estado === 'pausada' ? 'Pausada' : 'Cancelada' }}</ng-container>
            </p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [`
    .estado-buscando {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 12px;
    }
  `],
})
export class SuscripcionSelectorComponent implements OnDestroy {
  private subscriptionsRepo = inject(SubscriptionsRepository);
  private modalCtrl = inject(ModalController);

  private querySubject = new Subject<string>();
  private busquedaSub: Subscription;

  query = '';
  resultados: Suscripcion[] = [];
  estado: EstadoBusqueda = 'inicial';

  constructor() {
    addIcons({ closeOutline });

    this.busquedaSub = this.querySubject.pipe(
      debounceTime(DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < MIN_CARACTERES_BUSQUEDA) return of('corta' as const);
        this.estado = 'buscando';
        return from(this.subscriptionsRepo.buscar(q)).pipe(
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

  seleccionar(s: Suscripcion) {
    if (s.estado !== 'activa') return;
    this.modalCtrl.dismiss(s, 'confirm');
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  formatEuros(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }
}
