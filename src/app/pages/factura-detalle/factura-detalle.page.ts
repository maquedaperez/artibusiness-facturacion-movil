import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge,
  IonCard, IonCardContent, IonSpinner,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, personCircleOutline, documentTextOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline,
} from 'ionicons/icons';

import {
  AccionesPermitidas, FacturaEmitida, Destinatario, Numerador,
  IVA_RATES, MEDIO_PAGO_OPTIONS,
} from '../../services/mock-facturas.service';
import { IssuedInvoicesRepository, MedioPagoOpcion } from '../../core/ports';
import { ClienteSelectorComponent, SeleccionCliente } from '../../modals/cliente-selector/cliente-selector.component';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';
import { LineasEditorComponent } from '../../shared/lineas-editor/lineas-editor.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';

@Component({
  selector: 'app-factura-detalle',
  templateUrl: './factura-detalle.page.html',
  styleUrls: ['./factura-detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
    IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge,
    IonCard, IonCardContent, IonSpinner,
    DemoBannerComponent, LineasEditorComponent,
  ],
})
export class FacturaDetallePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  facturaId: number | null = null;
  esNueva = false;
  cargando = true;
  guardando = false;
  // Blindaje Fase 7 (2026-08-21): evita que un doble clic (o una respuesta lenta de la AEAT)
  // dispare dos veces Contabilizar/Firmar para la misma factura — visto en real en los logs
  // de producción, dos peticiones casi simultáneas contabilizando la misma factura.
  procesandoAeat = false;

  numeradores: Numerador[] = [];
  numeradorSeleccionado: number | null = null;
  ivaRates = IVA_RATES;
  // Fase 4 del plan de integración (2026-08-20): {id, label} en vez de string[] — Guardar
  // exige idMedioPago numérico, no basta con la etiqueta. Arranca con el mismo catálogo de
  // ejemplo que ya usa MockIssuedInvoicesRepository.obtenerMediosPago(), por si cargarCatalogos
  // tarda o falla.
  mediosPago: MedioPagoOpcion[] = MEDIO_PAGO_OPTIONS.map((label, i) => ({ id: i + 1, label }));

  working: FacturaEmitida | null = null;
  errorMsg = '';

  constructor() {
    addIcons({
      arrowBackOutline, personCircleOutline, documentTextOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.cargarCatalogos();
    this.numeradores = this.invoicesRepo.getNumeradores();
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      this.numeradorSeleccionado = this.numeradores[0]?.id ?? null;
      this.cargando = false;
      return;
    }

    this.cargarFactura(Number(param));
  }

  // Fase 2 del plan de integración de Emitidas (2026-08-20): obtenerPorId ya es asíncrono
  // (habla con el backend real) — mismo patrón que factura-recibida-detalle.page.ts.
  private async cargarFactura(id: number) {
    try {
      const factura = await this.invoicesRepo.obtenerPorId(id);
      if (!factura) {
        this.errorMsg = 'Factura no encontrada.';
        return;
      }

      this.facturaId = id;
      this.working = structuredClone(factura);
    } catch (e: any) {
      this.errorMsg = e?.message ?? 'No se pudo cargar la factura.';
    } finally {
      this.cargando = false;
    }
  }

  // Fase 1 del plan de integración de Emitidas (2026-08-20): sustituye IVA_RATES/
  // MEDIO_PAGO_OPTIONS hardcodeados por los catálogos reales de la empresa — mismo patrón ya
  // probado en factura-recibida-detalle.page.ts. Si la carga falla, se queda con los valores
  // fijos con los que ya arrancan ivaRates/mediosPago, no bloquea ver/editar la factura.
  // Fase 4 (2026-08-20): añade el catálogo real de numeradores — si esNueva y el numerador
  // preseleccionado (del mock, en ngOnInit) ya no está en la lista real, se reajusta al
  // primero real; si no, un Guardar real fallaría con "el numerador no existe para esta
  // empresa" sin que el usuario haya tocado nada.
  private async cargarCatalogos() {
    try {
      const porcentajes = await this.invoicesRepo.obtenerPorcentajesIva();
      if (porcentajes.length > 0) this.ivaRates = porcentajes;
    } catch {
      // Se mantiene IVA_RATES como valor por defecto.
    }
    try {
      const mediosPago = await this.invoicesRepo.obtenerMediosPago();
      if (mediosPago.length > 0) this.mediosPago = mediosPago;
    } catch {
      // Se mantiene el catálogo de ejemplo como valor por defecto.
    }
    try {
      const numeradores = await this.invoicesRepo.obtenerNumeradores();
      if (numeradores.length > 0) {
        this.numeradores = numeradores;
        if (this.esNueva && !numeradores.some(n => n.id === this.numeradorSeleccionado)) {
          this.numeradorSeleccionado = numeradores[0].id;
        }
      }
    } catch {
      // Se mantienen los numeradores de ejemplo del mock.
    }
  }

  get esEditable(): boolean {
    return this.esNueva || this.working?.estado === 'borrador';
  }

  async elegirCliente() {
    const modal = await this.modalCtrl.create({ component: ClienteSelectorComponent });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    // Blindaje 2026-08-24: crearAdHoc ya crea el cliente de verdad contra el backend
    // (POST /api/Clientes/Crear) — un cliente "nuevo" trae un idCliente REAL igual que uno
    // elegido de la búsqueda, ya no hace falta distinguirlos aquí (antes 'esNuevo' dejaba
    // idCliente en undefined y guardar() lo rechazaba con "no se puede guardar solo con el
    // nombre en texto" — bug real reportado en producción).
    const { cliente } = data as SeleccionCliente;
    const destinatario: Destinatario = cliente;
    const idCliente = cliente.id;

    if (this.esNueva) {
      const numeradorId = this.numeradorSeleccionado ?? this.numeradores[0]?.id;
      if (numeradorId == null) return;
      const creada = this.invoicesRepo.crearBorrador(numeradorId, destinatario);
      this.working = structuredClone(creada);
      this.working.idCliente = idCliente;
      this.facturaId = creada.id;
      this.esNueva = false;
    } else if (this.working) {
      this.working.destinatario = destinatario;
      this.working.idCliente = idCliente;
    }
  }

  // Mantiene medioPago (etiqueta, se sigue mostrando/validando como texto) en sincronía con
  // idMedioPago (el id real que exige Guardar) — ver <ion-select> en el template.
  onMedioPagoChange(id: number) {
    if (!this.working) return;
    this.working.idMedioPago = id;
    this.working.medioPago = this.mediosPago.find(m => m.id === id)?.label ?? this.working.medioPago;
  }

  generarIdLinea = () => this.invoicesRepo.nuevoIdLinea();

  totales() {
    if (!this.working) {
      return {
        base: 0, desgloseIva: [], ivaTotal: 0,
        retencion: { aplicable: false, etiqueta: 'Retención', porcentaje: 0, base: 0, importe: 0 },
        total: 0,
      };
    }
    return this.invoicesRepo.totales(this.working);
  }

  // Fase 4 del plan de integración (2026-08-20): guarda de verdad contra el backend (antes
  // solo mutaba el borrador local) — invoicesRepo.guardar() decide alta vs actualización según
  // si facturaId sigue siendo un id local sin guardar o ya es uno real (ver
  // issued-invoices.repository.http.ts). Si falla (cliente sin idCliente real, IVA sin
  // catálogo, numerador inválido...) el borrador local se queda tal cual: nada se pierde,
  // solo no se ha podido persistir todavía.
  // Devuelve si de verdad se guardó — confirmarContabilizar() no debe simular la
  // contabilización de una factura que en realidad no se ha llegado a persistir.
  async guardar(): Promise<boolean> {
    if (!this.working || this.facturaId == null || this.guardando) return false;

    this.guardando = true;
    try {
      const guardada = await this.invoicesRepo.guardar(this.facturaId, {
        fecha: this.working.fecha,
        vencimiento: this.working.vencimiento,
        concepto: this.working.concepto,
        medioPago: this.working.medioPago,
        idMedioPago: this.working.idMedioPago,
        destinatario: this.working.destinatario,
        lineas: this.working.lineas,
        numeradorId: this.working.numeradorId,
        idCliente: this.working.idCliente,
      });

      this.working = structuredClone(guardada);
      this.facturaId = guardada.id;
      await this.showToast('Factura guardada.');
      return true;
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo guardar la factura.', 'danger');
      return false;
    } finally {
      this.guardando = false;
    }
  }

  // Fase 7 del plan de integración (2026-08-21): contabilizar llama de verdad a FacturaE/AEAT
  // (a través de FacturaEmitidaController.Contabilizar) — deja de ser una simulación. Si el
  // backend responde con error (p. ej. credenciales de FacturaE sin configurar todavía, o un
  // rechazo real de la AEAT), se muestra el motivo y la factura se queda tal cual estaba
  // (el backend no cambia nada si la llamada a FacturaE falla).
  async confirmarContabilizar() {
    if (!this.working || this.facturaId == null || this.procesandoAeat) return;

    // El servidor real rechaza la factura (error AEAT 4102) si el concepto va vacío,
    // y el medio de pago es obligatorio en el modelo — se valida aquí antes de intentarlo.
    if (!this.working.concepto?.trim() || !this.working.medioPago?.trim()) {
      this.errorMsg = 'Concepto y forma de pago son obligatorios para contabilizar.';
      return;
    }
    this.errorMsg = '';

    const alert = await this.alertCtrl.create({
      header: 'Contabilizar factura',
      message: `¿Contabilizar la factura de ${this.working.destinatario.nombre} por ${this.formatEuros(this.totales().total)}? Esto envía la factura a Verifactu/AEAT y ya no se podrá editar. Se guardarán antes los cambios pendientes.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Contabilizar',
          handler: async () => {
            if (this.procesandoAeat) return;
            const guardadoOk = await this.guardar();
            if (!guardadoOk) return; // guardar() ya mostró el motivo del fallo
            this.procesandoAeat = true;
            try {
              this.working = await this.invoicesRepo.contabilizar(this.facturaId!);
              await this.showToast('Factura contabilizada.');
              this.volver();
            } catch (e: any) {
              await this.showToast(e?.message ?? 'No se pudo contabilizar la factura.', 'danger');
            } finally {
              this.procesandoAeat = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarFirmar() {
    if (!this.working || this.facturaId == null || this.procesandoAeat) return;

    const alert = await this.alertCtrl.create({
      header: 'Firmar factura',
      message: `¿Firmar esta factura? Esto genera la firma electrónica (XAdES) real del documento ya registrado en VERI*FACTU.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Firmar',
          handler: async () => {
            if (this.procesandoAeat) return;
            this.procesandoAeat = true;
            try {
              this.working = await this.invoicesRepo.firmar(this.facturaId!);
              await this.showToast('Factura firmada.');
              this.volver();
            } catch (e: any) {
              await this.showToast(e?.message ?? 'No se pudo firmar la factura.', 'danger');
            } finally {
              this.procesandoAeat = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Fase 7 (Anular, 2026-08-22): solo tiene sentido sobre una factura ya contabilizada/firmada
  // (con registro real en VERI*FACTU) y que no esté ya anulada — el backend es quien de verdad
  // decide (ver AnularAsync), esto es solo para no mostrar el botón en casos obviamente inválidos.
  get puedeAnular(): boolean {
    return !!this.working && this.working.estado !== 'borrador' && !this.working.anulada;
  }

  // Fase 7 (Subsanar, 2026-08-24): misma disponibilidad que Anular — ambas exigen un Alta real
  // (estado != borrador) y que la factura no esté ya anulada.
  get puedeSubsanar(): boolean {
    return this.puedeAnular;
  }

  async confirmarAnular() {
    if (!this.working || this.facturaId == null || this.procesandoAeat) return;

    const alert = await this.alertCtrl.create({
      header: 'Anular factura',
      message: `¿Anular la factura ${this.working.numFactura}? Esto crea un registro de anulación real en VERI*FACTU/AEAT. La factura original no se borra ni se modifica, pero queda marcada como anulada.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Anular',
          role: 'destructive',
          handler: async () => {
            if (this.procesandoAeat) return;
            this.procesandoAeat = true;
            try {
              this.working = await this.invoicesRepo.anular(this.facturaId!);
              await this.showToast('Factura anulada.');
            } catch (e: any) {
              await this.showToast(e?.message ?? 'No se pudo anular la factura.', 'danger');
            } finally {
              this.procesandoAeat = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Fase 7 (Subsanar, 2026-08-24): navega a la pantalla dedicada de solo lectura — Subsanar no es
  // un editor, así que no reutiliza este formulario (ver factura-subsanar.page.ts).
  irASubsanar() {
    if (!this.facturaId || !this.puedeSubsanar) return;
    this.router.navigate(['/app/emitidas', this.facturaId, 'subsanar']);
  }

  accionesPermitidas(): AccionesPermitidas {
    if (!this.working) return { editar: false, eliminar: false, copiar: false, descargar: false, compartir: false };
    return this.invoicesRepo.accionesPermitidas(this.working);
  }

  async duplicar() {
    if (!this.working) return;
    try {
      const copia = await this.invoicesRepo.duplicar(this.working.id);
      if (!copia) return;
      await this.showToast(`Borrador ${copia.numFactura} creado a partir de ${this.working.numFactura}.`);
      this.router.navigate(['/app/emitidas', copia.id], { replaceUrl: true });
    } catch (e: any) {
      await this.showToast(e?.message ?? 'No se pudo duplicar la factura.', 'danger');
    }
  }

  async descargar() {
    if (!this.working) return;
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(this.working.id);
      descargarBlob(blob, nombre);
      await this.showToast('Documento descargado (simulado, no válido fiscalmente).');
    } catch {
      await this.showToast('No se pudo generar el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async compartir() {
    if (!this.working) return;
    try {
      const { blob, nombre } = await this.invoicesRepo.generarDocumento(this.working.id);
      await compartirBlob(blob, nombre);
    } catch {
      await this.showToast('No se pudo compartir el documento. Inténtalo de nuevo.', 'danger');
    }
  }

  async confirmarEliminar() {
    if (!this.working) return;
    const f = this.working;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar borrador',
      message: `¿Eliminar el borrador ${f.numFactura} de ${f.destinatario.nombre}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.invoicesRepo.eliminar(f.id);
              await this.showToast('Borrador eliminado.');
              this.volver();
            } catch (e: any) {
              await this.showToast(e?.message ?? 'No se pudo eliminar la factura.', 'danger');
            }
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

  volver() {
    const estado = this.working?.estado ?? 'borrador';
    this.router.navigate(['/app/emitidas'], { queryParams: { estado }, replaceUrl: true });
  }

  estadoAeatLabel(): string {
    return this.working ? this.invoicesRepo.estadoAeatLabel(this.working.estadoAeat) : '—';
  }

  estadoSubsanacionLabel(): string {
    return this.invoicesRepo.estadoSubsanacionLabel(this.working?.estadoSubsanacion);
  }

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }
}
