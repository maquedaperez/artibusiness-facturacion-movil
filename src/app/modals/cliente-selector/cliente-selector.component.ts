import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, from, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonSearchbar, IonList, IonItem, IonLabel, IonCheckbox, IonInput, IonSelect, IonSelectOption, IonText, IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, personAddOutline } from 'ionicons/icons';

import { ClienteMock, Destinatario } from '../../services/mock-facturas.service';
import { CustomersRepository, IssuedInvoicesRepository, MedioPagoOpcion } from '../../core/ports';

const MIN_CARACTERES_BUSQUEDA = 2;
const DEBOUNCE_MS = 350;

type EstadoBusqueda = 'inicial' | 'buscando' | 'ok' | 'sin-resultados' | 'error';

// Fase 4 del plan de integración de Emitidas (2026-08-20): el modal ya no dismiss solo el
// ClienteMock — 'esNuevo' distingue un cliente real (búsqueda, id de verdad en el backend) de
// uno recién creado con crearAdHoc (todavía id de mock, no de verdad: Clientes/Crear no existe
// en el backend, ver customers.repository.http.ts). Guardar necesita esa distinción: solo un
// idCliente real se puede mandar a Guardar.
export type SeleccionCliente = { cliente: ClienteMock; esNuevo: boolean };

@Component({
  selector: 'app-cliente-selector',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
    IonSearchbar, IonList, IonItem, IonLabel, IonCheckbox, IonInput, IonSelect, IonSelectOption, IonText, IonSpinner,
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
          <ion-item *ngFor="let c of resultados" button (click)="seleccionar(c)">
            <ion-label>
              <h2>{{ c.nombre }}</h2>
              <p>{{ c.nif }} · {{ c.esEmpresa ? 'Empresa' : 'Particular' }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

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

        <ion-item>
          <ion-select label="Forma de pago" labelPlacement="stacked" interface="popover" [(ngModel)]="idMedioPago">
            <ion-select-option *ngFor="let m of mediosPago" [value]="m.id">{{ m.label }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-text color="danger" *ngIf="errorMsg">
          <p class="ion-padding-top">{{ errorMsg }}</p>
        </ion-text>

        <div class="botones">
          <ion-button expand="block" fill="outline" (click)="modoNuevo = false">Volver a buscar</ion-button>
          <ion-button expand="block" [disabled]="guardando" (click)="confirmarNuevo()">
            {{ guardando ? 'Creando…' : 'Usar este cliente' }}
          </ion-button>
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
export class ClienteSelectorComponent implements OnDestroy {
  private customersRepo = inject(CustomersRepository);
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private modalCtrl = inject(ModalController);

  private querySubject = new Subject<string>();
  private busquedaSub: Subscription;

  query = '';
  resultados: ClienteMock[] = [];
  estado: EstadoBusqueda = 'inicial';
  modoNuevo = false;
  errorMsg = '';
  guardando = false;

  nuevo: Destinatario = {
    nombre: '', nif: '', esEmpresa: false, direccion: '', poblacion: '', cp: '', provincia: '',
  };

  // Blindaje 2026-08-24: obligatorio para Clientes/Crear (única columna NOT NULL de `clientes`
  // que decide algo real del negocio) — ver customers.repository.http.ts.
  mediosPago: MedioPagoOpcion[] = [];
  idMedioPago: number | null = null;

  constructor() {
    addIcons({ closeOutline, personAddOutline });
    this.cargarMediosPago();

    // switchMap cancela la búsqueda anterior en cuanto llega una query nueva —
    // funciona igual con el mock (resuelve al instante) que con un futuro adapter
    // HTTP (donde sí habría una petición en vuelo que cancelar de verdad).
    this.busquedaSub = this.querySubject.pipe(
      debounceTime(DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < MIN_CARACTERES_BUSQUEDA) return of('corta' as const);
        this.estado = 'buscando';
        return from(this.customersRepo.buscar(q)).pipe(
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

  seleccionar(c: ClienteMock) {
    const seleccion: SeleccionCliente = { cliente: c, esNuevo: false };
    this.modalCtrl.dismiss(seleccion, 'confirm');
  }

  private async cargarMediosPago() {
    try {
      this.mediosPago = await this.invoicesRepo.obtenerMediosPago();
      if (this.mediosPago.length > 0) this.idMedioPago = this.mediosPago[0].id;
    } catch {
      // Sin catálogo, el select queda vacío — confirmarNuevo() ya exige elegir uno.
    }
  }

  async confirmarNuevo() {
    this.errorMsg = '';
    if (!this.nuevo.nombre.trim() || !this.nuevo.nif.trim()) {
      this.errorMsg = 'Nombre y NIF/CIF son obligatorios.';
      return;
    }
    if (!this.idMedioPago) {
      this.errorMsg = 'Selecciona una forma de pago para el cliente.';
      return;
    }
    if (this.guardando) return;
    this.guardando = true;
    try {
      const creado = await this.customersRepo.crearAdHoc({ ...this.nuevo }, this.idMedioPago);
      const seleccion: SeleccionCliente = { cliente: creado, esNuevo: true };
      this.modalCtrl.dismiss(seleccion, 'confirm');
    } catch (e: any) {
      this.errorMsg = e?.message ?? 'No se pudo crear el cliente. Inténtalo de nuevo.';
    } finally {
      this.guardando = false;
    }
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
