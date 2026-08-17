import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';

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
    IonCard, IonCardContent, IonSpinner,
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

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  facturaId: number | null = null;
  esNueva = false;
  errorMsg = '';
  adjuntando = false;
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
        this.errorMsg = 'Factura no encontrada.';
        return;
      }

      this.facturaId = id;
      this.origenOcr = factura.origenOcr;
      const { id: _id, origenOcr: _ocr, ...resto } = factura;
      this.working = { ...resto };
    } catch (e: any) {
      this.errorMsg = e?.message ?? 'No se pudo cargar la factura.';
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
      pagada: false, estado: 'revisada',
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
      await this.showToast(`Copia guardada a partir de la factura de ${this.working.proveedor}.`);
      this.router.navigate(['/app/recibidas', copia.id], { replaceUrl: true });
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo copiar la factura.', 'danger');
    }
  }

  // "Copiar" guarda ya de verdad en el backend (2026-08-17, ver ReceivedInvoicesRepository.
  // duplicar) — Guardar exige un número de factura no vacío, y la copia nunca hereda el del
  // original (sería un número repetido), así que hace falta pedirlo antes de nada. Devuelve
  // null si el usuario cancela.
  private pedirNumeroFacturaCopia(): Promise<string | null> {
    return new Promise(resolve => {
      this.alertCtrl.create({
        header: 'Número de la nueva factura',
        message: `Se copiará la factura de ${this.working.proveedor} (proveedor, líneas, importes...) y se guardará directamente. El resto de datos se pueden ajustar después.`,
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
      }).then(alert => alert.present());
    });
  }

  private async adjuntoABlob(): Promise<Blob> {
    const respuesta = await fetch(this.working.documentoUrl!);
    return respuesta.blob();
  }

  async descargarAdjunto() {
    try {
      const blob = await this.adjuntoABlob();
      descargarBlob(blob, this.working.documentoNombre || 'documento-adjunto');
      await this.showToast('Documento descargado.');
    } catch {
      await this.showToast('No se pudo descargar el documento.', 'danger');
    }
  }

  async compartirAdjunto() {
    try {
      const blob = await this.adjuntoABlob();
      await compartirBlob(blob, this.working.documentoNombre || 'documento-adjunto');
    } catch {
      await this.showToast('No se pudo compartir el documento.', 'danger');
    }
  }

  // Previsualización local con la misma fórmula que usa el mock/backend
  // (calcularTotalesLineas) — el guardado no envía este cálculo, solo las líneas y
  // el % de retención; el total definitivo lo sigue calculando el repositorio/backend.
  //
  // Si la factura viene del backend real Y no es editable ahora mismo (working.totalesReales,
  // solo mientras esté bloqueada), se muestran esos importes oficiales tal cual en vez de
  // recalcular. En cuanto es editable (borrador real desbloqueado, o cualquier borrador
  // local), se recalcula en vivo desde 'lineas' — el ivaPct de cada línea ya es fiable
  // (reconstruido desde idImpuesto al leerla, ver mapearLinea), así que si el usuario edita
  // una línea, el total mostrado tiene que reflejarlo al momento, no quedarse congelado con
  // el valor de cuando se abrió la factura.
  totales(): TotalesFactura {
    if (this.working.totalesReales && !this.esEditable) return this.working.totalesReales;

    const cfg: ConfiguracionRetencion = {
      aplicable: this.working.retencionPct > 0,
      tipoCodigo: 'recibida',
      etiqueta: 'Retención',
      porcentaje: this.working.retencionPct,
    };
    return calcularTotalesLineas(this.working.lineas, cfg);
  }

  async elegirProveedor() {
    const modal = await this.modalCtrl.create({ component: ProveedorSelectorComponent });
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

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.adjuntando = true;
    try {
      const { documentoUrl, documentoNombre } = await this.invoicesRepo.adjuntarDocumento(file);
      this.working.documentoUrl = documentoUrl;
      this.working.documentoNombre = documentoNombre;
    } catch (e: any) {
      // BUG real encontrado en auditoría 2026-08-14: sin este catch, un fichero no legible
      // (corrupto, formato raro) dejaba desaparecer el spinner sin ningún aviso — el usuario
      // no se enteraba de que el adjunto había fallado.
      await this.showToast(e?.message ?? 'No se pudo adjuntar el documento. Inténtalo de nuevo.', 'danger');
    } finally {
      this.adjuntando = false;
    }
  }

  async verDocumento() {
    if (!this.working.documentoUrl) return;
    const modal = await this.modalCtrl.create({
      component: VerDocumentoComponent,
      componentProps: { url: this.working.documentoUrl, nombre: this.working.documentoNombre },
    });
    await modal.present();
  }

  async guardar() {
    if (this.guardando) return;

    this.errorMsg = '';
    if (!this.working.proveedor.trim() || !this.working.numFactura.trim()) {
      this.errorMsg = 'Proveedor y número de factura son obligatorios.';
      return;
    }
    if (!this.working.idProveedor) {
      this.errorMsg = 'Selecciona el proveedor de la lista (o créalo) antes de guardar.';
      return;
    }

    this.guardando = true;
    try {
      if (this.esNueva) {
        const creada = await this.invoicesRepo.crearManual(this.working);
        this.facturaId = creada.id;
        this.esNueva = false;
      } else if (this.facturaId != null) {
        // actualizar() puede devolver un id distinto: la primera vez que se guarda de
        // verdad una factura que solo existía como borrador local, siempre hace un INSERT
        // en el backend (ver nota en HttpReceivedInvoicesRepository.guardarReal), así que
        // el id local anterior deja de ser válido.
        const guardada = await this.invoicesRepo.actualizar(this.facturaId, this.working);
        this.facturaId = guardada.id;
      }

      await this.showToast('Factura guardada.');
    } catch (e) {
      this.errorMsg = e instanceof Error ? e.message : 'No se pudo guardar la factura.';
    } finally {
      this.guardando = false;
    }
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
      header: 'Contabilizar factura',
      message: `¿Contabilizar la factura ${this.working.numFactura} de ${this.working.proveedor} por ${this.formatEuros(this.totales().total)}? Quedará bloqueada para editar — solo podrá eliminarse (si corresponde) o gestionarse desde analítica/pagos.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            try {
              const guardada = await this.invoicesRepo.actualizar(this.facturaId!, { ...this.working, estado: 'revisada' });
              this.working = guardada;
              this.facturaId = guardada.id;
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

  async confirmarEliminar() {
    if (this.facturaId == null) return;
    // Protección conservadora en el front (el backend todavía no lo impide, ver
    // AUDITORIA_INTEGRACION_BACKEND.md): no tiene sentido dejar borrar desde la app algo
    // marcado como ya pagado sin ningún movimiento contable real detrás.
    if (this.working.pagada) {
      await this.showToast('No se puede eliminar una factura marcada como pagada.', 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar factura',
      message: `¿Eliminar la factura ${this.working.numFactura} de ${this.working.proveedor}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.invoicesRepo.eliminar(this.facturaId!);
              await this.showToast('Factura eliminada.');
              this.volver();
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
    const toast = await this.toastCtrl.create({ message, duration: 2000, position: 'bottom', color });
    await toast.present();
  }

  volver() {
    this.router.navigateByUrl('/app/recibidas', { replaceUrl: true });
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }
}
