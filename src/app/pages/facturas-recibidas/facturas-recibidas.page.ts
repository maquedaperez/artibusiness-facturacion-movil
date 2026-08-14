import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonCard, IonCardContent,
  IonText, IonSpinner, IonFab, IonFabButton,
  IonSearchbar, IonItem, IonSelect, IonSelectOption, IonInput,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cameraOutline, receiptOutline, documentTextOutline, addOutline, filterOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline,
} from 'ionicons/icons';

import { AccionesPermitidas, FacturaRecibida } from '../../services/mock-facturas.service';
import { FiltrosListarRecibidas, ReceivedInvoicesRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';

@Component({
  selector: 'app-facturas-recibidas',
  templateUrl: './facturas-recibidas.page.html',
  styleUrls: ['./facturas-recibidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonCard, IonCardContent,
    IonText, IonSpinner, IonFab, IonFabButton,
    IonSearchbar, IonItem, IonSelect, IonSelectOption, IonInput,
    DemoBannerComponent,
  ],
})
export class FacturasRecibidasPage implements OnInit {
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);

  @ViewChild('fileInputCamera') fileInputCamera?: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputUpload') fileInputUpload?: ElementRef<HTMLInputElement>;

  facturas: FacturaRecibida[] = [];
  processing = false;
  cargando = false;

  searchQuery = '';
  mostrarFiltros = false;
  estadoFiltro: 'todos' | 'borrador' | 'revisada' = 'todos';
  pagadaFiltro: 'todos' | 'si' | 'no' = 'todos';
  fechaDesde = '';
  fechaHasta = '';

  constructor() {
    addIcons({
      cameraOutline, receiptOutline, documentTextOutline, addOutline, filterOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.refresh();
  }

  ionViewWillEnter() {
    this.refresh();
  }

  // proveedor (searchQuery), pagada y estado viajan al backend (Enumerar ya los soporta,
  // confirmado con el jefe el mapeo de Estado: 131 = borrador, 132 = revisada) — así la
  // búsqueda/filtro encuentra facturas antiguas aunque no quepan en el límite de página. Se
  // llama de nuevo cada vez que cambian, no solo al entrar en la pantalla.
  async refresh() {
    this.cargando = true;
    try {
      this.facturas = await this.invoicesRepo.listar(this.filtrosParaBackend());
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo cargar la lista de facturas.', 'danger');
    } finally {
      this.cargando = false;
    }
  }

  private filtrosParaBackend(): FiltrosListarRecibidas {
    return {
      query: this.searchQuery.trim() || undefined,
      pagada: this.pagadaFiltro === 'todos' ? undefined : this.pagadaFiltro === 'si',
      estado: this.estadoFiltro === 'todos' ? undefined : this.estadoFiltro,
    };
  }

  // Se llama al escribir en el buscador (con el debounce del propio ion-searchbar) o al
  // cambiar "Estado"/"Pagada" — los tres ya filtrados en el backend, así que hace falta
  // recargar, no solo refiltrar lo que ya había en memoria.
  onFiltroCambia() {
    this.refresh();
  }

  // El rango de fechas se queda como filtro puramente local (Enumerar solo admite año+mes,
  // no un rango arbitrario — ver FiltrosListarRecibidas) — se aplica sobre lo que ya haya
  // devuelto refresh(), no dispara una nueva petición. fecha es un string ISO yyyy-mm-dd
  // tanto en la factura como en los inputs type="date", así que comparar como texto ya
  // ordena bien.
  get facturasFiltradas(): FacturaRecibida[] {
    return this.facturas.filter(f => {
      if (this.fechaDesde && f.fecha < this.fechaDesde) return false;
      if (this.fechaHasta && f.fecha > this.fechaHasta) return false;
      return true;
    });
  }

  toggleFiltros() {
    this.mostrarFiltros = !this.mostrarFiltros;
  }

  hayFiltrosActivos(): boolean {
    return this.estadoFiltro !== 'todos' || this.pagadaFiltro !== 'todos' || !!this.fechaDesde || !!this.fechaHasta;
  }

  filtrosLabel(): string {
    const partes: string[] = [];
    if (this.estadoFiltro !== 'todos') partes.push(this.estadoFiltro === 'borrador' ? 'Borrador' : 'Revisada');
    if (this.pagadaFiltro !== 'todos') partes.push(this.pagadaFiltro === 'si' ? 'Pagada' : 'Pendiente');
    if (this.fechaDesde || this.fechaHasta) partes.push('Fechas');
    return partes.length > 0 ? partes.join(' · ') : 'Filtros';
  }

  abrir(f: FacturaRecibida) {
    this.router.navigate(['/app/recibidas', f.id]);
  }

  totalFactura(f: FacturaRecibida): number {
    return this.invoicesRepo.totales(f).total;
  }

  proveedorResumen(f: FacturaRecibida): string {
    return f.proveedor?.trim() || 'Proveedor no disponible';
  }

  conceptoResumen(f: FacturaRecibida): string {
    return f.concepto?.trim() || 'Sin concepto';
  }

  nuevaManual() {
    this.router.navigate(['/app/recibidas', 'nueva']);
  }

  triggerCamera() {
    this.fileInputCamera?.nativeElement.click();
  }

  triggerUpload() {
    this.fileInputUpload?.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.processing = true;
    try {
      // El servicio recibe el File real: la integración real solo cambia la
      // implementación interna por una subida multipart a POST /api/FacturaRecibida/desde-ocr.
      const nueva = await this.invoicesRepo.crearDesdeOcr(file);
      this.refresh();
      await this.showToast(`Borrador creado desde "${file.name}": ${nueva.proveedor}.`, 'success');
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo procesar el archivo. Inténtalo de nuevo.', 'danger');
    } finally {
      this.processing = false;
    }
  }

  accionesPermitidas(f: FacturaRecibida): AccionesPermitidas {
    return this.invoicesRepo.accionesPermitidas(f);
  }

  async duplicar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    try {
      // BUG real (2026-08-14): 'f' viene tal cual de listar(), que para facturas reales
      // nunca rellena 'lineas' (solo lo hace obtenerPorId, con una petición aparte) — copiar
      // directamente desde la lista producía un borrador con 0 líneas y, por tanto, 0,00 €
      // en todo. Se pide el detalle completo antes de duplicar, igual que ya hacía el botón
      // de copiar dentro de la propia página de detalle.
      const completa = await this.invoicesRepo.obtenerPorId(f.id) ?? f;
      this.invoicesRepo.duplicar(completa);
      await this.refresh();
      await this.showToast(`Borrador creado a partir de la factura de ${completa.proveedor}.`);
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo copiar la factura.', 'danger');
    }
  }

  private async adjuntoABlob(f: FacturaRecibida): Promise<Blob> {
    const respuesta = await fetch(f.documentoUrl!);
    return respuesta.blob();
  }

  async descargarAdjunto(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    try {
      const blob = await this.adjuntoABlob(f);
      descargarBlob(blob, f.documentoNombre || 'documento-adjunto');
      await this.showToast('Documento descargado.');
    } catch {
      await this.showToast('No se pudo descargar el documento.', 'danger');
    }
  }

  async compartirAdjunto(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    try {
      const blob = await this.adjuntoABlob(f);
      await compartirBlob(blob, f.documentoNombre || 'documento-adjunto');
    } catch {
      await this.showToast('No se pudo compartir el documento.', 'danger');
    }
  }

  async confirmarEliminar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar factura',
      message: `¿Eliminar la factura de ${f.proveedor}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.invoicesRepo.eliminar(f.id);
              await this.refresh();
              await this.showToast('Factura eliminada.');
            } catch (e) {
              await this.showToast(e instanceof Error ? e.message : 'No se pudo eliminar la factura.', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom', color });
    await toast.present();
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }

  formatFecha(f: string): string {
    const d = new Date(`${f}T00:00:00`);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
}
