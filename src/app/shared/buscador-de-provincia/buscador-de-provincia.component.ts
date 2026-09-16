import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonItem, IonInput, IonList, IonLabel, IonNote } from '@ionic/angular/standalone';

import { Provincia, ProvincesRepository } from '../../core/ports/provinces.repository';
import { buscarProvincias, esLaMismaProvincia } from '../../shared/utils/buscar-provincia';

/**
 * Campo de provincia con sugerencias del catálogo de la empresa (2026-09-16).
 *
 * EL PROBLEMA QUE CIERRA. La provincia se escribía a mano y el backend la comparaba con su
 * catálogo: escribir "La Coruña" donde la empresa tiene "A Coruña" fallaba, y ninguna pantalla
 * decía qué nombres valen. Se usa igual en el alta de clientes y en la de proveedores.
 *
 * SIGUE FUNCIONANDO SIN CATÁLOGO. Si el endpoint no está publicado (404) o no hay conexión,
 * `enumerar()` devuelve una lista vacía, no se ofrece nada y el campo se comporta como el texto
 * libre de siempre. Por eso esto puede estar en la app antes que el backend.
 */
@Component({
  selector: 'app-buscador-de-provincia',
  standalone: true,
  imports: [CommonModule, FormsModule, IonItem, IonInput, IonList, IonLabel, IonNote],
  template: `
    <ion-item>
      <ion-input
        [label]="etiqueta"
        labelPlacement="stacked"
        [ngModel]="valor"
        (ngModelChange)="alEscribir($event)"
        (ionFocus)="escribiendo = true"
        (ionBlur)="alSalirDelCampo()"
        autocapitalize="words"
        autocomplete="off"
      ></ion-input>
    </ion-item>

    <ion-list *ngIf="sugerencias.length" class="sugerencias" lines="none">
      <ion-item
        *ngFor="let provincia of sugerencias"
        button
        detail="false"
        (click)="elegir(provincia)"
      >
        <ion-label>{{ provincia.nombre }}</ion-label>
      </ion-item>
    </ion-list>

    <ion-note *ngIf="avisoNoEstaEnElCatalogo" color="warning" class="aviso">
      {{ textoNoEstaEnElCatalogo }}
    </ion-note>
  `,
  styles: [`
    .sugerencias {
      margin: 0 0 8px;
      border-radius: 8px;
      background: var(--ion-color-step-50, #f5f5f5);
    }

    .sugerencias ion-item {
      --background: transparent;
      --min-height: 38px;
      font-size: .9rem;
    }

    .aviso {
      display: block;
      padding: 4px 16px 0;
      font-size: .8rem;
    }
  `],
})
export class BuscadorDeProvinciaComponent implements OnInit {
  private provincesRepo = inject(ProvincesRepository);

  // string | undefined porque la provincia es opcional en los dos modelos (un proveedor puede
  // no tener domicilio) — asi el [(valor)] encaja sin obligar a nadie a inicializarla.
  @Input() valor: string | undefined = '';
  @Output() valorChange = new EventEmitter<string>();
  @Input() etiqueta = '';
  /** Texto del aviso cuando lo escrito no está en el catálogo. Vacío = no se avisa. */
  @Input() textoNoEstaEnElCatalogo = '';

  catalogo: Provincia[] = [];
  sugerencias: Provincia[] = [];
  escribiendo = false;

  async ngOnInit() {
    this.catalogo = await this.provincesRepo.enumerar();
    // Si la provincia ya venía puesta (el OCR la trae en el alta de proveedor), no se abre
    // ninguna lista: solo se comprueba si está en el catálogo para poder avisar.
    this.sugerencias = [];
  }

  /**
   * Solo se avisa cuando hay catálogo Y lo escrito no encaja con nada: sin catálogo no se sabe
   * nada de nada, y avisar a ciegas sería mentir. Nunca impide guardar — el backend ya empareja
   * con tolerancia, y un proveedor extranjero puede no tener provincia española.
   */
  get avisoNoEstaEnElCatalogo(): boolean {
    if (!this.textoNoEstaEnElCatalogo || this.catalogo.length === 0) return false;
    const escrito = (this.valor ?? '').trim();
    if (escrito.length === 0 || this.escribiendo) return false;
    return !this.catalogo.some(p => esLaMismaProvincia(p.nombre, escrito));
  }

  alEscribir(valor: string) {
    this.valor = valor ?? '';
    this.valorChange.emit(this.valor);
    this.escribiendo = true;
    this.recalcularSugerencias();
  }

  elegir(provincia: Provincia) {
    this.valor = provincia.nombre;
    this.valorChange.emit(this.valor);
    this.sugerencias = [];
    this.escribiendo = false;
  }

  alSalirDelCampo() {
    // El clic en una sugerencia llega DESPUÉS del blur del campo: si la lista se ocultara aquí
    // mismo, el clic caería en el vacío y no se elegiría nada. Se espera un momento.
    setTimeout(() => {
      this.escribiendo = false;
      this.sugerencias = [];
    }, 200);
  }

  private recalcularSugerencias() {
    if (this.catalogo.length === 0) {
      this.sugerencias = [];
      return;
    }
    // Ya está escrita exactamente una del catálogo: no hay nada que sugerir.
    if (this.catalogo.some(p => p.nombre === this.valor)) {
      this.sugerencias = [];
      return;
    }
    this.sugerencias = buscarProvincias(this.catalogo, this.valor ?? '');
  }
}
