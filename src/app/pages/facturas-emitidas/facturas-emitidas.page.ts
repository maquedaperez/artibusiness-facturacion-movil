import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSegment, IonSegmentButton, IonLabel,
  IonSelect, IonSelectOption, IonSearchbar, IonItem, IonInput,
  IonCard, IonCardContent,
  IonText, IonIcon, IonButton, IonFab, IonFabButton,
  AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline, filterOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline,
} from 'ionicons/icons';

import { AccionesPermitidas, EstadoFactura, FacturaEmitida, Numerador } from '../../services/mock-facturas.service';
import { IssuedInvoicesRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';

@Component({
  selector: 'app-facturas-emitidas',
  templateUrl: './facturas-emitidas.page.html',
  styleUrls: ['./facturas-emitidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonSegment, IonSegmentButton, IonLabel,
    IonSelect, IonSelectOption, IonSearchbar, IonItem, IonInput,
    IonCard, IonCardContent,
    IonText, IonIcon, IonButton, IonFab, IonFabButton,
    DemoBannerComponent,
  ],
})
export class FacturasEmitidasPage implements OnInit {
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  estado: EstadoFactura = 'borrador';
  numeradorId: number | null = null;
  numeradores: Numerador[] = [];
  facturas: FacturaEmitida[] = [];
  searchQuery = '';
  mostrarFiltroSerie = false;
  fechaDesde = '';
  fechaHasta = '';
  cargando = false;

  constructor() {
    addIcons({
      documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline, filterOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.numeradores = this.invoicesRepo.getNumeradores();

    const estadoParam = this.route.snapshot.queryParamMap.get('estado');
    if (estadoParam === 'borrador' || estadoParam === 'contabilizada' || estadoParam === 'firmada') {
      this.estado = estadoParam;
    }

    this.refresh();
  }

  ionViewWillEnter() {
    this.refresh();
  }

  onEstadoChange(value: EstadoFactura) {
    this.estado = value;
    this.refresh();
  }

  onNumeradorChange(value: number | null) {
    this.numeradorId = value;
    this.refresh();
  }

  // Guarda de carrera, mismo criterio que facturas-recibidas.page.ts: si el usuario cambia
  // de pestaña/serie rápido, una respuesta antigua que llega DESPUÉS de una más reciente no
  // debe pisar la lista ya actualizada con los resultados nuevos.
  private peticionListarEnCurso = 0;
  async refresh() {
    const idPeticion = ++this.peticionListarEnCurso;
    this.cargando = true;
    try {
      const resultado = await this.invoicesRepo.listar(this.estado, this.numeradorId);
      if (idPeticion !== this.peticionListarEnCurso) return;
      this.facturas = resultado;
    } catch (e: any) {
      if (idPeticion !== this.peticionListarEnCurso) return;
      await this.showToast(e?.message ?? 'No se pudo cargar la lista de facturas.', 'danger');
    } finally {
      if (idPeticion === this.peticionListarEnCurso) this.cargando = false;
    }
  }

  // Filtro rápido dentro de la lista ya cargada (no es una búsqueda contra el
  // repositorio, ni aplica el mínimo de 2 caracteres de los selectores de
  // cliente/proveedor/catálogo — aquí ya tenemos toda la página delante, esto solo
  // reduce lo que se ve). fecha es un string ISO yyyy-mm-dd tanto en la factura como
  // en los inputs type="date", así que la comparación como texto ya ordena bien.
  get facturasFiltradas(): FacturaEmitida[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.facturas.filter(f => {
      if (q && !this.clienteNombre(f).toLowerCase().includes(q) && !this.conceptoResumen(f).toLowerCase().includes(q)) return false;
      if (this.fechaDesde && f.fecha < this.fechaDesde) return false;
      if (this.fechaHasta && f.fecha > this.fechaHasta) return false;
      return true;
    });
  }

  toggleFiltroSerie() {
    this.mostrarFiltroSerie = !this.mostrarFiltroSerie;
  }

  hayFiltrosActivos(): boolean {
    return this.numeradorId != null || !!this.fechaDesde || !!this.fechaHasta;
  }

  filtrosLabel(): string {
    const partes: string[] = [];
    if (this.numeradorId != null) partes.push('Serie: ' + this.numeradorSeleccionadoNombre());
    if (this.fechaDesde || this.fechaHasta) partes.push('Fechas');
    return partes.length > 0 ? partes.join(' · ') : 'Filtrar por serie o fecha';
  }

  abrir(f: FacturaEmitida) {
    this.router.navigate(['/app/emitidas', f.id]);
  }

  crearBorrador() {
    this.router.navigate(['/app/emitidas', 'nueva']);
  }

  clienteNombre(f: FacturaEmitida): string {
    return f.destinatario.nombre?.trim() || 'Cliente no disponible';
  }

  conceptoResumen(f: FacturaEmitida): string {
    return f.concepto?.trim() || 'Sin concepto';
  }

  totalFactura(f: FacturaEmitida): number {
    return this.invoicesRepo.totales(f).total;
  }

  // Para la etiqueta del filtro secundario de serie — ya no se muestra la serie en
  // la propia tarjeta (se retiró del resumen), solo aquí cuando el filtro está activo.
  numeradorSeleccionadoNombre(): string {
    return this.numeradorId != null ? this.invoicesRepo.numeradorNombre(this.numeradorId) : '';
  }

  estadoAeatLabel(f: FacturaEmitida): string {
    return this.invoicesRepo.estadoAeatLabel(f.estadoAeat);
  }

  // Etiqueta visible en la tarjeta para las 3 pestañas: en Borradores no hay estado
  // AEAT todavía, así que se muestra el propio estado interno ("Borrador") en vez de
  // dejar la tarjeta sin ninguna indicación — igual que ya hace Recibidas.
  estadoLabel(f: FacturaEmitida): string {
    if (f.estado === 'borrador') return 'Borrador';
    return this.estadoAeatLabel(f);
  }

  estadoAeatColor(f: FacturaEmitida): string {
    switch (f.estadoAeat) {
      case 'Correcto': return 'success';
      case 'AceptadoConErrores': return 'warning';
      case 'RechazadoAeat': return 'danger';
      case 'RequiereRevisionManual': return 'warning';
      default: return 'medium';
    }
  }

  accionesPermitidas(f: FacturaEmitida): AccionesPermitidas {
    return this.invoicesRepo.accionesPermitidas(f);
  }

  async duplicar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const copia = this.invoicesRepo.duplicar(f.id);
    if (!copia) return;
    await this.refresh();
    await this.showToast(`Borrador ${copia.numFactura} creado a partir de ${f.numFactura}.`);
  }

  async descargar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(f.id);
      descargarBlob(blob, nombre);
      await this.showToast('Documento descargado (simulado, no válido fiscalmente).');
    } catch {
      await this.showToast('No se pudo generar el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async compartir(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(f.id);
      await compartirBlob(blob, nombre);
    } catch {
      await this.showToast('No se pudo compartir el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async confirmarEliminar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar borrador',
      message: `¿Eliminar el borrador ${f.numFactura} de ${f.destinatario.nombre}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            this.invoicesRepo.eliminar(f.id);
            await this.refresh();
            await this.showToast('Borrador eliminado.');
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarContabilizar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura (simulado)',
      message: `¿Contabilizar la factura de ${f.destinatario.nombre} por ${this.formatEuros(this.totalFactura(f))}? En este entorno de demostración esto simula el envío a Verifactu/AEAT — no se realiza ninguna comunicación real con la Agencia Tributaria.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            this.invoicesRepo.contabilizar(f.id);
            await this.refresh();
            await this.showToast(`Factura de ${f.destinatario.nombre} contabilizada (simulado).`);
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarFirmar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Firmar factura (simulado)',
      message: `¿Firmar la factura de ${f.destinatario.nombre}? En este entorno de demostración esto simula el proceso de autofirma — no se genera ninguna firma electrónica real.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Firmar',
          handler: async () => {
            this.invoicesRepo.firmar(f.id);
            await this.refresh();
            await this.showToast(`Factura de ${f.destinatario.nombre} firmada (simulado).`);
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color });
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
