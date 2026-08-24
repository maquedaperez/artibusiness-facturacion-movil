import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, from, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

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
    CommonModule, FormsModule, TranslocoPipe,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
    IonSearchbar, IonList, IonItem, IonLabel, IonInput, IonText, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ 'invoices.received.supplierSelector.title' | transloco }}</ion-title>
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
          [placeholder]="'invoices.received.supplierSelector.searchPlaceholder' | transloco"
          [(ngModel)]="query"
          (ionInput)="onQueryChange()"
        ></ion-searchbar>

        <ion-text color="medium" *ngIf="estado === 'inicial'">
          <p class="ion-padding-top">{{ 'invoices.received.supplierSelector.typeToSearch' | transloco }}</p>
        </ion-text>

        <div class="estado-buscando" *ngIf="estado === 'buscando'">
          <ion-spinner name="dots"></ion-spinner>
          <ion-text color="medium"><p class="ion-no-margin">{{ 'invoices.received.supplierSelector.searching' | transloco }}</p></ion-text>
        </div>

        <ion-text color="medium" *ngIf="estado === 'sin-resultados'">
          <p class="ion-padding-top">{{ 'invoices.received.supplierSelector.noResultsFor' | transloco: { query } }}</p>
        </ion-text>

        <ion-text color="danger" *ngIf="estado === 'error'">
          <p class="ion-padding-top">{{ 'invoices.received.supplierSelector.searchError' | transloco }}</p>
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
          {{ 'invoices.received.supplierSelector.newSupplier' | transloco }}
        </ion-button>
      </ng-container>

      <ng-container *ngIf="modoNuevo">
        <ion-item>
          <ion-input [label]="'invoices.received.supplierSelector.nameLabel' | transloco" labelPlacement="stacked" [(ngModel)]="nuevo.nombre"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input [label]="'invoices.received.supplierSelector.nifCif' | transloco" labelPlacement="stacked" [(ngModel)]="nuevo.nif"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input [label]="'invoices.received.supplierSelector.address' | transloco" labelPlacement="stacked" [(ngModel)]="nuevo.direccion"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input [label]="'invoices.received.supplierSelector.city' | transloco" labelPlacement="stacked" [(ngModel)]="nuevo.poblacion"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input [label]="'invoices.received.supplierSelector.postalCode' | transloco" labelPlacement="stacked" [(ngModel)]="nuevo.cp"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input [label]="'invoices.received.supplierSelector.province' | transloco" labelPlacement="stacked" [(ngModel)]="nuevo.provincia"></ion-input>
        </ion-item>

        <ion-text color="danger" *ngIf="errorMsg">
          <p class="ion-padding-top">{{ errorMsg }}</p>
        </ion-text>

        <div class="botones">
          <ion-button expand="block" fill="outline" [disabled]="guardando" (click)="modoNuevo = false">{{ 'invoices.received.supplierSelector.backToSearch' | transloco }}</ion-button>
          <ion-button expand="block" [disabled]="guardando" (click)="confirmarNuevo()">
            <ion-spinner name="dots" *ngIf="guardando"></ion-spinner>
            <ng-container *ngIf="!guardando">{{ 'invoices.received.supplierSelector.useThisSupplier' | transloco }}</ng-container>
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
export class ProveedorSelectorComponent implements OnInit, OnDestroy {
  private suppliersRepo = inject(SuppliersRepository);
  private modalCtrl = inject(ModalController);
  private transloco = inject(TranslocoService);

  // Pedido por el usuario 2026-08-18: cuando el borrador viene de un escaneo cuyo proveedor
  // no se reconoció por NIF, la factura YA tiene nombre/NIF/dirección extraídos por el OCR
  // (ver FacturaRecibida.proveedor*) — antes había que teclearlos otra vez de cero aquí,
  // aunque la app ya los tuviera delante. Quien abre el modal decide si hay algo que
  // precargar (factura-recibida-detalle.page.ts, elegirProveedor()).
  @Input() datosIniciales?: Partial<Omit<ProveedorMock, 'id'>>;

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

  ngOnInit() {
    // Ya sabemos (el propio backend lo acaba de decir) que este NIF no tiene proveedor dado
    // de alta — no tiene sentido mandar al usuario a la pantalla de búsqueda primero cuando
    // ya se le puede llevar directo al alta con lo que ya tenemos; "Volver a buscar" sigue
    // ahí por si el OCR se equivocó y el proveedor real ya existe con otro NIF.
    if (this.datosIniciales?.nombre?.trim() || this.datosIniciales?.nif?.trim()) {
      this.nuevo = { ...this.nuevo, ...this.datosIniciales };
      this.modoNuevo = true;
    }
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

  guardando = false;

  async confirmarNuevo() {
    this.errorMsg = '';
    if (!this.nuevo.nombre.trim() || !this.nuevo.nif.trim()) {
      this.errorMsg = this.transloco.translate('invoices.received.supplierSelector.nameNifRequired');
      return;
    }
    if (!this.nuevo.direccion?.trim() || !this.nuevo.cp?.trim() || !this.nuevo.poblacion?.trim() || !this.nuevo.provincia?.trim()) {
      this.errorMsg = this.transloco.translate('invoices.received.supplierSelector.addressRequired');
      return;
    }

    this.guardando = true;
    try {
      // crearAdHoc llama de verdad a POST /api/Proveedores/Crear, así que el id que vuelve
      // ya es un id real del backend — mismo role 'confirm' que una búsqueda normal.
      const creado = await this.suppliersRepo.crearAdHoc({ ...this.nuevo });
      this.modalCtrl.dismiss(creado, 'confirm');
    } catch (e) {
      this.errorMsg = e instanceof Error ? e.message : this.transloco.translate('invoices.received.supplierSelector.createError');
    } finally {
      this.guardando = false;
    }
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
