import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonText, IonChip, IonLabel,
  IonCard, IonCardContent, IonSpinner,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, documentTextOutline, createOutline, trashOutline,
  attachOutline, eyeOutline, copyOutline, downloadOutline, shareSocialOutline,
  warningOutline, checkmarkDoneOutline,
} from 'ionicons/icons';

import {
  AccionesPermitidas, FacturaRecibida, ProveedorMock, IRPF_RATES, IVA_RATES, TotalesFactura,
  ConfiguracionRetencion, calcularTotalesLineas, accionesFacturaRecibida,
} from '../../services/mock-facturas.service';
import { MedioPagoOpcion, ReceivedInvoicesRepository } from '../../core/ports';
import { VerDocumentoComponent } from '../../modals/ver-documento/ver-documento.component';
import { ProveedorSelectorComponent } from '../../modals/proveedor-selector/proveedor-selector.component';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { LineasEditorComponent } from '../../shared/lineas-editor/lineas-editor.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';
import { PagosService } from '../../services/pagos.service';

type FacturaRecibidaForm = Omit<FacturaRecibida, 'id' | 'origenOcr'>;

@Component({
  selector: 'app-factura-recibida-detalle',
  templateUrl: './factura-recibida-detalle.page.html',
  styleUrls: ['./factura-recibida-detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
    IonItem, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonText, IonChip, IonLabel,
    IonCard, IonCardContent, IonSpinner, TranslocoPipe,
    DemoBannerComponent, LineasEditorComponent,
  ],
})
export class FacturaRecibidaDetallePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesRepo = inject(ReceivedInvoicesRepository);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private transloco = inject(TranslocoService);
  private pagosService = inject(PagosService);

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  facturaId: number | null = null;
  esNueva = false;
  errorMsg = '';
  adjuntando = false;
  // Solo tiene valor durante la ventana entre "el usuario adjunta un fichero en una factura
  // TODAVÍA sin guardar" y "guardar() consigue el primer id real" — ver onFileSelected() y
  // guardar(). Fuera de esa ventana, adjuntar ya sube de verdad al momento (facturaId != null).
  private archivoPendienteDeAdjuntar: File | null = null;
  guardando = false;
  cargando = false;
  origenOcr = false;

  irpfRates = IRPF_RATES;
  // Valor por defecto hasta que cargue el catálogo real (obtenerPorcentajesIva) — si la
  // carga falla, se queda con esta lista fija en vez de dejar el desplegable vacío.
  ivaRates = IVA_RATES;
  mediosPago: MedioPagoOpcion[] = [];

  working: FacturaRecibidaForm = this.formularioVacio();

  generarIdLinea = () => this.invoicesRepo.nuevoIdLinea();

  constructor() {
    addIcons({
      arrowBackOutline, documentTextOutline, createOutline, trashOutline,
      attachOutline, eyeOutline, copyOutline, downloadOutline, shareSocialOutline,
      warningOutline, checkmarkDoneOutline,
    });
  }

  async ngOnInit() {
    // En paralelo, sin bloquear la carga de la factura: si tarda o falla, el formulario
    // sigue siendo usable con los valores por defecto (ivaRates) o un desplegable vacío
    // (mediosPago) en vez de quedarse colgado.
    this.cargarCatalogos();

    // BUG real corregido 2026-08-20: cuando se llega aquí desde un fallback de OCR (proveedor
    // no reconocido, o el nuevo borrador desde documento bancario), el fichero real ya existe
    // en memoria en la pantalla anterior — se pasa por el estado de navegación (history.state,
    // ver facturas-recibidas.page.ts) para que guardar() lo pueda subir de verdad a Blob
    // Storage, en vez de quedarse para siempre solo con la vista previa local. history.state
    // (no ActivatedRoute) porque un File no se puede serializar en la URL ni en route data.
    const archivoDesdeNavegacion = history.state?.archivoOriginal;
    if (archivoDesdeNavegacion instanceof File) {
      this.archivoPendienteDeAdjuntar = archivoDesdeNavegacion;
    }

    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      return;
    }

    const id = Number(param);
    this.cargando = true;
    try {
      const factura = await this.invoicesRepo.obtenerPorId(id);
      if (!factura) {
        this.errorMsg = this.transloco.translate('invoices.received.detail.notFound');
        return;
      }

      this.facturaId = id;
      this.origenOcr = factura.origenOcr;
      this.sincronizarWorkingDesde(factura);
    } catch (e: any) {
      this.errorMsg = e?.message ?? this.transloco.translate('invoices.received.detail.loadError');
    } finally {
      this.cargando = false;
    }
  }

  private async cargarCatalogos() {
    try {
      this.mediosPago = await this.invoicesRepo.obtenerMediosPago();
    } catch {
      // El desplegable de forma de pago queda vacío — no bloquea ver/editar la factura.
    }
    try {
      const porcentajes = await this.invoicesRepo.obtenerPorcentajesIva();
      if (porcentajes.length > 0) this.ivaRates = porcentajes;
    } catch {
      // Se mantiene IVA_RATES como valor por defecto.
    }
  }

  private formularioVacio(): FacturaRecibidaForm {
    return {
      proveedor: '', proveedorNif: '', numFactura: '',
      fecha: new Date().toISOString().slice(0, 10), vencimiento: '',
      concepto: '', formaPago: '',
      lineas: [],
      retencionPct: 0,
      // BUG real corregido 2026-08-18: 'revisada' aquí hacía que TODA factura manual nueva
      // naciera ya Contabilizada de verdad en el backend nada más pulsar Guardar la primera
      // vez — antes pasaba menos desapercibido porque el desplegable de Estado dejaba
      // corregirlo a mano; desde que es de solo lectura (botón "Contabilizar" dedicado), ya
      // no hay forma de evitarlo. Una factura nueva siempre debe nacer en Borrador.
      pagada: false, estado: 'borrador',
    };
  }

  // accountingLocked lo deriva HttpReceivedInvoicesRepository a partir del estado real
  // (132/'revisada' = contabilizada = bloqueada; 131/'borrador' se puede reeditar y volver
  // a guardar con garantías, ver mapearCabecera/mapearLinea).
  get esEditable(): boolean {
    return this.esNueva || !this.working.accountingLocked;
  }

  // 'pagada' solo se puede marcar/desmarcar al dar de alta una factura nueva — una vez que
  // ya es real (recién guardada esta sesión, o leída del backend), cambiarla aquí sería
  // fingir un cambio de estado de pago sin ningún movimiento contable real detrás (fuera de
  // alcance de esta app: pagos vía agt_caja). Se muestra como dato de solo lectura.
  get pagadaEditable(): boolean {
    return this.esNueva;
  }

  // Igual patrón que en Emitidas: "working" es un formulario (sin id) mientras no se
  // guarda, pero aquí la política depende de accountingLocked, no de id/origenOcr —
  // basta con completarlos con un valor cualquiera para reutilizar la misma función
  // pura que usa el repositorio.
  accionesPermitidas(): AccionesPermitidas {
    if (this.esNueva) return { editar: true, eliminar: false, copiar: false, descargar: false, compartir: false };
    return accionesFacturaRecibida({ ...this.working, id: this.facturaId ?? 0, origenOcr: this.origenOcr });
  }

  async duplicar() {
    if (this.facturaId == null) return;
    const numFacturaNueva = await this.pedirNumeroFacturaCopia();
    if (numFacturaNueva == null) return; // cancelado en el diálogo

    try {
      // Objeto completo, no solo el id — mismo motivo que accionesPermitidas() unas líneas
      // arriba: el repositorio ya no busca la factura en ningún almacén propio, la recibe
      // tal cual (bug real corregido el 2026-08-13: antes fallaba en silencio al duplicar
      // una factura real del backend, porque esas nunca están en el almacén del mock).
      const copia = await this.invoicesRepo.duplicar({ ...this.working, id: this.facturaId, origenOcr: this.origenOcr }, numFacturaNueva);
      await this.showToast(this.transloco.translate('invoices.received.duplicate.success', { proveedor: this.working.proveedor }));
      this.router.navigate(['/app/recibidas', copia.id], { replaceUrl: true });
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.received.duplicate.error'), 'danger');
    }
  }

  // "Copiar" guarda ya de verdad en el backend (2026-08-17, ver ReceivedInvoicesRepository.
  // duplicar) — Guardar exige un número de factura no vacío, y la copia nunca hereda el del
  // original (sería un número repetido), así que hace falta pedirlo antes de nada. Devuelve
  // null si el usuario cancela.
  private pedirNumeroFacturaCopia(): Promise<string | null> {
    return new Promise(resolve => {
      this.alertCtrl.create({
        header: this.transloco.translate('invoices.received.duplicate.numberDialogHeader'),
        message: this.transloco.translate('invoices.received.duplicate.numberDialogMessage', { proveedor: this.working.proveedor }),
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

  // Corregido 2026-08-19: fetch(documentoUrl) directo dejó de valer en cuanto el documento
  // pasó a vivir en un endpoint protegido (Bearer) en vez de una URL de Blob abierta —
  // obtenerBlobDocumento() decide él mismo si sigue siendo una vista previa local o hay que
  // pedirlo de verdad al backend (mismo fix que ya tiene facturas-recibidas.page.ts).
  private async adjuntoABlob(): Promise<Blob> {
    return this.invoicesRepo.obtenerBlobDocumento(this.working.documentoUrl!);
  }

  async descargarAdjunto() {
    try {
      const blob = await this.adjuntoABlob();
      descargarBlob(blob, this.working.documentoNombre || 'documento-adjunto');
      await this.showToast(this.transloco.translate('invoices.received.attachment.downloadSuccess'));
    } catch {
      await this.showToast(this.transloco.translate('invoices.received.attachment.downloadError'), 'danger');
    }
  }

  async compartirAdjunto() {
    try {
      const blob = await this.adjuntoABlob();
      await compartirBlob(blob, this.working.documentoNombre || 'documento-adjunto');
    } catch {
      await this.showToast(this.transloco.translate('invoices.received.attachment.shareError'), 'danger');
    }
  }

  // Pedido explícito (reunión 2026-08-28): los totales guardados en BBDD (working.
  // totalesReales) se muestran TAL CUAL mientras no se toque ninguna línea, sin importar si
  // la factura sigue editable o no — antes, cualquier borrador editable recalculaba en vivo
  // en cada repintado, así que un documento real cuyas líneas redondean de forma distinta a
  // como las recalculamos aquí (ej. Leroy Merlin) siempre mostraba unos céntimos de
  // diferencia frente al total real de la factura, aunque el usuario no hubiera tocado nada.
  //
  // 'lineasSnapshot' es la foto de 'lineas' tal como estaban al cargar/guardar por última
  // vez (ver fijarSnapshotLineas, llamado desde sincronizarWorkingDesde) — si difiere de las
  // líneas actuales, es que el usuario añadió, quitó o modificó una línea desde entonces, y
  // ESO es lo único que debe forzar un recálculo (igual que un total editado a mano queda
  // obsoleto en cuanto cambian las líneas de las que salió).
  private lineasSnapshot = '';

  private fijarSnapshotLineas() {
    this.lineasSnapshot = JSON.stringify(this.working.lineas);
  }

  totales(): TotalesFactura {
    const snapshotActual = JSON.stringify(this.working.lineas);
    if (snapshotActual !== this.lineasSnapshot) {
      this.working.totalesReales = undefined;
      this.lineasSnapshot = snapshotActual;
    }
    if (this.working.totalesReales) return this.working.totalesReales;

    const cfg: ConfiguracionRetencion = {
      aplicable: this.working.retencionPct > 0,
      tipoCodigo: 'recibida',
      etiqueta: this.transloco.translate('common.withholdingLabel'),
      porcentaje: this.working.retencionPct,
    };
    return calcularTotalesLineas(this.working.lineas, cfg);
  }

  // Edición manual del total final: cuando el documento original redondea sus líneas de
  // forma distinta a como las recalculamos (el caso real que motivó esto: una factura de
  // Leroy Merlin con céntimos de diferencia), el usuario corrige aquí el total para que
  // coincida con la factura real. Se congela también el snapshot de líneas actuales para que
  // este valor no se pierda en el siguiente repintado (ver totales()) — solo se descarta si
  // de verdad se vuelve a tocar una línea.
  actualizarTotalManual(valorCrudo: string | number | null | undefined) {
    const nuevoTotal = Number(valorCrudo);
    if (!isFinite(nuevoTotal)) return;
    const actual = this.totales();
    this.working.totalesReales = { ...actual, total: Math.round(nuevoTotal * 100) / 100 };
    this.fijarSnapshotLineas();
  }

  // La retención cambia el total igual que una línea — un total guardado o corregido a mano
  // ya no sería válido si se cambia el % después, así que fuerza el mismo recálculo en vivo.
  retencionCambiada() {
    this.working.totalesReales = undefined;
  }

  async elegirProveedor() {
    // Cuando el proveedor viene de un escaneo sin reconocer (ver el fallback a crearDesdeOcr
    // en facturas-recibidas.page.ts), 'working' ya trae nombre/NIF/dirección extraídos por
    // el OCR aunque no tenga idProveedor todavía — se le pasan al selector para que el alta
    // rápida empiece precargada en vez de que el usuario tenga que teclearlo todo de cero.
    const datosIniciales = !this.working.idProveedor
      ? {
          nombre: this.working.proveedor,
          nif: this.working.proveedorNif,
          direccion: this.working.proveedorDireccion,
          poblacion: this.working.proveedorPoblacion,
          cp: this.working.proveedorCp,
          provincia: this.working.proveedorProvincia,
        }
      : undefined;

    const modal = await this.modalCtrl.create({
      component: ProveedorSelectorComponent,
      componentProps: { datosIniciales },
    });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    const p: ProveedorMock = data;
    this.working.proveedor = p.nombre;
    this.working.proveedorNif = p.nif;
    this.working.proveedorDireccion = p.direccion;
    this.working.proveedorPoblacion = p.poblacion;
    this.working.proveedorCp = p.cp;
    this.working.proveedorProvincia = p.provincia;
    // Tanto una búsqueda real (POST /api/Proveedores/Enumerar) como un alta rápida
    // (POST /api/Proveedores/Crear) devuelven ahora un id real del backend.
    this.working.idProveedor = p.id;
  }

  triggerAdjuntar() {
    this.fileInput?.nativeElement.click();
  }

  // Mismo límite que el backend (RequestSizeLimit en FacturasRecibidasController.
  // AdjuntarDocumento) — mismo criterio que facturas-recibidas.page.ts.
  private static readonly TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > FacturaRecibidaDetallePage.TAMANO_MAXIMO_BYTES) {
      await this.showToast(this.transloco.translate('ocr.fileTooLarge'), 'danger');
      return;
    }

    this.adjuntando = true;
    try {
      if (this.facturaId != null) {
        // Factura ya real (editando una existente, o ya se guardó al menos una vez) —
        // sube de verdad a Blob Storage, no hace falta esperar a un guardado posterior.
        const { documentoUrl, documentoNombre } = await this.invoicesRepo.adjuntarDocumentoAFactura(this.facturaId, file);
        this.working.documentoUrl = documentoUrl;
        this.working.documentoNombre = documentoNombre;
        this.archivoPendienteDeAdjuntar = null;
      } else {
        // Alta nueva, todavía sin id real — solo vista previa local; guardar() sube el
        // fichero de verdad en cuanto exista un id.
        const { documentoUrl, documentoNombre } = await this.invoicesRepo.adjuntarDocumento(file);
        this.working.documentoUrl = documentoUrl;
        this.working.documentoNombre = documentoNombre;
        this.archivoPendienteDeAdjuntar = file;
      }
    } catch (e: any) {
      if (this.esCreditosAgotados(e)) {
        await this.mostrarAvisoCreditosAgotados();
        return;
      }
      // Fallo real encontrado en auditoría 2026-08-31: el backend puede devolver HTTP 409
      // OPERATION_IN_PROGRESS (mismo fichero ya en curso de adjuntar) y antes caía al mensaje
      // genérico, mostrando el JSON crudo del body en el toast.
      if (this.esOperacionEnCurso(e)) {
        await this.showToast(this.transloco.translate('ocr.operationInProgress'), 'danger');
        return;
      }
      // BUG real encontrado en auditoría 2026-08-14: sin este catch, un fichero no legible
      // (corrupto, formato raro) dejaba desaparecer el spinner sin ningún aviso — el usuario
      // no se enteraba de que el adjunto había fallado.
      await this.showToast(e?.message ?? this.transloco.translate('invoices.received.detail.attachError'), 'danger');
    } finally {
      this.adjuntando = false;
    }
  }

  // Backend: FacturasRecibidasController devuelve HTTP 402 con code: "OCR_CREDITS_EXHAUSTED"
  // cuando la empresa está sujeta a control de créditos (ver PagosOptions.
  // EmpresasControlCreditos) y no le queda saldo. El 402 basta por sí solo para
  // identificarlo — a día de hoy es el único caso que lo usa.
  private esCreditosAgotados(e: unknown): boolean {
    return e instanceof Error && /^HTTP 402\b/.test(e.message);
  }

  // Backend: 409 con code: "OPERATION_IN_PROGRESS" cuando ya hay una reserva de crédito activa
  // para este mismo fichero (clave de idempotencia = hash del contenido, ver
  // FacturasRecibidasController.AdjuntarDocumento/ClaveIdempotenciaArchivoAsync) — por código
  // estable, nunca por el texto en español del mensaje.
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

  // Corregido 2026-08-19: documentoUrl ya no es siempre una URL abierta que un <img> pueda
  // cargar directamente — para una factura real es la ruta de un endpoint protegido (Bearer).
  // obtenerBlobDocumento() decide cuál de los dos casos es; aquí solo hace falta convertir el
  // Blob resultante en un object URL temporal si hizo falta pedirlo de verdad, y liberarlo al
  // cerrar el modal para no acumular memoria.
  async verDocumento() {
    if (!this.working.documentoUrl) return;

    let urlParaMostrar = this.working.documentoUrl;
    let urlTemporal: string | null = null;
    // 'data:<mime>;base64,...' — el tipo va siempre en la propia URL cuando es una vista
    // previa local; para el caso real se toma del blob que devuelve el backend.
    let tipo = urlParaMostrar.startsWith('data:') ? urlParaMostrar.slice(5, urlParaMostrar.indexOf(';')) : '';

    try {
      if (!urlParaMostrar.startsWith('data:')) {
        const blob = await this.invoicesRepo.obtenerBlobDocumento(urlParaMostrar);
        tipo = blob.type;
        urlTemporal = URL.createObjectURL(blob);
        urlParaMostrar = urlTemporal;
      }

      const modal = await this.modalCtrl.create({
        component: VerDocumentoComponent,
        componentProps: { url: urlParaMostrar, nombre: this.working.documentoNombre, tipo },
      });
      await modal.present();
      await modal.onWillDismiss();
    } catch {
      await this.showToast(this.transloco.translate('invoices.received.detail.viewDocumentError'), 'danger');
    } finally {
      // Aunque falle la creación/presentación del modal justo después de haber pedido el
      // blob, la URL temporal no debe quedar filtrada.
      if (urlTemporal) URL.revokeObjectURL(urlTemporal);
    }
  }

  // Además de fijar errorMsg (para el aviso rojo fijo bajo la cabecera), lo muestra también
  // como toast — encontrado en revisión 2026-08-18: si el usuario está desplazado más abajo
  // (viendo las líneas, por ejemplo) al pulsar "Guardar", el aviso fijo queda fuera de la
  // vista y pierde el mensaje por completo hasta que vuelve a subir manualmente.
  private async mostrarError(mensaje: string) {
    this.errorMsg = mensaje;
    await this.showToast(mensaje, 'danger');
  }

  async guardar() {
    if (this.guardando) return;

    this.errorMsg = '';
    if (!this.working.proveedor.trim() || !this.working.numFactura.trim()) {
      await this.mostrarError(this.transloco.translate('invoices.received.detail.validationRequired'));
      return;
    }
    if (!this.working.idProveedor) {
      await this.mostrarError(this.transloco.translate('invoices.received.detail.validationSupplier'));
      return;
    }

    this.guardando = true;
    try {
      if (this.esNueva) {
        const creada = await this.invoicesRepo.crearManual(this.working);
        this.facturaId = creada.id;
        this.esNueva = false;
        this.sincronizarWorkingDesde(creada);
        await this.subirAdjuntoPendienteSiHaceFalta(creada.id);
      } else if (this.facturaId != null) {
        // actualizar() puede devolver un id distinto: la primera vez que se guarda de
        // verdad una factura que solo existía como borrador local, siempre hace un INSERT
        // en el backend (ver nota en HttpReceivedInvoicesRepository.guardarReal), así que
        // el id local anterior deja de ser válido.
        const guardada = await this.invoicesRepo.actualizar(this.facturaId, this.working);
        this.facturaId = guardada.id;
        this.sincronizarWorkingDesde(guardada);
        // BUG real corregido 2026-08-20: este branch (borrador YA con un id local — ej. el
        // fallback de proveedor no reconocido, o el nuevo borrador desde documento bancario)
        // nunca subía el adjunto pendiente — solo el branch de "esNueva" lo hacía. El fichero
        // real llega aquí por el estado de navegación (ver ngOnInit), no por onFileSelected,
        // así que sin esto se quedaba para siempre como vista previa local aunque la factura
        // ya se guardara de verdad.
        await this.subirAdjuntoPendienteSiHaceFalta(guardada.id);
      }

      await this.showToast(this.transloco.translate('invoices.received.detail.saveSuccess'));
    } catch (e) {
      await this.mostrarError(e instanceof Error ? e.message : this.transloco.translate('invoices.received.detail.saveError'));
    } finally {
      this.guardando = false;
    }
  }

  // Compartido por los dos caminos de guardar() que pueden dejar un adjunto pendiente de
  // verdad (alta nueva, y un borrador que ya tenía id local — ver el comentario en guardar()).
  private async subirAdjuntoPendienteSiHaceFalta(idFacturaReal: number) {
    if (!this.archivoPendienteDeAdjuntar) return;
    try {
      const { documentoUrl, documentoNombre } = await this.invoicesRepo.adjuntarDocumentoAFactura(idFacturaReal, this.archivoPendienteDeAdjuntar);
      this.working.documentoUrl = documentoUrl;
      this.working.documentoNombre = documentoNombre;
    } catch (e) {
      // La factura ya se guardó bien — no se deshace por esto, solo se avisa: el documento
      // se queda solo en la vista previa local de esta sesión.
      if (this.esCreditosAgotados(e)) {
        await this.mostrarAvisoCreditosAgotados();
      } else {
        await this.showToast(this.transloco.translate('invoices.received.detail.attachAfterSaveError'), 'danger');
      }
    } finally {
      this.archivoPendienteDeAdjuntar = null;
    }
  }

  // BUG real corregido 2026-08-18: guardar() nunca actualizaba 'working' con la respuesta
  // real del servidor — así que idLineaBackend, totalesReales y accountingLocked se
  // quedaban siempre con los valores locales (vacíos/desactualizados). El efecto práctico:
  // al reguardar una factura tras un primer guardado, ninguna línea llevaba ya su
  // idLineaBackend real, así que GuardarAsync no las reconocía como "ya existentes" y las
  // borraba y recreaba todas de cero en cada guardado — no se perdían datos, pero generaba
  // basura en la base de datos sin necesidad. Mismo patrón que ya usaba ngOnInit() al cargar
  // una factura existente.
  private sincronizarWorkingDesde(factura: FacturaRecibida) {
    const { id: _id, origenOcr: _ocr, ...resto } = factura;
    this.working = resto;
    // La factura recién cargada/guardada es el nuevo punto de partida — sus líneas todavía
    // no se han tocado en esta sesión, así que totales() debe mostrar el total guardado
    // (working.totalesReales) tal cual, no recalcularlo (ver totales()).
    this.fijarSnapshotLineas();
  }

  // Pedido por el jefe en reunión 2026-08-17: "Contabilizar" debe ser una acción propia y
  // aislada — solo cambia el estado de 131 a 132, nada más — igual que en Facturas Emitidas,
  // en vez de ser una opción más dentro del desplegable de Estado que se guardaba junto con
  // cualquier otro cambio del formulario. Reutiliza el mismo POST Guardar real (no hay un
  // endpoint aparte para "solo cambiar estado"), pero el usuario nunca lo ve como una edición
  // más: es un paso explícito y confirmado, y tras aceptar la factura queda bloqueada para
  // editar (esEditable pasa a depender de accountingLocked, que ahora vendrá en true).
  async confirmarContabilizar() {
    if (this.esNueva || this.facturaId == null || !this.esEditable) return;

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.received.post.header'),
      message: this.transloco.translate('invoices.received.post.message', { num: this.working.numFactura, proveedor: this.working.proveedor, importe: this.formatEuros(this.totales().total) }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.received.actions.post'),
          handler: async () => {
            try {
              const guardada = await this.invoicesRepo.actualizar(this.facturaId!, { ...this.working, estado: 'revisada' });
              this.facturaId = guardada.id;
              this.sincronizarWorkingDesde(guardada);
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

  async confirmarEliminar() {
    if (this.facturaId == null) return;
    // Defensa en profundidad (el botón ya está oculto por accionesPermitidas().eliminar):
    // no tiene sentido dejar borrar desde la app algo marcado como ya pagado (sin ningún
    // movimiento contable real detrás) ni una factura ya contabilizada (regla confirmada
    // por el jefe, reunión 2026-08-17) — el backend todavía no impide ninguno de los dos.
    if (this.working.pagada) {
      await this.showToast(this.transloco.translate('invoices.received.delete.paidError'), 'danger');
      return;
    }
    if (this.working.accountingLocked) {
      await this.showToast(this.transloco.translate('invoices.received.delete.lockedError'), 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.received.delete.header'),
      message: this.transloco.translate('invoices.received.delete.messageWithNumber', { num: this.working.numFactura, proveedor: this.working.proveedor }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('common.actions.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.invoicesRepo.eliminar(this.facturaId!);
              await this.showToast(this.transloco.translate('invoices.received.delete.success'));
              this.volver();
            } catch (e) {
              await this.showToast(e instanceof Error ? e.message : this.transloco.translate('invoices.received.delete.error'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Duración proporcional al texto (2026-08-28) — mismo criterio que facturas-recibidas.page.ts.
  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const duration = Math.max(3000, Math.min(8000, message.length * 60));
    const toast = await this.toastCtrl.create({ message, duration, position: 'bottom', color });
    await toast.present();
  }

  volver() {
    this.router.navigateByUrl('/app/recibidas', { replaceUrl: true });
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }
}
