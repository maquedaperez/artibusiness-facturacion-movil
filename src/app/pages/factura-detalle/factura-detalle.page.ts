import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

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
import { LineasEditorComponent, lineaFacturaInvalida } from '../../shared/lineas-editor/lineas-editor.component';
import { compartirBlob, descargarBlob } from '../../shared/utils/compartir-documento';
import { PuedeSalirDeLaPantalla } from '../../guards/cambios-sin-guardar.guard';
import { CATALOGO_DISPONIBLE, DOCUMENTO_DE_BORRADOR_DISPONIBLE, SUSCRIPCIONES_DISPONIBLES } from '../../core/providers/funcionalidades-pendientes';

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
export class FacturaDetallePage implements OnInit, OnDestroy, PuedeSalirDeLaPantalla {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private transloco = inject(TranslocoService);
  private location = inject(Location);

  // Funciones todavia sin servicio real detras — ver funcionalidades-pendientes.ts.
  readonly catalogoDisponible = CATALOGO_DISPONIBLE;
  readonly suscripcionesDisponibles = SUSCRIPCIONES_DISPONIBLES;
  readonly documentoDeBorradorDisponible = DOCUMENTO_DE_BORRADOR_DISPONIBLE;

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
  // Bug real encontrado en revisión (2026-09-02): serieSimplificadaNoConfigurada solo se
  // conoce DESPUÉS de que cargarCatalogos() traiga el catálogo real (3 peticiones HTTP
  // seguidas, con posible arranque en frío de Azure). Hasta entonces arrancaba en false y el
  // botón de "Empezar con Consumidor final" estaba habilitado, así que un toque rápido creaba
  // el ticket con el numerador de ejemplo del mock ('Serie A 2026'), no con la serie FS real —
  // y como iniciarSimplificada() pone esNueva=false, la corrección posterior de
  // cargarCatalogos() (que solo actúa si esNueva) ya no se aplicaba nunca. El backend lo
  // rechaza igualmente (ValidarCoherenciaTipoFiscalYSerie), pero dejaba al usuario en un
  // callejón sin salida: serie vacía en el desplegable y un ticket que no se puede guardar.
  cargandoCatalogos = true;
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

