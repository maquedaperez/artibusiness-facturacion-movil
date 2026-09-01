import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonFooter,
  IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonBadge,
  IonCard, IonCardContent, IonSpinner,
  ModalController, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, personCircleOutline, documentTextOutline,
  copyOutline, downloadOutline, shareSocialOutline, trashOutline, receiptOutline,
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
    CommonModule, FormsModule, TranslocoPipe,
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
  private transloco = inject(TranslocoService);

  facturaId: number | null = null;
  esNueva = false;
  // Facturas simplificadas emitidas (MVP, 2026-08-31): activado por el query param
  // ?simplificada=1 que manda facturas-emitidas.page.ts al crear desde "Factura simplificada" —
  // solo tiene efecto mientras esNueva (una factura ya guardada trae su propio
  // working.esSimplificada, que nunca cambia de tipo fiscal tras crearse).
  esSimplificada = false;
  // Bug real corregido (2026-08-31): true cuando, en modo simplificado, el catálogo real de
  // numeradores no tiene ninguna serie FS — antes se caía en silencio a cualquier otro
  // numerador (p. ej. uno de facturas completas). Ver cargarCatalogos().
  serieSimplificadaNoConfigurada = false;
  cargando = true;
  guardando = false;
  // Blindaje Fase 7 (2026-08-21), separado en una bandera por acción (2026-09-02): antes
  // 'procesandoAeat' era una única bandera compartida entre Contabilizar/Firmar/Anular/Cobrar —
  // bug real encontrado en revisión: en 'contabilizada' (Firmar+Anular visibles a la vez) y en
  // 'borrador' (Cobrar+Contabilizar visibles a la vez), pulsar uno hacía que el OTRO botón
  // también mostrara su spinner y su propio texto "...ando", aunque no fuera el que se estaba
  // ejecutando de verdad. Cada acción tiene ahora su propia bandera (para el spinner/texto
  // correcto); algoEnCurso() sigue bloqueando cualquier acción mientras otra esté en vuelo
  // (misma protección de fondo contra doble clic que había antes).
  contabilizando = false;
  firmando = false;
  anulando = false;
  marcandoCobrado = false;

  get algoEnCurso(): boolean {
    return this.contabilizando || this.firmando || this.anulando || this.marcandoCobrado;
  }

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

  // Facturas simplificadas emitidas (MVP, 2026-08-31): correo para el envío/reenvío del PDF —
  // ver enviarPorCorreo() y la tarjeta de correo en el template.
  emailEnvio = '';
  enviandoCorreo = false;
  // Límite legal de una factura simplificada (400 € IVA incluido) — mismo valor por defecto
  // que FacturasSimplificadasOptions.ImporteMaximo en el backend, que es quien de verdad lo
  // valida siempre (clarificación #7: configurable y validado SIEMPRE en backend). Aquí solo
  // se usa para avisar antes de intentar guardar/contabilizar, nunca como única validación.
  readonly limiteSimplificada = 400;

  // Cobro de tickets/facturas emitidas (Fase 2, 2026-09-02): catálogo fijo de medios manuales —
  // coincide exactamente con lo que valida el backend (FacturacionFacturasEmitidasCobros.Medio).
  readonly MEDIOS_COBRO = ['EFECTIVO', 'TRANSFERENCIA', 'TPV_EXTERNA', 'TARJETA', 'BIZUM'];

  constructor() {
    addIcons({
      arrowBackOutline, personCircleOutline, documentTextOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline, receiptOutline,
    });
  }

  ngOnInit() {
    this.cargarCatalogos();
    this.numeradores = this.invoicesRepo.getNumeradores();
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      this.esSimplificada = this.route.snapshot.queryParamMap.get('simplificada') === '1';
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
        this.errorMsg = this.transloco.translate('invoices.issued.detail.notFound');
        return;
      }

      this.facturaId = id;
      this.working = structuredClone(factura);
      this.emailEnvio = factura.emailUltimoEnvio ?? '';
    } catch (e: any) {
      this.errorMsg = e?.message ?? this.transloco.translate('invoices.issued.detail.loadError');
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
        if (this.esNueva) {
          // Facturas simplificadas emitidas: Nombre es literalmente la Serie del numerador
          // (ver FacturaEmitidaService.ObtenerNumeradoresAsync), así que "FS" identifica la
          // serie configurada en FacturasSimplificadas:Serie sin necesidad de un endpoint
          // propio de configuración. Bug real corregido (2026-08-31): si la serie FS todavía
          // no existe para la empresa, ANTES se caía al numerador[0] cualquiera (p. ej. "FAR"),
          // dejando preseleccionado —y elegible en el desplegable— un numerador de facturas
          // completas para una simplificada. Ahora, en modo simplificado, solo se preselecciona
          // (y solo se puede elegir) un numerador de serie FS; si no existe ninguno, se deja sin
          // seleccionar y se avisa en vez de asumir cualquier otro.
          if (this.esSimplificada) {
            const serieFS = numeradores.find(n => n.nombre?.trim().toUpperCase() === 'FS');
            this.numeradorSeleccionado = serieFS?.id ?? null;
            this.serieSimplificadaNoConfigurada = !serieFS;
          } else if (!numeradores.some(n => n.id === this.numeradorSeleccionado)) {
            this.numeradorSeleccionado = numeradores[0].id;
          }
        }
      }
    } catch {
      // Se mantienen los numeradores de ejemplo del mock.
    }
  }

  // Facturas simplificadas emitidas: en modo simplificado, el selector de serie del paso
  // inicial SOLO debe ofrecer la serie configurada (FS) — nunca un numerador de facturas
  // completas (ver el bug real corregido arriba). Para una factura completa, se sigue
  // ofreciendo el catálogo completo, sin cambios.
  get numeradoresParaElPasoInicial(): Numerador[] {
    if (!this.esSimplificada) return this.numeradores;
    return this.numeradores.filter(n => n.nombre?.trim().toUpperCase() === 'FS');
  }

  // Mismo criterio que numeradoresParaElPasoInicial, para el desplegable de serie DENTRO del
  // formulario ya abierto: una FA no debe poder elegirse con un numerador de facturas completas
  // (evita contabilizar accidentalmente una simplificada con una serie que no es FS).
  numeradoresParaLaFactura(esSimplificada: boolean | undefined): Numerador[] {
    if (!esSimplificada) return this.numeradores;
    return this.numeradores.filter(n => n.nombre?.trim().toUpperCase() === 'FS');
  }

  get esEditable(): boolean {
    return this.esNueva || this.working?.estado === 'borrador';
  }

  // Renombrado visual a "Ticket" (2026-09-01): antes del primer guardado real (esBorradorLocal),
  // el número que se ve en pantalla es un identificador interno del mock (ej. "A-BORRADOR-100"),
  // no un número fiscal — mostrar "Nuevo ticket" en su lugar evita confundirlo con uno real. En
  // cuanto existe un número real (guardado o contabilizado), se muestra ese número tal cual.
  get tituloCabecera(): string {
    const esTicket = this.working ? this.working.esSimplificada : this.esSimplificada;
    if (esTicket && (!this.working || this.working.esBorradorLocal)) {
      return this.transloco.translate('invoices.issued.detail.newTicketTitle');
    }
    return this.working?.numFactura || this.transloco.translate('invoices.issued.detail.newInvoice');
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
      // Solo alcanzable para "Factura completa" — una simplificada siempre arranca por
      // iniciarSimplificada() (nunca por aquí, ver el paso inicial en el HTML): no
      // implementamos una "simplificada con destinatario identificado desde el principio".
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

  // Facturas simplificadas emitidas — "Convertir en factura completa" (2026-08-31): sustituye a
  // "Cambiar cliente" para una simplificada, que es ambiguo (¿cambia el cliente genérico por otro
  // pero sigue siendo simplificada? esa combinación no está implementada). Solo tiene sentido
  // ANTES del primer guardado real: una vez guardada, la factura ya tiene un número real
  // reservado en la serie FS (el numerador asigna el número AL GUARDAR, no al contabilizar) — no
  // se renumera en silencio, se bloquea con una explicación clara.
  async convertirEnFacturaCompleta() {
    if (!this.working) return;

    if (!this.working.esBorradorLocal) {
      await this.showToast(this.transloco.translate('invoices.issued.simplified.convertBlockedAlreadyNumbered'), 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.simplified.convertHeader'),
      message: this.transloco.translate('invoices.issued.simplified.convertConfirmMessage'),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.issued.simplified.convertConfirm'),
          handler: async () => {
            if (!this.working) return;
            this.working.esSimplificada = false;

            // Nunca se conserva la serie FS en una completa — si el numerador actual es FS, se
            // reajusta al primero disponible que no lo sea.
            const numeradorActualEsFS = this.numeradores.find(n => n.id === this.working!.numeradorId)?.nombre?.trim().toUpperCase() === 'FS';
            if (numeradorActualEsFS) {
              const otro = this.numeradores.find(n => n.nombre?.trim().toUpperCase() !== 'FS') ?? this.numeradores[0];
              if (otro) this.working.numeradorId = otro.id;
            }

            await this.elegirCliente();
          },
        },
      ],
    });
    await alert.present();
  }

  // Facturas simplificadas emitidas (MVP, 2026-08-31): arranca el borrador directamente con
  // "Consumidor final" sin pasar por el selector de cliente — ver clarificación del jefe "no
  // obligar cliente, mostrar Consumidor final". idCliente se deja sin definir a propósito: lo
  // resuelve/crea el backend (ClienteGenericoService) la primera vez que se guarda de verdad.
  iniciarSimplificada() {
    const numeradorId = this.numeradorSeleccionado ?? this.numeradores[0]?.id;
    if (numeradorId == null) return;
    const destinatario: Destinatario = {
      nombre: this.transloco.translate('invoices.issued.simplified.genericClientName'),
      nif: '',
      esEmpresa: false,
    };
    const creada = this.invoicesRepo.crearBorrador(numeradorId, destinatario);
    this.working = structuredClone(creada);
    this.working.esSimplificada = true;
    this.working.idCliente = undefined;
    this.facturaId = creada.id;
    this.esNueva = false;
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

  // Facturas simplificadas emitidas (MVP, 2026-08-31): aviso local antes de guardar/contabilizar
  // — el backend es quien de verdad rechaza por encima del límite (ValidarLimiteSimplificadaAsync
  // en FacturaEmitidaService, tanto al crear como al editar), pero no tiene sentido dejar que el
  // usuario llegue hasta ahí sin avisarle antes.
  get superaLimiteSimplificada(): boolean {
    return !!this.working?.esSimplificada && this.totales().total > this.limiteSimplificada;
  }

  // Fase 4 del plan de integración (2026-08-20): guarda de verdad contra el backend (antes
  // solo mutaba el borrador local) — invoicesRepo.guardar() decide alta vs actualización según
  // si facturaId sigue siendo un id local sin guardar o ya es uno real (ver
  // issued-invoices.repository.http.ts). Si falla (cliente sin idCliente real, IVA sin
  // catálogo, numerador inválido...) el borrador local se queda tal cual: nada se pierde,
  // solo no se ha podido persistir todavía.
  // Devuelve si de verdad se guardó — confirmarContabilizar() no debe simular la
  // contabilización de una factura que en realidad no se ha llegado a persistir.
  // mostrarToast=false cuando el guardado es solo el paso previo automático de
  // confirmarContabilizar() — evita solapar "Factura guardada" con el toast final de
  // contabilizar, que llega segundos después y confundía al usuario ("¿ha hecho algo el
  // segundo clic?").
  async guardar(mostrarToast = true): Promise<boolean> {
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
        esSimplificada: this.working.esSimplificada,
      });

      this.working = structuredClone(guardada);
      this.facturaId = guardada.id;
      if (mostrarToast) {
        await this.showToast(this.transloco.translate('invoices.issued.detail.saveSuccess'));
      }
      return true;
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.detail.saveError'), 'danger');
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
    if (!this.working || this.facturaId == null || this.algoEnCurso) return;

    // El servidor real rechaza la factura (error AEAT 4102) si el concepto va vacío,
    // y el medio de pago es obligatorio en el modelo — se valida aquí antes de intentarlo.
    if (!this.working.concepto?.trim() || !this.working.medioPago?.trim()) {
      this.errorMsg = this.transloco.translate('invoices.issued.detail.postValidationError');
      return;
    }
    this.errorMsg = '';

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.post.header'),
      message: this.transloco.translate('invoices.issued.detail.postConfirmMessage', { cliente: this.working.destinatario.nombre, importe: this.formatEuros(this.totales().total) }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.issued.actions.postConfirm'),
          handler: async () => {
            if (this.algoEnCurso) return;
            const guardadoOk = await this.guardar(false);
            if (!guardadoOk) return; // guardar() ya mostró el motivo del fallo
            this.contabilizando = true;
            try {
              this.working = await this.invoicesRepo.contabilizar(this.facturaId!);
              await this.showToast(this.transloco.translate('invoices.issued.detail.postedSuccess'));
              this.volver();
            } catch (e: any) {
              await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.post.error'), 'danger');
            } finally {
              this.contabilizando = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Cobro de tickets/facturas emitidas (Fase 2, 2026-09-02): solo tiene sentido mientras sigue en
  // borrador (cobrar algo ya contabilizado no es lo que dispara la contabilización; ver
  // docs/FACTURAS_SIMPLIFICADAS_MVP.md) y todavía no se ha cobrado — el backend es quien de
  // verdad decide (MarcarComoCobradoAsync), esto es solo para no invitar a un intento redundante.
  get puedeCobrar(): boolean {
    return !!this.working && this.working.estado === 'borrador' && !this.working.cobrada;
  }

  // El importe se manda tal cual lo calcula el propio formulario (nunca uno editable a mano) —
  // el backend lo revalida igualmente contra el total real de la factura ya guardada, esto solo
  // evita pedirle al usuario que teclee un importe que ya puede ver en pantalla.
  async confirmarCobro() {
    if (!this.working || this.facturaId == null || this.algoEnCurso || !this.puedeCobrar) return;

    const importe = this.totales().total;

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.cobros.header'),
      message: this.transloco.translate('invoices.issued.cobros.confirmMessage', { importe: this.formatEuros(importe) }),
      inputs: this.MEDIOS_COBRO.map((medio, i) => ({
        type: 'radio' as const,
        label: this.transloco.translate(`invoices.issued.cobros.medios.${medio}`),
        value: medio,
        checked: i === 0,
      })),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.issued.cobros.confirm'),
          handler: async (medio: string) => {
            if (this.algoEnCurso) return;
            this.marcandoCobrado = true;
            try {
              this.working = await this.invoicesRepo.marcarComoCobrado(this.facturaId!, medio, importe);
              await this.showToast(this.transloco.translate('invoices.issued.cobros.success'));
            } catch (e: any) {
              await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.cobros.error'), 'danger');
            } finally {
              this.marcandoCobrado = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarFirmar() {
    if (!this.working || this.facturaId == null || this.algoEnCurso) return;

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.sign.header'),
      message: this.transloco.translate('invoices.issued.detail.signConfirmMessage'),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.issued.actions.signConfirm'),
          handler: async () => {
            if (this.algoEnCurso) return;
            this.firmando = true;
            try {
              this.working = await this.invoicesRepo.firmar(this.facturaId!);
              await this.showToast(this.transloco.translate('invoices.issued.detail.signedSuccess'));
              this.volver();
            } catch (e: any) {
              await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.sign.error'), 'danger');
            } finally {
              this.firmando = false;
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
  // Pipeline F2 (2026-08-31): la subsanación de una simplificada no está implementada en este
  // MVP (ver docs/FACTURAS_SIMPLIFICADAS_MVP.md) — el backend ya la rechaza con un error
  // estable, pero se oculta también el botón para no invitar a un intento que se sabe que va a
  // fallar. Anular SÍ sigue disponible para una simplificada (funciona sin cambios).
  get puedeSubsanar(): boolean {
    return this.puedeAnular && !this.working?.esSimplificada;
  }

  async confirmarAnular() {
    if (!this.working || this.facturaId == null || this.algoEnCurso) return;

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.detail.cancelHeader'),
      message: this.transloco.translate('invoices.issued.detail.cancelConfirmMessage', { num: this.working.numFactura }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('invoices.issued.detail.cancelConfirm'),
          role: 'destructive',
          handler: async () => {
            if (this.algoEnCurso) return;
            this.anulando = true;
            try {
              this.working = await this.invoicesRepo.anular(this.facturaId!);
              await this.showToast(this.transloco.translate('invoices.issued.detail.cancelledSuccess'));
            } catch (e: any) {
              await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.detail.cancelError'), 'danger');
            } finally {
              this.anulando = false;
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
      await this.showToast(this.transloco.translate('invoices.issued.duplicate.success', { nuevo: copia.numFactura, original: this.working.numFactura }));
      this.router.navigate(['/app/emitidas', copia.id], { replaceUrl: true });
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.duplicate.error'), 'danger');
    }
  }

  // "Descargar" trae un documento distinto según el estado -- ver descargar() más abajo.
  descargaDeshabilitada(f: FacturaEmitida): boolean {
    if (f.estado === 'firmada') return !f.tieneXsig;
    if (f.estado === 'borrador') return false;
    return !f.tienePdf;
  }

  descargaAriaLabel(f: FacturaEmitida): string {
    if (f.estado === 'firmada') return f.tieneXsig ? 'invoices.issued.actions.downloadXsigAria' : 'invoices.issued.download.xsigNotReady';
    if (f.estado !== 'borrador' && !f.tienePdf) return 'invoices.issued.download.pdfNotReady';
    return 'invoices.issued.actions.downloadAria';
  }

  // Un borrador nunca ha pasado por FacturaE (no existe hasta contabilizar), así que sigue
  // usando el documento simulado; contabilizada tiene el PDF real; firmada descarga el .xsig
  // (el documento legalmente vigente a partir de ahí) en vez del PDF -- sin un botón aparte
  // para esto, que confundía con un icono de seguridad genérico (2026-08-28). Compartir sigue
  // mandando siempre el PDF, sea cual sea el estado.
  async descargar() {
    if (!this.working) return;
    if (this.working.estado === 'firmada') {
      if (!this.working.tieneXsig) {
        await this.showToast(this.transloco.translate('invoices.issued.download.xsigNotReady'), 'danger');
        return;
      }
      try {
        const blob = await this.invoicesRepo.obtenerXsigReal(this.working.id);
        descargarBlob(blob, `Factura-${this.working.numFactura}.xsig`);
        await this.showToast(this.transloco.translate('invoices.issued.download.xsigSuccess'));
      } catch {
        await this.showToast(this.transloco.translate('invoices.issued.download.error'), 'danger');
      }
      return;
    }
    if (this.working.estado !== 'borrador' && !this.working.tienePdf) {
      await this.showToast(this.transloco.translate('invoices.issued.download.pdfNotReady'), 'danger');
      return;
    }
    try {
      if (this.working.estado === 'borrador') {
        const { blob, nombre } = await this.invoicesRepo.generarDocumento(this.working.id);
        descargarBlob(blob, nombre);
        await this.showToast(this.transloco.translate('invoices.issued.download.success'));
      } else {
        const blob = await this.invoicesRepo.obtenerPdfReal(this.working.id);
        descargarBlob(blob, `Factura-${this.working.numFactura}.pdf`);
        await this.showToast(this.transloco.translate('invoices.issued.download.successReal'));
      }
    } catch {
      await this.showToast(this.transloco.translate('invoices.issued.download.error'), 'danger');
    }
  }

  // Mismo criterio que descargar() (2026-08-27): comparte el PDF real ya contabilizado/
  // firmado, no el simulado.
  async compartir() {
    if (!this.working) return;
    if (this.working.estado !== 'borrador' && !this.working.tienePdf) {
      await this.showToast(this.transloco.translate('invoices.issued.download.pdfNotReady'), 'danger');
      return;
    }
    try {
      if (this.working.estado === 'borrador') {
        const { blob, nombre } = await this.invoicesRepo.generarDocumento(this.working.id);
        await compartirBlob(blob, nombre);
      } else {
        const blob = await this.invoicesRepo.obtenerPdfReal(this.working.id);
        await compartirBlob(blob, `Factura-${this.working.numFactura}.pdf`);
      }
    } catch {
      await this.showToast(this.transloco.translate('invoices.issued.share.error'), 'danger');
    }
  }

  async confirmarEliminar() {
    if (!this.working) return;
    const f = this.working;
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.deleteDraft.header'),
      message: this.transloco.translate('invoices.issued.deleteDraft.message', { num: f.numFactura, cliente: f.destinatario.nombre }),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('common.actions.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.invoicesRepo.eliminar(f.id);
              await this.showToast(this.transloco.translate('invoices.issued.deleteDraft.success'));
              this.volver();
            } catch (e: any) {
              await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.deleteDraft.error'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Facturas simplificadas emitidas (MVP, 2026-08-31): envía (o reenvía, misma llamada) el PDF
  // ya generado al contabilizar — solo disponible desde entonces, ver la tarjeta de correo en
  // el template. No contabiliza ni cambia el registro VERI*FACTU (lo hace FacturaEmitidaEmailService
  // en el backend, reutilizando MailARTI sin tocarlo).
  async enviarPorCorreo() {
    if (!this.working || this.facturaId == null || this.enviandoCorreo || !this.emailEnvio.trim()) return;
    this.enviandoCorreo = true;
    try {
      this.working = await this.invoicesRepo.enviarPorCorreo(this.facturaId, this.emailEnvio.trim());
      await this.showToast(this.transloco.translate('invoices.issued.simplified.sendSuccess'));
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.simplified.sendError'), 'danger');
      // El backend persiste el fallo (EstadoUltimoEnvio/ErrorUltimoEnvio) aunque la petición
      // termine en error — se relee para no dejar la tarjeta de correo con el estado anterior.
      try {
        const actualizada = await this.invoicesRepo.obtenerPorId(this.facturaId);
        if (actualizada) this.working = actualizada;
      } catch {
        // Sin conexión o fallo de lectura: se deja el estado local tal cual, no es crítico.
      }
    } finally {
      this.enviandoCorreo = false;
    }
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
