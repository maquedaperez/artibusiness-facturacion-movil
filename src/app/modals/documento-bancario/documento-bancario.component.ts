import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader,
  IonIcon, IonLabel, IonText, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, documentTextOutline } from 'ionicons/icons';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { DocumentoBancarioAnalizado } from '../../core/models/documento-bancario';
import { VerDocumentoComponent } from '../ver-documento/ver-documento.component';

type CampoDocumento = { etiqueta: string; valor: string };
type SeccionDocumento = { titulo: string; campos: CampoDocumento[] };

// Traducción best-effort de las claves más habituales del lector (recibos bancarios,
// remesas de adeudos) a etiquetas legibles — cualquier clave no listada aquí se muestra
// igualmente (ver etiquetaPara), solo que sin traducir (es contenido del propio lector, no
// texto de la app), para no perder nunca un campo nuevo que el lector añada en el futuro.
// Los valores son CLAVES de traducción (namespace bankDocuments.fields.*), no texto literal.
const ETIQUETAS: Record<string, string> = {
  bank_name: 'bankDocuments.fields.bank',
  bank: 'bankDocuments.fields.bank',
  document_title: 'bankDocuments.fields.documentType',
  document_number: 'bankDocuments.fields.documentNumber',
  issuer: 'bankDocuments.fields.issuer',
  issuer_name: 'bankDocuments.fields.issuer',
  issuer_identification: 'bankDocuments.fields.issuerIdentification',
  identification: 'bankDocuments.fields.identification',
  invoice_number: 'bankDocuments.fields.invoiceNumber',
  file_reference: 'bankDocuments.fields.fileReference',
  reception_date: 'bankDocuments.fields.receptionDate',
  operation_type: 'bankDocuments.fields.operationType',
  unique_reference: 'bankDocuments.fields.uniqueReference',
  debtor_name: 'bankDocuments.fields.debtorName',
  debtor_iban: 'bankDocuments.fields.debtorIban',
  debtor: 'bankDocuments.fields.debtor',
  account_holder: 'bankDocuments.fields.accountHolder',
  account_iban: 'bankDocuments.fields.iban',
  iban: 'bankDocuments.fields.iban',
  amount: 'bankDocuments.fields.amount',
  nominal_amount: 'bankDocuments.fields.nominalAmount',
  commission: 'bankDocuments.fields.commission',
  mail_fee: 'bankDocuments.fields.mailFee',
  taxes: 'bankDocuments.fields.taxes',
  tax_amount: 'bankDocuments.fields.taxes',
  net_amount: 'bankDocuments.fields.netAmount',
  due_date: 'bankDocuments.fields.dueDate',
  value_date: 'bankDocuments.fields.valueDate',
  charge_status: 'bankDocuments.fields.chargeStatus',
  status: 'bankDocuments.fields.status',
  currency: 'bankDocuments.fields.currency',
  transactions: 'bankDocuments.fields.transactions',
  entries: 'bankDocuments.fields.entries',
  references: 'bankDocuments.fields.references',
  amounts: 'bankDocuments.fields.amounts',
  dates: 'bankDocuments.fields.dates',
};

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function etiquetaPara(clave: string, traducir: (clave: string) => string): string {
  const normalizada = clave.trim().toLowerCase();
  const claveTraduccion = ETIQUETAS[normalizada];
  return claveTraduccion
    ? traducir(claveTraduccion)
    : clave.replace(/[_-]+/g, ' ').replace(/^./, letra => letra.toUpperCase());
}

function valorVisible(valor: unknown, traducir: (clave: string) => string): string {
  if (valor == null || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? traducir('common.yes') : traducir('common.no');
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'bigint') {
    return String(valor);
  }
  return JSON.stringify(valor) ?? '—';
}