  // Bug real encontrado en revisión (2026-09-02): faltaba 'guardando'. Guardar y Contabilizar
  // son visibles a la vez en un borrador, y Contabilizar no estaba bloqueado durante un
  // guardado en curso — al pulsarlo, confirmarContabilizar() llamaba a guardar(), que devuelve
  // false de inmediato por su propio guard, y el flujo salía por 'if (!guardadoOk) return'
  // SIN mostrar ningún mensaje (el comentario de ahí asume que guardar() ya avisó, y en esa
  // rama concreta no avisa). Resultado: un botón que no hacía absolutamente nada visible.
  get algoEnCurso(): boolean {
    return this.guardando || this.contabilizando || this.firmando || this.anulando || this.marcandoCobrado || this.cobrandoStripe;
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

  // Cobro con Stripe Connect (Fase 3, 2026-09-02) — NUNCA se muestra el botón sin haber
  // comprobado antes obtenerEstadoStripeConnect() (ver EstadoStripeConnect): mientras
  // StripeConnect:Enabled=false (todo el MVP, hasta que exista infraestructura real), ese
  // endpoint devuelve 503 y este flag se queda en false — el botón permanece oculto en vez de
  // mostrarse y fallar al pulsarlo.
  stripeConnectDisponible = false;
  cobrandoStripe = false;
  // URL de Stripe Checkout a la que redirigir al cliente — puede abrirse en OTRO dispositivo
  // (el suyo), así que esta pantalla nunca asume que el pago se completó por volver aquí; solo
  // deja de sondear cuando ve el cobro en PAID (ver iniciarSondeoCobroStripe()).
  checkoutUrlStripe: string | null = null;
  private sondeoCobroStripe: ReturnType<typeof setInterval> | null = null;

  constructor() {
    addIcons({
      arrowBackOutline, personCircleOutline, documentTextOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline, receiptOutline,
    });
  }

  ngOnInit() {
    this.cargarCatalogos();
    this.cargarEstadoStripeConnect();
    this.numeradores = this.invoicesRepo.getNumeradores();
    const param = this.route.snapshot.paramMap.get('id');

    if (param === 'nueva') {
      this.esNueva = true;
      this.esSimplificada = this.route.snapshot.queryParamMap.get('simplificada') === '1';
      // Un ticket NUNCA arranca con el numerador de ejemplo del mock: su serie solo puede ser
      // la FS real, que se resuelve en cargarCatalogos(). Se deja sin seleccionar a propósito
      // (ver cargandoCatalogos) en vez de preseleccionar uno de facturas completas y corregirlo
      // después. Para una factura completa se mantiene el comportamiento de siempre.
      this.numeradorSeleccionado = this.esSimplificada ? null : (this.numeradores[0]?.id ?? null);
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
      this.marcarSinCambiosPendientes();
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
      // El ticket puede haberse creado antes de que llegara el catalogo real.
      this.autoseleccionarFormaDePagoDeUnTicket();
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
    } finally {
      // Siempre, también si falla: el paso inicial no puede quedarse bloqueado para siempre
      // por una carga de catálogo que no llegó. Si falló y estamos en modo simplificado, no
      // hay serie FS conocida y serieSimplificadaNoConfigurada sigue bloqueando el botón por
      // su cuenta, que es exactamente lo que se quiere.
      this.cargandoCatalogos = false;
      if (this.esNueva && this.esSimplificada && this.numeradorSeleccionado == null) {
        this.serieSimplificadaNoConfigurada = true;
      }
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

  // Bug real encontrado en revisión (2026-09-02): no miraba 'cobrada' — un ticket ya cobrado
  // (mientras sigue en borrador) se podía seguir editando (líneas, importe, cliente) sin ningún
  // aviso. El backend (FacturaEmitidaService.GuardarAsync) es quien de verdad lo impone con un
  // 409; esto solo evita mostrar un formulario editable que se sabe que va a fallar al guardar.
  get esEditable(): boolean {
    return this.esNueva || (this.working?.estado === 'borrador' && !this.working?.cobrada);
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

  // Devuelve si el usuario llegó a elegir un cliente — convertirEnFacturaCompleta() lo necesita
  // para poder deshacer su cambio si se cancela el selector (ver allí).
  async elegirCliente(): Promise<boolean> {
    const modal = await this.modalCtrl.create({ component: ClienteSelectorComponent });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return false;

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
      if (numeradorId == null) return false;
      const creada = this.invoicesRepo.crearBorrador(numeradorId, destinatario);
      this.working = structuredClone(creada);
      this.working.idCliente = idCliente;
      this.facturaId = creada.id;
      this.esNueva = false;
      // Un borrador recien creado no tiene todavia trabajo que perder (ni concepto ni lineas):
      // se toma como punto de partida para que salir de inmediato no pregunte por nada.
      this.marcarSinCambiosPendientes();
    } else if (this.working) {
      this.working.destinatario = destinatario;
      this.working.idCliente = idCliente;
    }
    return true;
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

            // Bug real encontrado en revisión (2026-09-02): el cambio se aplicaba ANTES de abrir
            // el selector, así que cancelarlo dejaba el ticket ya convertido en factura completa,
            // con "Consumidor final" como destinatario y sin idCliente — un estado que no se
            // puede guardar ("falta el cliente") y del que la UI ya no ofrece vuelta atrás,
            // porque el botón de convertir desaparece en cuanto esSimplificada es false. Se
            // guarda el estado previo y se restaura si el usuario no llega a elegir cliente.
            const esSimplificadaPrevio = this.working.esSimplificada;
            const numeradorPrevio = this.working.numeradorId;

            this.working.esSimplificada = false;

            // Nunca se conserva la serie FS en una completa — si el numerador actual es FS, se
            // reajusta al primero disponible que no lo sea.
            const numeradorActualEsFS = this.numeradores.find(n => n.id === this.working!.numeradorId)?.nombre?.trim().toUpperCase() === 'FS';
            if (numeradorActualEsFS) {
              const otro = this.numeradores.find(n => n.nombre?.trim().toUpperCase() !== 'FS') ?? this.numeradores[0];
              if (otro) this.working.numeradorId = otro.id;
            }

            const eligio = await this.elegirCliente();
            if (!eligio && this.working) {
              this.working.esSimplificada = esSimplificadaPrevio;
              this.working.numeradorId = numeradorPrevio;
            }
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
    // Sin fallback a numeradores[0] a propósito (ver ngOnInit): para un ticket, o hay serie FS
    // real seleccionada o no se arranca — caer en cualquier otro numerador es justo el bug que
    // esto evita.
    if (this.cargandoCatalogos || this.serieSimplificadaNoConfigurada) return;
    const numeradorId = this.numeradorSeleccionado;
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
    this.autoseleccionarFormaDePagoDeUnTicket();
    this.marcarSinCambiosPendientes();
  }

  // Stripe Connect (Fase 3, 2026-09-02): se consulta SIEMPRE, no solo cuando puedeCobrar ya es
  // true (la factura puede seguir cargando/guardando en ese momento) — un fallo (503 con el
  // módulo desactivado, sin red) se traduce a "no disponible" en el propio adaptador, nunca
  // llega aquí como excepción que rompa la carga de la página.
  private async cargarEstadoStripeConnect() {
    const { disponible } = await this.invoicesRepo.obtenerEstadoStripeConnect();
    this.stripeConnectDisponible = disponible;
  }

  // Forma de pago de un TICKET (2026-09-02, encontrado probando la demo): en un ticket el pago
  // es inmediato y el medio real queda registrado en el cobro (MEDIOS_COBRO, ver
  // confirmarCobro), que es la fila que de verdad guarda como se pago
  // (FacturacionFacturasEmitidasCobros.Medio). Pedir ADEMAS la "forma de pago" de la cabecera
  // era preguntar dos veces por lo mismo con dos vocabularios distintos —  y encima bloqueaba:
  // el campo es obligatorio para guardar (el backend exige IdMedioPago), asi que no elegirlo
  // impedia continuar.
  //
  // La cabecera sigue necesitando su IdMedioPago (es obligatorio en el modelo y una factura
  // puede contabilizarse sin llegar a cobrarse), asi que se elige solo: se prefiere una entrada
  // del catalogo real que suene a pago al contado y, si no hay ninguna, la primera disponible.
  // Nunca se inventa un id: si el catalogo aun no ha llegado, no se toca nada.
  private readonly PISTAS_PAGO_INMEDIATO = ['contado', 'efectivo', 'caja', 'metalico'];

  private autoseleccionarFormaDePagoDeUnTicket() {
    if (!this.working?.esSimplificada || this.working.idMedioPago) return;
    if (this.mediosPago.length === 0) return;

    const inmediato = this.mediosPago.find(m =>
      this.PISTAS_PAGO_INMEDIATO.some(p => m.label?.toLowerCase().includes(p)));
    const elegido = inmediato ?? this.mediosPago[0];
    this.onMedioPagoChange(elegido.id);
    // Es una eleccion automatica, no del usuario: no debe contar como cambio sin guardar ni
    // hacer que salte el aviso de salida en un ticket que solo se ha abierto.
    this.marcarSinCambiosPendientes();
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

  // Validación de rango de las líneas (2026-09-02) — misma regla que marca el editor en cada
  // campo (lineaFacturaInvalida), aplicada aquí para bloquear Guardar/Contabilizar. Sin esto se
  // podía emitir una factura con cantidad o precio negativo: ni el frontend ni el backend
  // comprobaban el signo.
  get hayLineasInvalidas(): boolean {
    return !!this.working?.lineas.some(l => lineaFacturaInvalida(l));
  }

  // El concepto es obligatorio de verdad: la AEAT rechaza la factura sin él (error 4102) y el
  // backend ya lo exige explícitamente en un ticket (ValidarCamposObligatoriosDeUnTicket). Se
  // avisa antes de intentar guardar en vez de dejar descubrir el rechazo al contabilizar.
  get faltaConcepto(): boolean {
    return !this.working?.concepto?.trim();
  }

  // Un borrador incompleto se puede seguir guardando a medias a propósito (es un borrador), pero
  // nunca con datos imposibles: lo que se bloquea es lo que el servidor no puede aceptar.
  get noSePuedeGuardar(): boolean {
    return this.superaLimiteSimplificada || this.hayLineasInvalidas;
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
      this.marcarSinCambiosPendientes();
      this.sincronizarUrlConLaFacturaGuardada();
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

  // Bug real encontrado en revisión (2026-09-02): tras el primer guardado real la factura ya
  // existe en el backend con su id, pero la URL seguía siendo /app/emitidas/nueva — recargar el
  // navegador ahí arrancaba OTRA factura desde cero, con riesgo de duplicarla, y compartir el
  // enlace no llevaba a ninguna parte.
  //
  // Se usa Location.replaceState() y NO router.navigate({replaceUrl:true}) a propósito:
  // IonicRouteStrategy compara los parámetros de ruta uno a uno (ver shouldReuseRoute), así que
  // cambiar :id de 'nueva' a un id real destruiría y recrearía este componente — recarga
  // completa, pérdida del scroll y del formulario en pantalla justo después de guardar. Aquí
  // solo interesa que la barra de direcciones diga la verdad.
  private sincronizarUrlConLaFacturaGuardada() {
    if (this.facturaId == null) return;
    const urlActual = this.location.path();
    if (!urlActual.includes('/emitidas/nueva')) return;
    this.location.replaceState(`/app/emitidas/${this.facturaId}`);
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

            // Bug real encontrado en revisión (2026-09-02): esto guardaba SIEMPRE antes de
            // contabilizar, aunque no hubiera nada que guardar. Para un ticket ya cobrado el
            // backend rechaza cualquier edición con un 409 ("Esta factura ya tiene un cobro
            // confirmado — no se puede editar", ver GuardarAsync), así que el guardado previo
            // fallaba y abortaba la contabilización: el flujo cobrar -> contabilizar, que es
            // justo el que la propia pantalla invita a seguir con "Pagado — pendiente de
            // contabilizar", era IMPOSIBLE de completar. Ahora solo se guarda si de verdad hay
            // algo pendiente: un borrador local (que todavía no existe en el backend) o cambios
            // sin guardar en pantalla.
            const necesitaGuardar = this.working?.esBorradorLocal === true || this.hayCambiosSinGuardar;
            if (necesitaGuardar) {
              const guardadoOk = await this.guardar(false);
              if (!guardadoOk) return; // guardar() ya mostró el motivo del fallo
            }
            this.contabilizando = true;
            try {
              this.working = await this.invoicesRepo.contabilizar(this.facturaId!);
              this.marcarSinCambiosPendientes();
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
              this.marcarSinCambiosPendientes();
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

  // Solo se ofrece si además de poder cobrarse (mismo criterio que el manual) Stripe Connect
  // está realmente operativo para esta empresa (ver cargarEstadoStripeConnect) — nunca se
  // muestra un botón que el backend fuera a rechazar con 503.
  get puedeCobrarStripe(): boolean {
    return this.puedeCobrar && this.stripeConnectDisponible;
  }

  async iniciarCobroStripe() {
    if (!this.working || this.facturaId == null || this.algoEnCurso || !this.puedeCobrarStripe) return;

    this.cobrandoStripe = true;
    try {
      const { checkoutUrl } = await this.invoicesRepo.iniciarCobroStripe(this.facturaId);
      if (!checkoutUrl) {
        await this.showToast(this.transloco.translate('invoices.issued.cobros.stripe.yaResuelto'));
        return;
      }
      this.checkoutUrlStripe = checkoutUrl;
      this.iniciarSondeoCobroStripe();
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.cobros.stripe.error'), 'danger');
    } finally {
      this.cobrandoStripe = false;
    }
  }

  // El cliente puede pagar desde OTRO dispositivo (el suyo, no el de este profesional) — la
  // única confirmación válida es ver el cobro en PAID, nunca el redirect del navegador (que
  // además puede que ni siquiera ocurra en esta pantalla). Se detiene solo al confirmar el
  // pago o al salir de la página (ver ngOnDestroy).
  private iniciarSondeoCobroStripe() {
    this.detenerSondeoCobroStripe();
    this.sondeoCobroStripe = setInterval(() => this.comprobarCobroStripe(), 4000);
  }

  private async comprobarCobroStripe() {
    if (this.facturaId == null) return;
    try {
      const cobros = await this.invoicesRepo.obtenerCobros(this.facturaId);
      const pagado = cobros.some(c => c.proveedor === 'STRIPE' && c.estado === 'PAID');
      if (!pagado) return;

      this.detenerSondeoCobroStripe();
      this.checkoutUrlStripe = null;
      const actualizada = await this.invoicesRepo.obtenerPorId(this.facturaId);
      if (actualizada) { this.working = actualizada; this.marcarSinCambiosPendientes(); }
      await this.showToast(this.transloco.translate('invoices.issued.cobros.stripe.pagadoConfirmado'));
    } catch {
      // Un fallo puntual de red al sondear no debe detener el sondeo — se reintenta en el
      // siguiente tick.
    }
  }

  private detenerSondeoCobroStripe() {
    if (this.sondeoCobroStripe != null) {
      clearInterval(this.sondeoCobroStripe);
      this.sondeoCobroStripe = null;
    }
  }

  cerrarCheckoutStripe() {
    this.detenerSondeoCobroStripe();
    this.checkoutUrlStripe = null;
  }

  // Bug real encontrado en revisión (2026-09-02): un <a target="_blank"> es poco fiable dentro
  // del WebView nativo (Capacitor) — en nativo hace falta el navegador del sistema, mismo
  // criterio que PagosConnectService.abrirOnboarding().
  abrirPagoStripe() {
    if (!this.checkoutUrlStripe) return;
    if (Capacitor.isNativePlatform()) {
      window.open(this.checkoutUrlStripe, '_system');
      return;
    }
    window.open(this.checkoutUrlStripe, '_blank', 'noopener');
  }

  // El texto de "instrucciones" pide compartir el enlace con el cliente, pero antes de esto no
  // había ningún control real para hacerlo — solo el enlace "Abrir página de pago". En un
  // mostrador real hace falta poder mandarlo por WhatsApp/SMS o enseñar el diálogo de compartir
  // del sistema. Fallback a copiar en el portapapeles si no hay nada que ofrezca compartir
  // (navegador de escritorio sin Web Share API).
  async compartirPagoStripe() {
    if (!this.checkoutUrlStripe) return;
    const url = this.checkoutUrlStripe;
    const titulo = this.transloco.translate('invoices.issued.cobros.stripe.action');

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: titulo, url, dialogTitle: titulo });
        return;
      }
      const nav = navigator as Navigator & { canShare?: (data: { url: string }) => boolean; share?: (data: { url: string; title?: string }) => Promise<void> };
      if (nav.canShare?.({ url }) && nav.share) {
        await nav.share({ url, title: titulo });
        return;
      }
      throw new Error('Web Share API no disponible');
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        await this.showToast(this.transloco.translate('invoices.issued.cobros.stripe.enlaceCopiado'));
      } catch {
        await this.showToast(this.transloco.translate('invoices.issued.cobros.stripe.error'), 'danger');
      }
    }
  }

  ngOnDestroy() {
    this.detenerSondeoCobroStripe();
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
              this.marcarSinCambiosPendientes();
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

  // Bug real encontrado en revisión (2026-09-02): el botón de Firmar solo miraba el estado y
  // que no fuera simplificada — dejaba firmar una factura ya ANULADA, que no tiene ningún
  // sentido fiscal (se estaría firmando el documento de una factura que ya se dio de baja). El
  // backend tampoco lo impide hoy (FacturaEmitidaAeatService.FirmarAsync comprueba estado y
  // tipo, pero no la anulación), así que hasta ahora habría llegado a firmarse de verdad.
  get puedeFirmar(): boolean {
    return !!this.working
      && this.working.estado === 'contabilizada'
      && !this.working.esSimplificada
      && !this.working.anulada;
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
              this.marcarSinCambiosPendientes();
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
              // Bug real encontrado en revisión (2026-09-02): esto llamaba siempre a eliminar(),
              // que lanza un DELETE /api/FacturaEmitida/{id} y solo cae al almacén local si
              // recibe un 404 — pero el id de un borrador local es un contador propio del mock
              // (arranca en 100), no un id real, así que ese DELETE puede acertar por
              // casualidad con una factura REAL de la misma empresa. La lista ya lo hacía bien
              // (ver facturas-emitidas.page.ts); el detalle se había quedado atrás. Además, si
              // el id coincide con una factura ya contabilizada el backend responde 400 (no
              // 404), el fallback local no se activa y el usuario no podía ni borrar su propio
              // borrador.
              if (f.esBorradorLocal) {
                await this.invoicesRepo.descartarLocal(f.id);
              } else {
                await this.invoicesRepo.eliminar(f.id);
              }
              // La factura ya no existe: lo que hubiera a medio escribir en pantalla ya no es
              // "trabajo sin guardar" que proteger, o el guard preguntaria por algo que se acaba
              // de borrar a proposito.
              this.marcarSinCambiosPendientes();
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
      this.marcarSinCambiosPendientes();
      await this.showToast(this.transloco.translate('invoices.issued.simplified.sendSuccess'));
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.simplified.sendError'), 'danger');
      // El backend persiste el fallo (EstadoUltimoEnvio/ErrorUltimoEnvio) aunque la petición
      // termine en error — se relee para no dejar la tarjeta de correo con el estado anterior.
      try {
        const actualizada = await this.invoicesRepo.obtenerPorId(this.facturaId);
        if (actualizada) { this.working = actualizada; this.marcarSinCambiosPendientes(); }
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


  // ---------------------------------------------------------------------------------------
  // Cambios sin guardar (hallazgo G04 de la auditoría, 2026-09-02)
  //
  // Antes, editar concepto o líneas y salir —por el botón de la cabecera, por las pestañas de
  // abajo o por el botón Atrás— descartaba el trabajo en silencio, sin ningún aviso. No había
  // ni CanDeactivate, ni comparación con el último estado guardado, ni beforeunload.
  //
  // La comprobación vive en un guard de ruta (cambiosSinGuardarGuard) y NO dentro de volver():
  // así cubre de una vez todas las salidas que pasan por el router, sin repetir la lógica en
  // cada botón ni arriesgarse a olvidar una. volver() se queda tal cual estaba a propósito —
  // navega, y es el guard quien decide si esa navegación llega a completarse.
  // ---------------------------------------------------------------------------------------

  // Último estado conocido como "ya persistido". Se refresca en cada punto en el que 'working'
  // pasa a reflejar lo que hay en el backend: al cargar, al guardar y tras cada acción del
  // servidor que devuelve la factura actualizada (contabilizar/firmar/anular/cobrar/enviar).
  private snapshotGuardado = '';

  // Solo los campos que el formulario puede modificar. Comparar la factura entera daría falsos
  // positivos con los campos que el backend rellena por su cuenta (estadoAeat, urlQr,
  // fechaUltimoEnvioCorrecto...), que cambian sin que el usuario haya tocado nada.
  private instantaneaDeLoEditable(): string {
    const f = this.working;
    if (!f) return '';
    return JSON.stringify({
      fecha: f.fecha,
      vencimiento: f.vencimiento,
      concepto: f.concepto,
      medioPago: f.medioPago,
      idMedioPago: f.idMedioPago,
      destinatario: f.destinatario,
      idCliente: f.idCliente,
      numeradorId: f.numeradorId,
      esSimplificada: f.esSimplificada,
      lineas: f.lineas,
    });
  }

  private marcarSinCambiosPendientes() {
    this.snapshotGuardado = this.instantaneaDeLoEditable();
  }

  // Solo puede haber cambios pendientes en una factura editable: una ya contabilizada o firmada
  // se muestra en modo lectura, así que nada de lo que se ve ahí puede haberse tocado.
  get hayCambiosSinGuardar(): boolean {
    if (!this.working || !this.esEditable) return false;
    return this.instantaneaDeLoEditable() !== this.snapshotGuardado;
  }

  // Lo llama cambiosSinGuardarGuard antes de dejar salir de la pantalla.
  async puedeSalir(): Promise<boolean> {
    if (!this.hayCambiosSinGuardar) return true;

    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.unsaved.header'),
      message: this.transloco.translate('invoices.issued.unsaved.message'),
      buttons: [
        // 'cancel' es también el rol que Ionic asigna al cerrar tocando fuera o con Escape:
        // ante la duda, quedarse es la opción segura, nunca perder el trabajo.
        { text: this.transloco.translate('invoices.issued.unsaved.keepEditing'), role: 'cancel' },
        { text: this.transloco.translate('invoices.issued.unsaved.discard'), role: 'salir' },
      ],
    });
    await alert.present();

    const { role } = await alert.onDidDismiss();
    return role === 'salir';
  }

  // Recargar o cerrar la pestaña no pasa por el router, así que el guard no se entera — este es
  // el único caso que hay que cubrir aparte. El navegador ignora el texto y muestra su propio
  // mensaje: basta con preventDefault() para que pregunte. En la app nativa no se dispara nunca,
  // que es justo lo correcto (ahí no existe "recargar").
  @HostListener('window:beforeunload', ['$event'])
  avisarAlRecargarOCerrar(evento: BeforeUnloadEvent) {
    if (!this.hayCambiosSinGuardar) return;
    evento.preventDefault();
    evento.returnValue = '';
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
