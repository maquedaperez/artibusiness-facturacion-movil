import { Component, ViewChild, ElementRef, inject } from '@angular/core';
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
  copyOutline, downloadOutline, shareSocialOutline, trashOutline, flashOutline,
} from 'ionicons/icons';

import { AccionesPermitidas, FacturaRecibida } from '../../services/mock-facturas.service';
import { FiltrosListarRecibidas, ReceivedInvoicesRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { environment } from 'src/environments/environment';

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
export class FacturasRecibidasPage {
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);

  @ViewChild('fileInputCamera') fileInputCamera?: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputUpload') fileInputUpload?: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputRapido') fileInputRapido?: ElementRef<HTMLInputElement>;

  facturas: FacturaRecibida[] = [];
  processing = false;
  cargando = false;

  // El endpoint CrearDesdeDocumento está listo en local pero todavía no desplegado en el
  // backend real — mientras el flag esté en false, el botón ni siquiera se muestra, para no
  // dejar una acción que solo devolvería 404. Se activa en environment.ts/.prod.ts en
  // cuanto el jefe lo publique, sin tocar esta pantalla.
  mostrarGuardadoRapido = environment.features?.enableQuickSave ?? false;

  searchQuery = '';
  mostrarFiltros = false;
  estadoFiltro: 'todos' | 'borrador' | 'revisada' = 'todos';
  pagadaFiltro: 'todos' | 'si' | 'no' = 'todos';
  fechaDesde = '';
  fechaHasta = '';

  constructor() {
    addIcons({
      cameraOutline, receiptOutline, documentTextOutline, addOutline, filterOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline, flashOutline,
    });
  }

  // Solo ionViewWillEnter, no también ngOnInit: en Ionic, ionViewWillEnter ya se dispara la
  // primera vez que se entra a la pantalla (además de cada vez que se vuelve a ella) — tener
  // los dos disparaba refresh() por duplicado en la primera carga. Encontrado en revisión
  // 2026-08-14.
  ionViewWillEnter() {
    this.refresh();
  }

  // proveedor (searchQuery), pagada y estado viajan al backend (Enumerar ya los soporta,
  // confirmado con el jefe el mapeo de Estado: 131 = borrador, 132 = revisada) — así la
  // búsqueda/filtro encuentra facturas antiguas aunque no quepan en el límite de página. Se
  // llama de nuevo cada vez que cambian, no solo al entrar en la pantalla.
  //
  // Guarda de carrera: si el usuario escribe rápido en el buscador y una respuesta antigua
  // llega DESPUÉS que una más reciente (nada garantiza el orden de llegada de dos peticiones
  // en vuelo a la vez), sin esto la respuesta vieja podía pisar la lista ya actualizada con
  // los resultados nuevos. Solo se aplica la respuesta si sigue siendo la última pedida.
  private peticionListarEnCurso = 0;
  async refresh() {
    const idPeticion = ++this.peticionListarEnCurso;
    this.cargando = true;
    try {
      const resultado = await this.invoicesRepo.listar(this.filtrosParaBackend());
      if (idPeticion !== this.peticionListarEnCurso) return; // ya hay otra más reciente en vuelo
      this.facturas = resultado;
    } catch (e: any) {
      if (idPeticion !== this.peticionListarEnCurso) return;
      await this.showToast(e?.message ?? 'No se pudo cargar la lista de facturas.', 'danger');
    } finally {
      if (idPeticion === this.peticionListarEnCurso) this.cargando = false;
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

  triggerGuardadoRapido() {
    // Defensa en profundidad: el botón ya está oculto por *ngIf="mostrarGuardadoRapido" en
    // la plantilla, pero por si acaso se llega a llamar de otra forma, no se dispara ningún
    // selector de fichero que acabaría en una llamada al endpoint todavía no desplegado.
    if (!this.mostrarGuardadoRapido) return;
    this.fileInputRapido?.nativeElement.click();
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

  // "Guardado rápido" (pedido por el jefe, reunión 2026-08-14): a diferencia de
  // onFileSelected, esto NO crea un borrador para revisar — la factura queda guardada de
  // verdad (con el PDF ya en Blob Storage) en la misma llamada. Si el proveedor no se
  // reconoce por NIF o el documento no trae número de factura, el backend rechaza y no se
  // guarda nada — el mensaje de error ya viene listo para mostrar tal cual.
  async onFileSelectedGuardadoRapido(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.processing = true;
    try {
      const nueva = await this.invoicesRepo.crearDesdeDocumentoDirecto(file);
      await this.refresh();
      // Si hay avisos (ej. el PDF no se pudo subir a Blob Storage, o el total no cuadra),
      // se muestran como tal — de lo contrario quedarían enterrados: esta pantalla no
      // navega al detalle tras guardar, así que es la única oportunidad de que el usuario
      // los vea sin tener que abrir la factura a propósito.
      if (nueva.avisosOcr?.length) {
        await this.showToast(`Factura guardada, pero con avisos: ${nueva.avisosOcr[0]}`, 'danger');
      } else {
        await this.showToast(`Factura guardada desde "${file.name}": ${nueva.proveedor}.`, 'success');
      }
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo guardar la factura. Inténtalo de nuevo.', 'danger');
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