// Aplana el objeto (que puede traer sub-objetos y arrays anidados: emisor, importes,
// movimientos...) en secciones con pares etiqueta/valor — recorrido genérico, sin asumir
// ninguna forma fija, para sobrevivir a que el lector añada o quite campos.
function construirSecciones(datos: Record<string, unknown>, traducir: (clave: string) => string): SeccionDocumento[] {
  const secciones = new Map<string, CampoDocumento[]>();
  const tituloRaiz = traducir('bankDocuments.generalDataSection');

  const agregar = (seccion: string, etiqueta: string, valor: unknown) => {
    const campos = secciones.get(seccion) ?? [];
    campos.push({ etiqueta, valor: valorVisible(valor, traducir) });
    secciones.set(seccion, campos);
  };

  const recorrer = (objeto: Record<string, unknown>, seccion: string) => {
    for (const [clave, valor] of Object.entries(objeto)) {
      const etiqueta = etiquetaPara(clave, traducir);

      if (esObjeto(valor)) {
        recorrer(valor, seccion === tituloRaiz ? etiqueta : `${seccion} · ${etiqueta}`);
        continue;
      }

      if (Array.isArray(valor)) {
        if (valor.length === 0) {
          agregar(seccion, etiqueta, '—');
          continue;
        }
        if (valor.every(item => !esObjeto(item) && !Array.isArray(item))) {
          agregar(seccion, etiqueta, valor.map(v => valorVisible(v, traducir)).join(' · '));
          continue;
        }
        valor.forEach((item, indice) => {
          const titulo = `${etiqueta} ${indice + 1}`;
          if (esObjeto(item)) recorrer(item, titulo);
          else agregar(titulo, traducir('bankDocuments.valueLabel'), item);
        });
        continue;
      }

      agregar(seccion, etiqueta, valor);
    }
  };

  recorrer(datos, tituloRaiz);
  return Array.from(secciones, ([titulo, campos]) => ({ titulo, campos }));
}

@Component({
  selector: 'app-documento-bancario',
  standalone: true,
  imports: [
    CommonModule, TranslocoPipe,
    IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader,
    IonIcon, IonLabel, IonText, IonTitle, IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ 'bankDocuments.title' | transloco }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [attr.aria-label]="'common.actions.close' | transloco" (click)="cerrar()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card color="warning" class="aviso-clasificacion">
        <ion-card-content>
          <strong>{{ 'bankDocuments.detectedNotice' | transloco }}</strong>
          <p>{{ 'bankDocuments.detectedDescription' | transloco }}</p>
        </ion-card-content>
      </ion-card>

      <div class="metadatos">
        <ion-chip color="tertiary">
          <ion-label>bank_document</ion-label>
        </ion-chip>
        <ion-chip *ngIf="documento.confianza != null" color="medium">
          <ion-label>{{ 'bankDocuments.confidence' | transloco }} {{ confianzaPct }}%</ion-label>
        </ion-chip>
      </div>

      <ion-text color="medium"><p class="nombre-archivo">{{ documento.nombreArchivo }}</p></ion-text>

      <ion-card *ngIf="documento.avisos.length" color="warning">
        <ion-card-content>
          <strong>{{ 'bankDocuments.readerWarnings' | transloco }}</strong>
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
        <p>{{ 'bankDocuments.noFieldsNotice' | transloco }}</p>
      </ion-text>

      <ion-button *ngIf="documento.documentoUrl" expand="block" fill="outline" (click)="verOriginal()">
        <ion-icon slot="start" name="document-text-outline"></ion-icon>
        {{ 'bankDocuments.viewOriginal' | transloco }}
      </ion-button>

      <ion-text color="medium" *ngIf="documento.requestId">
        <p class="request-id">{{ 'bankDocuments.analysisId' | transloco }} {{ documento.requestId }}</p>
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
export class DocumentoBancarioComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private transloco = inject(TranslocoService);

  @Input({ required: true }) documento!: DocumentoBancarioAnalizado;

  // BUG real encontrado en pruebas 2026-08-20 (la app se quedaba congelada al abrir un
  // documento bancario): 'secciones' era un getter — Angular lo reevalúa en CADA ciclo de
  // detección de cambios (no solo cuando 'documento' cambia), y como construirSecciones()
  // devuelve un array NUEVO cada vez, el *ngFor de abajo destruía y reconstruía todas las
  // tarjetas/DOM en cada ciclo, en vez de reutilizarlas — con un documento bancario con
  // varios niveles anidados (emisor, importes, movimientos...) eso multiplica el trabajo en
  // cada tick y puede bloquear el hilo de la UI. Se calcula una sola vez en ngOnInit en vez
  // de en cada detección de cambios. componentProps del ModalController asigna 'documento'
  // por asignación directa ANTES de que Angular dispare ngOnInit (a diferencia de un binding
  // de plantilla), así que aquí ya está disponible con seguridad.
  secciones: SeccionDocumento[] = [];

  constructor() {
    addIcons({ closeOutline, documentTextOutline });
  }

  ngOnInit() {
    this.secciones = construirSecciones(this.documento.datos, clave => this.transloco.translate(clave));
  }

  get confianzaPct(): number {
    return Math.round((this.documento.confianza ?? 0) * 100);
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
