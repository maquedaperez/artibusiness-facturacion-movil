import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader,
  IonIcon, IonLabel, IonText, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, documentTextOutline } from 'ionicons/icons';

import { DocumentoBancarioAnalizado } from '../../core/models/documento-bancario';
import { VerDocumentoComponent } from '../ver-documento/ver-documento.component';

type CampoDocumento = { etiqueta: string; valor: string };
type SeccionDocumento = { titulo: string; campos: CampoDocumento[] };

// Traducción best-effort de las claves más habituales del lector (recibos bancarios,
// remesas de adeudos) a etiquetas legibles — cualquier clave no listada aquí se muestra
// igualmente (ver etiquetaPara), solo que sin traducir, para no perder nunca un campo nuevo
// que el lector añada en el futuro.
const ETIQUETAS: Record<string, string> = {
  bank_name: 'Banco',
  bank: 'Banco',
  document_title: 'Tipo de documento',
  document_number: 'Número de documento',
  issuer: 'Emisor',
  issuer_name: 'Emisor',
  issuer_identification: 'Identificación del emisor',
  identification: 'Identificación',
  invoice_number: 'Número de factura / documento',
  file_reference: 'Referencia del fichero',
  reception_date: 'Fecha de recepción',
  operation_type: 'Tipo de operación',
  unique_reference: 'Referencia única',
  debtor_name: 'Nombre del librado',
  debtor_iban: 'IBAN del librado',
  debtor: 'Librado',
  account_holder: 'Titular de la cuenta',
  account_iban: 'IBAN',
  iban: 'IBAN',
  amount: 'Importe',
  nominal_amount: 'Nominal',
  commission: 'Comisión',
  mail_fee: 'Correo',
  taxes: 'Impuestos',
  tax_amount: 'Impuestos',
  net_amount: 'Líquido',
  due_date: 'Vencimiento',
  value_date: 'Fecha valor',
  charge_status: 'Estado del cargo',
  status: 'Estado',
  currency: 'Moneda',
  transactions: 'Operaciones',
  entries: 'Movimientos',
  references: 'Referencias',
  amounts: 'Importes',
  dates: 'Fechas',
};

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function etiquetaPara(clave: string): string {
  const normalizada = clave.trim().toLowerCase();
  return ETIQUETAS[normalizada]
    ?? clave.replace(/[_-]+/g, ' ').replace(/^./, letra => letra.toUpperCase());
}

function valorVisible(valor: unknown): string {
  if (valor == null || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'bigint') {
    return String(valor);
  }
  return JSON.stringify(valor) ?? '—';
}

// Aplana el objeto (que puede traer sub-objetos y arrays anidados: emisor, importes,
// movimientos...) en secciones con pares etiqueta/valor — recorrido genérico, sin asumir
// ninguna forma fija, para sobrevivir a que el lector añada o quite campos.
function construirSecciones(datos: Record<string, unknown>): SeccionDocumento[] {
  const secciones = new Map<string, CampoDocumento[]>();

  const agregar = (seccion: string, etiqueta: string, valor: unknown) => {
    const campos = secciones.get(seccion) ?? [];
    campos.push({ etiqueta, valor: valorVisible(valor) });
    secciones.set(seccion, campos);
  };

  const recorrer = (objeto: Record<string, unknown>, seccion: string) => {
    for (const [clave, valor] of Object.entries(objeto)) {
      const etiqueta = etiquetaPara(clave);

      if (esObjeto(valor)) {
        recorrer(valor, seccion === 'Datos generales' ? etiqueta : `${seccion} · ${etiqueta}`);
        continue;
      }

      if (Array.isArray(valor)) {
        if (valor.length === 0) {
          agregar(seccion, etiqueta, '—');
          continue;
        }
        if (valor.every(item => !esObjeto(item) && !Array.isArray(item))) {
          agregar(seccion, etiqueta, valor.map(valorVisible).join(' · '));
          continue;
        }
        valor.forEach((item, indice) => {
          const titulo = `${etiqueta} ${indice + 1}`;
          if (esObjeto(item)) recorrer(item, titulo);
          else agregar(titulo, 'Valor', item);
        });
        continue;
      }

      agregar(seccion, etiqueta, valor);
    }
  };

  recorrer(datos, 'Datos generales');
  return Array.from(secciones, ([titulo, campos]) => ({ titulo, campos }));
}

