import { Component, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonCard, IonCardContent,
  IonText, IonSpinner, IonFab, IonFabButton,
  IonSearchbar, IonItem, IonSelect, IonSelectOption, IonInput,
  ToastController, AlertController, ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cameraOutline, receiptOutline, attachOutline, addOutline, filterOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline, checkmarkCircleOutline,
} from 'ionicons/icons';

import { AccionesPermitidas, FacturaRecibida } from '../../services/mock-facturas.service';
import { FiltrosListarRecibidas, ReceivedInvoicesRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { PagosService } from '../../services/pagos.service';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';
import { formatEuros as formatEurosUtil, formatFecha as formatFechaUtil } from '../../shared/utils/format-euros';
import { environment } from 'src/environments/environment';
import {
  DocumentoBancarioAnalizado, crearBorradorDesdeDocumentoBancario, esDocumentoBancarioAnalizado,
} from '../../core/models/documento-bancario';
import { DocumentoBancarioComponent } from '../../modals/documento-bancario/documento-bancario.component';

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
    TranslocoPipe,
    DemoBannerComponent,
  ],
})
export class FacturasRecibidasPage {
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private router = inject(Router);
  private transloco = inject(TranslocoService);
  private pagosService = inject(PagosService);

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
      await this.showToast(e?.message ?? this.transloco.translate('invoices.received.list.loadError'), 'danger');
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
    if (this.estadoFiltro !== 'todos') partes.push(this.transloco.translate(this.estadoFiltro === 'borrador' ? 'invoices.received.filters.draft' : 'invoices.received.filters.posted'));
    if (this.pagadaFiltro !== 'todos') partes.push(this.transloco.translate(this.pagadaFiltro === 'si' ? 'invoices.received.filters.paid' : 'invoices.received.filters.pending'));
    if (this.fechaDesde || this.fechaHasta) partes.push(this.transloco.translate('invoices.received.filters.dates'));
    return partes.length > 0 ? partes.join(' · ') : this.transloco.translate('invoices.received.filters.placeholder');
  }

  abrir(f: FacturaRecibida) {
    this.router.navigate(['/app/recibidas', f.id]);
  }

  totalFactura(f: FacturaRecibida): number {
    return this.invoicesRepo.totales(f).total;
  }

  proveedorResumen(f: FacturaRecibida): string {
    return f.proveedor?.trim() || this.transloco.translate('invoices.received.card.noSupplierFallback');
  }

  conceptoResumen(f: FacturaRecibida): string {
    return f.concepto?.trim() || this.transloco.translate('invoices.received.card.noConceptFallback');
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
  // Mismo límite que el backend (RequestSizeLimit en FacturasRecibidasController.
  // CrearDesdeDocumento) — comprobarlo aquí evita subir un archivo entero (fácil de superar con
  // una foto de cámara moderna) solo para que el servidor lo rechace con un error confuso.
  private static readonly TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > FacturasRecibidasPage.TAMANO_MAXIMO_BYTES) {
      await this.showToast(this.transloco.translate('ocr.fileTooLarge'), 'danger');
      return;
    }

    this.processing = true;
    try {
      const resultado = await this.invoicesRepo.crearDesdeDocumentoDirecto(file);
      // 2026-08-20 (correo de Alex): el lector puede clasificar el fichero como documento
      // bancario en vez de factura — HTTP 200 válido, no un error. No se crea ninguna
      // factura recibida ni se navega a ningún detalle: se abre el visor propio.
      if (esDocumentoBancarioAnalizado(resultado)) {
        await this.mostrarDocumentoBancario(resultado, file);
        return;
      }
      const nueva = resultado;
      // Pedido por el usuario 2026-08-19 (urgente): antes se quedaba en la lista con solo
      // un toast — el usuario tenía que buscar la factura recién escaneada él mismo. Ahora
      // se abre directo su detalle, igual que ya hace el fallback de proveedor no reconocido
      // (intentarBorradorLocal). El toast se mantiene (se muestra igual encima del detalle,
      // es un overlay global de Ionic, no depende de en qué pantalla se dispare) para que
      // los avisos (ej. el PDF no se pudo subir a Blob Storage, o el total no cuadra) sigan
      // siendo visibles sin depender de que el usuario los note dentro del propio detalle.
      // No hace falta refresh() aquí: se navega fuera de esta pantalla, y la lista ya se
      // recarga sola al volver a ella (ionViewWillEnter).
      if (nueva.avisosOcr?.length) {
        await this.showToast(this.transloco.translate('ocr.savedWithWarnings', { aviso: nueva.avisosOcr[0] }), 'danger');
      } else {
        await this.showToast(this.transloco.translate('ocr.savedSuccess', { archivo: file.name, proveedor: nueva.proveedor }), 'success');
      }
      await this.router.navigate(['/app/recibidas', nueva.id]);
    } catch (e: any) {
      if (this.esCreditosAgotados(e)) {
        await this.mostrarAvisoCreditosAgotados();
        return;
      }
      // Fallo real encontrado en auditoría 2026-08-31: el backend puede devolver HTTP 409
      // OPERATION_IN_PROGRESS (otra petición con el mismo id de operación sigue en curso) y
      // antes caía al mensaje genérico, mostrando el JSON crudo del body en el toast.
      if (this.esOperacionEnCurso(e)) {
        await this.showToast(this.transloco.translate('ocr.operationInProgress'), 'danger');
        return;
      }
      // Tickets/facturas simplificadas sin destinatario identificado (2026-08-29): estos 3
      // casos son rechazos de negocio explícitos, nunca un borrador que completar a mano — se
      // decide por el código estable que manda el backend, nunca por el texto en español que
      // venga en el mensaje.
      const codigoTicket = this.codigoErrorOcrTicket(e);
      if (codigoTicket) {
        await this.showToast(this.transloco.translate(this.claveErrorOcrTicket(codigoTicket)), 'danger');
        return;
      }
      const motivo = this.motivoBorradorLocal(e?.message);
      if (motivo) {
        await this.intentarBorradorLocal(file, motivo);
      } else {
        await this.showToast(e?.message ?? this.transloco.translate('ocr.saveGenericError'), 'danger');
      }
    } finally {
      this.processing = false;
    }
  }

  // Backend: FacturasRecibidasController.CrearDesdeDocumento devuelve estos 3 códigos estables
  // (422/422/409) para el flujo de tickets — comprobar el código dentro del mensaje es la misma
  // técnica ya usada en motivoBorradorLocal, pero sobre un código en inglés, no sobre el texto
  // en español (informe de revisión previa: "no tomes decisiones mediante textos españoles").
  private static readonly CODIGOS_ERROR_OCR_TICKET = [
    'OCR_RECIPIENT_MISMATCH', 'OCR_TICKET_PROVISIONING_FAILED', 'OCR_DOCUMENT_DUPLICATE',
    // Estabilización post-demo (2026-08-27): fallo de DISPONIBILIDAD del lector externo (5xx
    // suyo, o inalcanzable) — nunca consume crédito (ver ResolverConsumoCreditoAsync en el
    // backend), reintentable a mano, nunca automático (informe: "no reintentes hasta demostrar
    // idempotencia real"). Mismo mecanismo de detección por código estable que los 3 de arriba.
    'OCR_SERVICE_UNAVAILABLE',
  ] as const;

  private codigoErrorOcrTicket(e: unknown): string | null {
    if (!(e instanceof Error)) return null;
    return FacturasRecibidasPage.CODIGOS_ERROR_OCR_TICKET.find(codigo => e.message.includes(codigo)) ?? null;
  }

  private claveErrorOcrTicket(codigo: string): string {
    switch (codigo) {
      case 'OCR_RECIPIENT_MISMATCH': return 'ocr.recipientMismatch';
      case 'OCR_TICKET_PROVISIONING_FAILED': return 'ocr.ticketProvisioningFailed';
      case 'OCR_DOCUMENT_DUPLICATE': return 'ocr.documentDuplicate';
      case 'OCR_SERVICE_UNAVAILABLE': return 'ocr.serviceUnavailable';
      default: return 'ocr.saveGenericError';
    }
  }

  // Backend: FacturasRecibidasController devuelve HTTP 402 con code: "OCR_CREDITS_EXHAUSTED"
  // (mismo código en CrearDesdeDocumento y en AdjuntarDocumento) cuando la empresa está sujeta
  // a control de créditos (ver PagosOptions.EmpresasControlCreditos) y no le queda saldo. El
  // 402 basta por sí solo para identificarlo — a día de hoy es el único caso que lo usa.
  private esCreditosAgotados(e: unknown): boolean {
    return e instanceof Error && /^HTTP 402\b/.test(e.message);
  }

  // Backend: 409 con code: "OPERATION_IN_PROGRESS" cuando ya hay una reserva de crédito activa
  // para este mismo id de operación (ver CreditosService.IntentarReservarAsync) — por código
  // estable, igual que codigoErrorOcrTicket, nunca por el texto en español del mensaje.
  private esOperacionEnCurso(e: unknown): boolean {
    return e instanceof Error && e.message.includes('OPERATION_IN_PROGRESS');
  }

  private async mostrarAvisoCreditosAgotados() {
    const toast = await this.toastCtrl.create({
      message: this.transloco.translate('profile.payments.creditsExhausted'),
      color: 'danger',
      position: 'bottom',
      duration: 6000,
      buttons: [{
        text: this.transloco.translate('profile.payments.getMoreCredits'),
        handler: () => this.abrirPortalDePagos(),
      }],
    });
    await toast.present();
  }

  private async abrirPortalDePagos() {
    try {
      const url = await this.pagosService.obtenerUrlAccesoPortal();
      this.pagosService.abrirPortalDePagos(url);
    } catch {
      // Silencioso a propósito, mismo criterio que perfil.page.ts: un fallo aquí no debe
      // bloquear ni alarmar sobre un botón secundario de un toast de aviso.
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
        return this.transloco.translate('ocr.supplierNotFoundDraft');
      case 'nif-ilegible':
        return this.transloco.translate('ocr.nifUnreadableDraft');
      case 'numero-ilegible':
        return this.transloco.translate('ocr.numberUnreadableDraft');
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
      const resultado = await this.invoicesRepo.crearDesdeOcr(file);
      if (esDocumentoBancarioAnalizado(resultado)) {
        await this.mostrarDocumentoBancario(resultado, file);
        return;
      }
      const borrador = resultado;
      await this.showToast(this.mensajeBorradorLocal(motivo), 'danger');
      // Se pasa el fichero real por el estado de navegación (ver mostrarDocumentoBancario)
      // para que factura-recibida-detalle.page.ts pueda subirlo de verdad a Blob Storage al
      // guardar — antes de esto, este borrador se quedaba SOLO con la vista previa local para
      // siempre, porque el objeto File no sobrevive a la navegación a una pantalla nueva.
      await this.router.navigate(['/app/recibidas', borrador.id], { state: { archivoOriginal: file } });
    } catch {
      // Si ni siquiera el análisis puro consigue nada, no hay borrador que ofrecer.
      await this.showToast(this.transloco.translate('ocr.processDocumentError'), 'danger');
    }
  }

  // 2026-08-20, pedido explícito: un documento bancario también debe generar una Factura
  // Recibida (borrador para revisar, nunca guardado directo — ver
  // crearBorradorDesdeDocumentoBancario). Se muestra primero el visor con los datos crudos
  // extraídos; al cerrarlo, se navega directo al borrador ya creado (no se deja perdido en la
  // lista, mismo criterio que el resto de fallbacks de esta página). El fichero real se pasa
  // por el estado de navegación para que se pueda subir de verdad a Blob Storage al guardar.
  private async mostrarDocumentoBancario(documento: DocumentoBancarioAnalizado, archivoOriginal: File) {
    let borrador: FacturaRecibida | undefined;
    try {
      const datos = crearBorradorDesdeDocumentoBancario(documento, () => this.invoicesRepo.nuevoIdLinea());
      borrador = await this.invoicesRepo.crearBorradorLocal(datos);
    } catch {
      await this.showToast(this.transloco.translate('ocr.bankDocDraftError'), 'danger');
    }

    const modal = await this.modalCtrl.create({
      component: DocumentoBancarioComponent,
      componentProps: { documento },
    });
    await modal.present();
    await modal.onDidDismiss();

    if (borrador) {
      await this.router.navigate(['/app/recibidas', borrador.id], { state: { archivoOriginal } });
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
      await this.showToast(this.transloco.translate('invoices.received.list.loadFullError'), 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.received.post.header'),
      message: this.transloco.translate('invoices.received.post.message', { num: completa.numFactura, proveedor: completa.proveedor, importe: this.formatEuros(this.invoicesRepo.totales(completa).total) }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.received.actions.post'),
          handler: async () => {
            try {
              const { id: _id, origenOcr: _ocr, ...resto } = completa;
              await this.invoicesRepo.actualizar(completa.id, { ...resto, estado: 'revisada' });
              await this.refresh();
              await this.showToast(this.transloco.translate('invoices.received.post.success'));
            } catch (e) {
              await this.showToast(e instanceof Error ? e.message : this.transloco.translate('invoices.received.post.error'), 'danger');
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
      await this.showToast(this.transloco.translate('invoices.received.duplicate.success', { proveedor: completa.proveedor }));
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.received.duplicate.error'), 'danger');
    }
  }

  // "Copiar" guarda ya de verdad en el backend (2026-08-17, ver ReceivedInvoicesRepository.
  // duplicar) — Guardar exige un número de factura no vacío, y la copia nunca hereda el del
  // original (sería un número repetido), así que hace falta pedirlo antes de nada. Devuelve
  // null si el usuario cancela.
  private pedirNumeroFacturaCopia(proveedor: string): Promise<string | null> {
    return new Promise(resolve => {
      this.alertCtrl.create({
        header: this.transloco.translate('invoices.received.duplicate.numberDialogHeader'),
        message: this.transloco.translate('invoices.received.duplicate.numberDialogMessage', { proveedor }),
        // Corregido 2026-08-18: sin esto, tocar fuera del diálogo lo cierra sin pasar por
        // ningún botón — ni "Cancelar" ni "Copiar y guardar" llegan a ejecutarse. No cubre
        // el botón físico/gesto "atrás" de Android, que puede cerrar el diálogo igual sin
        // pasar por backdropDismiss — de ahí la red de seguridad en onDidDismiss() de abajo.
        backdropDismiss: false,
        inputs: [{ name: 'numFactura', type: 'text', placeholder: this.transloco.translate('invoices.received.duplicate.numberPlaceholder') }],
        buttons: [
          { text: this.transloco.translate('common.actions.cancel'), role: 'cancel', handler: () => resolve(null) },
          {
            text: this.transloco.translate('invoices.received.duplicate.confirmButton'),
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
      await this.showToast(this.transloco.translate('invoices.received.attachment.downloadSuccess'));
    } catch {
      await this.showToast(this.transloco.translate('invoices.received.attachment.downloadError'), 'danger');
    }
  }

  async compartirAdjunto(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    try {
      const blob = await this.adjuntoABlob(f);
      await compartirBlob(blob, f.documentoNombre || 'documento-adjunto');
    } catch {
      await this.showToast(this.transloco.translate('invoices.received.attachment.shareError'), 'danger');
    }
  }

  async confirmarEliminar(event: Event, f: FacturaRecibida) {
    event.stopPropagation();
    // Defensa en profundidad (el icono ya está oculto por accionesPermitidas(f).eliminar):
    // no tiene sentido dejar borrar desde la app algo marcado como ya pagado, ni una
    // factura ya contabilizada (regla confirmada por el jefe, reunión 2026-08-17) — el
    // backend todavía no impide ninguno de los dos.
    if (f.pagada) {
      await this.showToast(this.transloco.translate('invoices.received.delete.paidError'), 'danger');
      return;
    }
    if (f.accountingLocked) {
      await this.showToast(this.transloco.translate('invoices.received.delete.lockedError'), 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.received.delete.header'),
      message: this.transloco.translate('invoices.received.delete.message', { proveedor: f.proveedor }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('common.actions.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.invoicesRepo.eliminar(f.id);
              await this.refresh();
              await this.showToast(this.transloco.translate('invoices.received.delete.success'));
            } catch (e) {
              await this.showToast(e instanceof Error ? e.message : this.transloco.translate('invoices.received.delete.error'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Duración proporcional al texto (2026-08-28): los avisos del OCR (proveedor genérico,
  // servicio no disponible, duplicado...) son frases largas que con los 3s fijos de antes no
  // daba tiempo a leer. ~60ms por carácter, con un mínimo de 3s y un máximo de 8s para no dejar
  // un toast corto colgado ni uno larguísimo bloqueando la pantalla indefinidamente.
  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const duration = Math.max(3000, Math.min(8000, message.length * 60));
    const toast = await this.toastCtrl.create({ message, duration, position: 'bottom', color });
    await toast.present();
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }

  formatFecha(f: string): string {
    return formatFechaUtil(f);
  }
}
