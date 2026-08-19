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
  cameraOutline, receiptOutline, attachOutline, addOutline, filterOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline, checkmarkCircleOutline,
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

  facturas: FacturaRecibida[] = [];
  processing = false;
  cargando = false;

  // El endpoint CrearDesdeDocumento (escanea + guarda + sube el PDF al blob, todo de una
  // vez) es lo que hay detrás de los dos botones de escanear/adjuntar — mientras el flag
  // esté en false esos botones ni se muestran, para no dejar una acción que solo devolvería
  // 404 (ver mostrarEscaneo() más abajo). Se activa en environment.ts/.prod.ts.
  mostrarEscaneo = environment.features?.enableQuickSave ?? false;

  searchQuery = '';
  mostrarFiltros = false;
  estadoFiltro: 'todos' | 'borrador' | 'revisada' = 'todos';
  pagadaFiltro: 'todos' | 'si' | 'no' = 'todos';
  fechaDesde = '';
  fechaHasta = '';

  constructor() {
    addIcons({
      cameraOutline, receiptOutline, attachOutline, addOutline, filterOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline, checkmarkCircleOutline,
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
    if (this.estadoFiltro !== 'todos') partes.push(this.estadoFiltro === 'borrador' ? 'Borrador' : 'Contabilizada');
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

  // Consolidado 2026-08-17 a petición del jefe: antes había tres botones (Escanear con
  // cámara / Subir archivo → dejaban un borrador local para revisar antes de guardar; y por
  // separado, Guardado rápido → escaneaba, guardaba y subía el PDF al blob en un solo paso).
  // Confirmado que el flujo todo-en-uno ya funciona bien, así que ahora es EL ÚNICO camino:
  // los dos botones que quedan (cámara y adjuntar documento) llaman los dos a
  // crearDesdeDocumentoDirecto — no hay pantalla de revisión intermedia. Si el proveedor no
  // se reconoce por NIF o el documento no trae número de factura, el backend rechaza y no se
  // guarda nada — el mensaje de error ya viene listo para mostrar tal cual.
  async onFileSelected(event: Event) {
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
      const motivo = this.motivoBorradorLocal(e?.message);
      if (motivo) {
        await this.intentarBorradorLocal(file, motivo);
      } else {
        await this.showToast(e?.message ?? 'No se pudo guardar la factura. Inténtalo de nuevo.', 'danger');
      }
    } finally {
      this.processing = false;
    }
  }

  // BUG crítico corregido 2026-08-18: CrearDesdeDocumento (el guardado automático) rechaza
  // sin guardar nada si el proveedor no está dado de alta por NIF, o si el NIF/número de
  // factura no se leyeron bien — antes de la consolidación del 2026-08-17 esos casos SIEMPRE
  // caían a un borrador local para completar a mano (ver crearDesdeOcr, que sigue existiendo
  // y funcionando: solo se dejó de llamar desde aquí). Al unificar el flujo se perdió ese
  // salvavidas: el usuario escaneaba una factura real de un proveedor todavía no dado de
  // alta y se quedaba sin nada, teniendo que volver a teclear la factura entera a mano. Se
  // reintroduce el fallback SOLO para estos motivos concretos (datos que de verdad hacen
  // falta completar a mano) — un fallo total de extracción o una factura duplicada deben
  // seguir siendo un error claro, no un borrador fantasma que solo confundiría (reintentar
  // el análisis puro fallaría igual, o el usuario pensaría que puede seguir con una factura
  // que el backend ya le ha dicho que no). Devuelve el motivo concreto (no solo si/no) para
  // poder mostrar un aviso claro en vez del texto crudo del backend — pedido por el usuario
  // 2026-08-18: el mensaje original era correcto pero poco directo para alguien sin contexto
  // técnico.
  private motivoBorradorLocal(mensaje?: string): 'proveedor-no-encontrado' | 'nif-ilegible' | 'numero-ilegible' | null {
    if (!mensaje) return null;
    if (/no existe ningún proveedor con nif/i.test(mensaje)) return 'proveedor-no-encontrado';
    if (/no trae un nif de proveedor legible/i.test(mensaje)) return 'nif-ilegible';
    if (/no trae un número de factura legible/i.test(mensaje)) return 'numero-ilegible';
    return null;
  }

  private mensajeBorradorLocal(motivo: 'proveedor-no-encontrado' | 'nif-ilegible' | 'numero-ilegible'): string {
    switch (motivo) {
      case 'proveedor-no-encontrado':
        return 'Proveedor no encontrado en el sistema. Se ha abierto un borrador: dalo de alta manualmente antes de guardar.';
      case 'nif-ilegible':
        return 'No se ha podido leer el NIF del proveedor. Se ha abierto un borrador: complétalo o da de alta el proveedor manualmente.';
      case 'numero-ilegible':
        return 'No se ha podido leer el número de factura. Se ha abierto un borrador para completarlo a mano.';
    }
  }

  // Pedido por el usuario 2026-08-18: dejar el borrador en la lista y ya está no basta —
  // entre las demás facturas se pierde de vista y hay que ir a buscarlo. Se abre directo su
  // detalle para que el usuario siga trabajando ahí mismo (completar proveedor y guardar) sin
  // tener que encontrarlo primero. No hace falta refresh() aquí: se navega fuera de esta
  // pantalla, y la lista ya se recarga sola al volver a ella (ionViewWillEnter).
  private async intentarBorradorLocal(
    file: File,
    motivo: 'proveedor-no-encontrado' | 'nif-ilegible' | 'numero-ilegible',
  ) {
    try {
      const borrador = await this.invoicesRepo.crearDesdeOcr(file);
      await this.showToast(this.mensajeBorradorLocal(motivo), 'danger');
      await this.router.navigate(['/app/recibidas', borrador.id]);
    } catch {
      // Si ni siquiera el análisis puro consigue nada, no hay borrador que ofrecer.
      await this.showToast('No se pudo procesar el documento. Inténtalo de nuevo o crea la factura manualmente.', 'danger');
    }
  }

  accionesPermitidas(f: FacturaRecibida): AccionesPermitidas {
    return this.invoicesRepo.accionesPermitidas(f);
  }

  // Acceso directo a "Contabilizar" desde el listado, igual que ya existe en Facturas
  // Emitidas — sigue el mismo proceso que el botón del detalle (factura-recibida-detalle.
  // page.ts): pide la factura completa antes de guardar porque 'f' viene de listar(), que
  // nunca rellena 'lineas' (ver duplicar() más abajo) — reenviar el objeto tal cual a
  // actualizar() borraría todas las líneas reales de la factura.
  async confirmarContabilizar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    const completa = await this.invoicesRepo.obtenerPorId(f.id);
    if (!completa) {
      await this.showToast('No se pudo cargar la factura completa.', 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura',
      message: `¿Contabilizar la factura ${completa.numFactura} de ${completa.proveedor} por ${this.formatEuros(this.invoicesRepo.totales(completa).total)}? Quedará bloqueada para editar — solo podrá eliminarse (si corresponde) o gestionarse desde analítica/pagos.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            try {
              const { id: _id, origenOcr: _ocr, ...resto } = completa;
              await this.invoicesRepo.actualizar(completa.id, { ...resto, estado: 'revisada' });
              await this.refresh();
              await this.showToast('Factura contabilizada.');
            } catch (e) {
              await this.showToast(e instanceof Error ? e.message : 'No se pudo contabilizar la factura.', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async duplicar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    // BUG real (2026-08-14): 'f' viene tal cual de listar(), que para facturas reales
    // nunca rellena 'lineas' (solo lo hace obtenerPorId, con una petición aparte) — copiar
    // directamente desde la lista producía un borrador con 0 líneas y, por tanto, 0,00 €
    // en todo. Se pide el detalle completo antes de duplicar, igual que ya hacía el botón
    // de copiar dentro de la propia página de detalle.
    const completa = await this.invoicesRepo.obtenerPorId(f.id) ?? f;
    const numFacturaNueva = await this.pedirNumeroFacturaCopia(completa.proveedor);
    if (numFacturaNueva == null) return; // cancelado en el diálogo

    try {
      await this.invoicesRepo.duplicar(completa, numFacturaNueva);
      await this.refresh();
      await this.showToast(`Copia guardada a partir de la factura de ${completa.proveedor}.`);
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo copiar la factura.', 'danger');
    }
  }

  // "Copiar" guarda ya de verdad en el backend (2026-08-17, ver ReceivedInvoicesRepository.
  // duplicar) — Guardar exige un número de factura no vacío, y la copia nunca hereda el del
  // original (sería un número repetido), así que hace falta pedirlo antes de nada. Devuelve
  // null si el usuario cancela.
  private pedirNumeroFacturaCopia(proveedor: string): Promise<string | null> {
    return new Promise(resolve => {
      this.alertCtrl.create({
        header: 'Número de la nueva factura',
        message: `Se copiará la factura de ${proveedor} (proveedor, líneas, importes...) y se guardará directamente. El resto de datos se pueden ajustar después.`,
        // Corregido 2026-08-18: sin esto, tocar fuera del diálogo lo cierra sin pasar por
        // ningún botón — ni "Cancelar" ni "Copiar y guardar" llegan a ejecutarse. No cubre
        // el botón físico/gesto "atrás" de Android, que puede cerrar el diálogo igual sin
        // pasar por backdropDismiss — de ahí la red de seguridad en onDidDismiss() de abajo.
        backdropDismiss: false,
        inputs: [{ name: 'numFactura', type: 'text', placeholder: 'Número de factura' }],
        buttons: [
          { text: 'Cancelar', role: 'cancel', handler: () => resolve(null) },
          {
            text: 'Copiar y guardar',
            handler: (data: { numFactura?: string }) => {
              const valor = data.numFactura?.trim();
              if (!valor) return false; // no cierra el diálogo: hace falta un número
              resolve(valor);
              return true;
            },
          },
        ],
      }).then(alert => {
        // Red de seguridad: si el diálogo se cierra por cualquier vía que no sea un botón
        // (atrás en Android, por ejemplo), resuelve null en vez de dejar la promesa
        // colgada. resolve() es idempotente — si un botón ya resolvió con un valor real,
        // esta llamada no hace nada.
        alert.onDidDismiss().then(() => resolve(null));
        alert.present();
      });
    });
  }

  // Corregido 2026-08-19: fetch(f.documentoUrl!) directo dejó de valer en cuanto el
  // documento pasó a vivir en un endpoint protegido (Bearer) en vez de una URL de Blob
  // abierta — obtenerBlobDocumento() decide él mismo si sigue siendo una vista previa local
  // o hay que pedirlo de verdad al backend.
  private async adjuntoABlob(f: FacturaRecibida): Promise<Blob> {
    return this.invoicesRepo.obtenerBlobDocumento(f.documentoUrl!);
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
    // Defensa en profundidad (el icono ya está oculto por accionesPermitidas(f).eliminar):
    // no tiene sentido dejar borrar desde la app algo marcado como ya pagado, ni una
    // factura ya contabilizada (regla confirmada por el jefe, reunión 2026-08-17) — el
    // backend todavía no impide ninguno de los dos.
    if (f.pagada) {
      await this.showToast('No se puede eliminar una factura marcada como pagada.', 'danger');
      return;
    }
    if (f.accountingLocked) {
      await this.showToast('No se puede eliminar una factura ya contabilizada.', 'danger');
      return;
    }

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