@Component({
  selector: 'app-documento-bancario',
  standalone: true,
  imports: [
    CommonModule,
    IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader,
    IonIcon, IonLabel, IonText, IonTitle, IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Documento bancario</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Cerrar" (click)="cerrar()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card color="warning" class="aviso-clasificacion">
        <ion-card-content>
          <strong>El lector ha detectado un documento bancario.</strong>
          <p>Se muestran los datos extraídos para su revisión. No se ha creado ninguna factura recibida.</p>
        </ion-card-content>
      </ion-card>

      <div class="metadatos">
        <ion-chip color="tertiary">
          <ion-label>bank_document</ion-label>
        </ion-chip>
        <ion-chip *ngIf="documento.confianza != null" color="medium">
          <ion-label>Confianza: {{ confianzaPct }}%</ion-label>
        </ion-chip>
      </div>

      <ion-text color="medium"><p class="nombre-archivo">{{ documento.nombreArchivo }}</p></ion-text>

      <ion-card *ngIf="documento.avisos.length" color="warning">
        <ion-card-content>
          <strong>Avisos del lector</strong>
          <p *ngFor="let aviso of documento.avisos">{{ aviso }}</p>
        </ion-card-content>
      </ion-card>

      <ion-card *ngFor="let seccion of secciones">
        <ion-card-content>
          <h2>{{ seccion.titulo }}</h2>
          <dl>
            <div class="campo" *ngFor="let campo of seccion.campos">
              <dt>{{ campo.etiqueta }}</dt>
              <dd>{{ campo.valor }}</dd>
            </div>
          </dl>
        </ion-card-content>
      </ion-card>

      <ion-text color="medium" *ngIf="secciones.length === 0">
        <p>El lector clasificó el fichero, pero no devolvió campos bancarios para mostrar.</p>
      </ion-text>

      <ion-button *ngIf="documento.documentoUrl" expand="block" fill="outline" (click)="verOriginal()">
        <ion-icon slot="start" name="document-text-outline"></ion-icon>
        Ver documento original
      </ion-button>

      <ion-text color="medium" *ngIf="documento.requestId">
        <p class="request-id">Identificador de análisis: {{ documento.requestId }}</p>
      </ion-text>
    </ion-content>
  `,
  styles: [`
    .aviso-clasificacion p, ion-card p { margin-bottom: 0; }
    .metadatos { display: flex; flex-wrap: wrap; gap: 4px; }
    .nombre-archivo { margin: 4px 4px 12px; overflow-wrap: anywhere; }
    h2 { margin: 0 0 12px; font-size: 1rem; font-weight: 700; }
    dl { margin: 0; }
    .campo { display: grid; grid-template-columns: minmax(110px, 42%) 1fr; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ion-color-step-150, #e2e2e2); }
    .campo:last-child { border-bottom: 0; }
    dt { color: var(--ion-color-medium); font-size: .86rem; }
    dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
    .request-id { margin-top: 18px; font-size: .75rem; overflow-wrap: anywhere; }
  `],
})
export class DocumentoBancarioComponent {
  private modalCtrl = inject(ModalController);

  @Input({ required: true }) documento!: DocumentoBancarioAnalizado;

  constructor() {
    addIcons({ closeOutline, documentTextOutline });
  }

  get confianzaPct(): number {
    return Math.round((this.documento.confianza ?? 0) * 100);
  }

  get secciones(): SeccionDocumento[] {
    return construirSecciones(this.documento.datos);
  }

  async verOriginal() {
    if (!this.documento.documentoUrl) return;
    const url = this.documento.documentoUrl;
    const tipo = url.startsWith('data:') ? url.slice(5, url.indexOf(';')) : '';
    const modal = await this.modalCtrl.create({
      component: VerDocumentoComponent,
      componentProps: { url, nombre: this.documento.nombreArchivo, tipo },
    });
    await modal.present();
  }

  cerrar() {
    this.modalCtrl.dismiss();
  }
}
