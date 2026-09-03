import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatEuros as formatEurosUtil, formatFecha as formatFechaUtil } from '../../shared/utils/format-euros';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSegment, IonSegmentButton, IonLabel,
  IonSelect, IonSelectOption, IonSearchbar, IonItem, IonInput,
  IonCard, IonCardContent,
  IonText, IonIcon, IonButton, IonFab, IonFabButton, IonSpinner,
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
import { PagosService } from '../../services/pagos.service';
import { pedirConfirmacion } from '../../shared/utils/confirmacion';

@Component({
  selector: 'app-facturas-emitidas',
  templateUrl: './facturas-emitidas.page.html',
  styleUrls: ['./facturas-emitidas.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslocoPipe,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonSegment, IonSegmentButton, IonLabel,
    IonSelect, IonSelectOption, IonSearchbar, IonItem, IonInput,
    IonCard, IonCardContent,
    IonText, IonIcon, IonButton, IonFab, IonFabButton, IonSpinner,
    DemoBannerComponent,
  ],
})
export class FacturasEmitidasPage implements OnInit {
  private invoicesRepo = inject(IssuedInvoicesRepository);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private transloco = inject(TranslocoService);
  private pagosService = inject(PagosService);

  estado: EstadoFactura = 'borrador';
  numeradorId: number | null = null;
  numeradores: Numerador[] = [];
  facturas: FacturaEmitida[] = [];
  searchQuery = '';
  mostrarFiltroSerie = false;
  fechaDesde = '';
  fechaHasta = '';
  cargando = false;
  // Estado de error propio de la lista (ver refresh()) — mutuamente excluyente con
  // cargando y con el contenido, para que nunca se vean resultados de otro filtro.
  errorCarga = false;
  // Blindaje Fase 7 (2026-08-21): ids de facturas con un Contabilizar/Firmar en curso — evita
  // doble clic sobre la misma fila mientras la petición sigue en vuelo (visto en real en los
  // logs: dos peticiones casi simultáneas contabilizando la misma factura).
  procesandoAeatIds = new Set<number>();

  constructor() {
    addIcons({
      documentTextOutline, checkmarkCircleOutline, ribbonOutline, addOutline, filterOutline,
      copyOutline, downloadOutline, shareSocialOutline, trashOutline,
    });
  }

  ngOnInit() {
    this.numeradores = this.invoicesRepo.getNumeradores();
    this.cargarNumeradores();

    // No llama a refresh() aquí -- ionViewWillEnter ya se dispara en la primera entrada a la
    // pantalla (además de cada vez que se vuelve a ella). Llamarlo también desde ngOnInit
    // disparaba 2 peticiones de listado en paralelo en la carga inicial, dejando el spinner
    // en un estado inconsistente hasta que algo (un clic) forzaba a Angular a revisar el
    // componente otra vez. Mismo fix ya aplicado en facturas-recibidas.page.ts (2026-08-14).
  }

  // Bug real encontrado en revisión (2026-09-02): esta app usa IonicRouteStrategy (las páginas
  // se mantienen vivas en memoria en vez de destruirse al navegar) — así que ngOnInit() solo se
  // ejecuta la PRIMERA vez que se visita esta pantalla en toda la sesión. factura-detalle.page.ts
  // (volver()) manda queryParams:{estado} tras contabilizar/firmar/anular/cobrar precisamente
  // para aterrizar en la pestaña correcta, pero como solo ionViewWillEnter() se repetía en
  // visitas posteriores (y antes no releía el parámetro), la pestaña se quedaba congelada en la
  // que estuviera antes de abrir el detalle — la factura recién contabilizada podía parecer
  // haber desaparecido de la vista. Se relee aquí, en cada entrada a la pantalla, no solo en
  // ngOnInit().
  private sincronizarEstadoDesdeQueryParam() {
    const estadoParam = this.route.snapshot.queryParamMap.get('estado');
    if (estadoParam === 'borrador' || estadoParam === 'contabilizada' || estadoParam === 'firmada') {
      this.estado = estadoParam;
    }
  }

  // Fase 4 del plan de integración (2026-08-20): sustituye los 2 numeradores fijos del mock
  // por el catálogo real — sin esto, filtrar por serie contra facturas reales no encontraría
  // nada (los ids del mock no tienen por qué coincidir con los reales de la empresa).
  private async cargarNumeradores() {
    try {
      const numeradores = await this.invoicesRepo.obtenerNumeradores();
      if (numeradores.length > 0) this.numeradores = numeradores;
    } catch {
      // Se mantienen los numeradores de ejemplo del mock.
    }
  }

  ionViewWillEnter() {
    this.sincronizarEstadoDesdeQueryParam();
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
      this.errorCarga = false;
    } catch (e: any) {
      if (idPeticion !== this.peticionListarEnCurso) return;
      // Bug real encontrado en revisión (2026-09-02): el catch solo mostraba un toast y dejaba
      // this.facturas con el resultado de la carga ANTERIOR — pero this.estado ya había
      // cambiado antes de llamar aquí, así que tras un fallo al cambiar de pestaña se veían
      // los borradores listados bajo "Contabilizadas", como si fueran suyos. Con un backend en
      // Development que puede arrancar en frío, es un escenario probable, no teórico. La lista
      // se vacía y se muestra un estado de error propio con opción de reintentar.
      this.facturas = [];
      this.errorCarga = true;
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.list.loadError'), 'danger');
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
    if (this.numeradorId != null) partes.push(this.transloco.translate('invoices.issued.filters.seriesPrefix') + ' ' + this.numeradorSeleccionadoNombre());
    if (this.fechaDesde || this.fechaHasta) partes.push(this.transloco.translate('invoices.issued.filters.dates'));
    return partes.length > 0 ? partes.join(' · ') : this.transloco.translate('invoices.issued.filters.placeholder');
  }

  abrir(f: FacturaEmitida) {
    this.router.navigate(['/app/emitidas', f.id]);
  }

  crearBorrador() {
    this.router.navigate(['/app/emitidas', 'nueva']);
  }

  // Facturas simplificadas emitidas (MVP, 2026-08-31): mismo formulario/ruta de creación que
  // una factura completa (factura-detalle.page.ts), solo cambia el query param que activa el
  // modo simplificado (preselección de Consumidor final + serie FS) — ver ngOnInit allí.
  crearBorradorSimplificada() {
    this.router.navigate(['/app/emitidas', 'nueva'], { queryParams: { simplificada: '1' } });
  }

  async elegirTipoNuevaFactura() {
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('invoices.issued.new.header'),
      buttons: [
        { text: this.transloco.translate('invoices.issued.new.complete'), handler: () => this.crearBorrador() },
        { text: this.transloco.translate('invoices.issued.new.simplified'), handler: () => this.crearBorradorSimplificada() },
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
      ],
    });
    await alert.present();
  }

  clienteNombre(f: FacturaEmitida): string {
    return f.destinatario.nombre?.trim() || this.transloco.translate('invoices.issued.card.noNameFallback');
  }

  conceptoResumen(f: FacturaEmitida): string {
    return f.concepto?.trim() || this.transloco.translate('invoices.issued.card.noConceptFallback');
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
    if (f.estado === 'borrador') return this.transloco.translate('invoices.issued.tabs.draftSingular');
    return this.estadoAeatLabel(f);
  }

  // Para el estado vacío ("No hay facturas en estado X"): usa la etiqueta ya traducida de
  // la pestaña activa en vez del código interno crudo ('borrador'/'contabilizada'/'firmada').
  estadoActualLabel(): string {
    switch (this.estado) {
      case 'borrador': return this.transloco.translate('invoices.issued.tabs.draft');
      case 'contabilizada': return this.transloco.translate('invoices.issued.tabs.posted');
      case 'firmada': return this.transloco.translate('invoices.issued.tabs.signed');
    }
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

  // Bug real encontrado en revision (2026-09-02): la lista ofrecia Firmar sobre una factura ya
  // ANULADA — no tiene sentido fiscal firmar el documento de una factura dada de baja, y el
  // backend tampoco lo impide hoy. Misma regla que puedeFirmar en factura-detalle.page.ts.
  puedeFirmar(f: FacturaEmitida): boolean {
    return f.estado === 'contabilizada' && !f.esSimplificada && !f.anulada;
  }

  accionesPermitidas(f: FacturaEmitida): AccionesPermitidas {
    return this.invoicesRepo.accionesPermitidas(f);
  }

  async duplicar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    try {
      const copia = await this.invoicesRepo.duplicar(f.id);
      if (!copia) return;
      await this.refresh();
      await this.showToast(this.transloco.translate('invoices.issued.duplicate.success', { nuevo: copia.numFactura, original: f.numFactura }));
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
  // usando el documento simulado; contabilizada/firmada ya tienen el PDF real generado y
  // publicado en Blob Storage al contabilizar (2026-08-27).
  // Estabilización post-demo (2026-08-28): un botón "Descargar" por estado, sin uno aparte
  // para el .xsig (confundía con un icono de seguridad genérico) -- firmada descarga el .xsig
  // (el documento legalmente vigente a partir de ahí), contabilizada descarga el PDF. Compartir
  // sigue mandando siempre el PDF (legible), sea cual sea el estado -- lo que se comparte con un
  // cliente es el documento humano, no el XML firmado.
  async descargar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    if (f.estado === 'firmada') {
      if (!f.tieneXsig) {
        await this.showToast(this.transloco.translate('invoices.issued.download.xsigNotReady'), 'danger');
        return;
      }
      try {
        const blob = await this.invoicesRepo.obtenerXsigReal(f.id);
        descargarBlob(blob, `Factura-${f.numFactura}.xsig`);
        await this.showToast(this.transloco.translate('invoices.issued.download.xsigSuccess'));
      } catch {
        await this.showToast(this.transloco.translate('invoices.issued.download.error'), 'danger');
      }
      return;
    }
    if (f.estado !== 'borrador' && !f.tienePdf) {
      await this.showToast(this.transloco.translate('invoices.issued.download.pdfNotReady'), 'danger');
      return;
    }
    try {
      if (f.estado === 'borrador') {
        const { blob, nombre } = await this.invoicesRepo.generarDocumento(f.id);
        descargarBlob(blob, nombre);
        await this.showToast(this.transloco.translate('invoices.issued.download.success'));
      } else {
        const blob = await this.invoicesRepo.obtenerPdfReal(f.id);
        descargarBlob(blob, `Factura-${f.numFactura}.pdf`);
        await this.showToast(this.transloco.translate('invoices.issued.download.successReal'));
      }
    } catch {
      await this.showToast(this.transloco.translate('invoices.issued.download.error'), 'danger');
    }
  }

  // Mismo criterio que descargar() (2026-08-27): comparte el PDF real ya contabilizado/
  // firmado, no el simulado -- antes compartir() nunca se había actualizado y seguía
  // mandando siempre el documento de mentira, aunque la factura ya fuera real.
  async compartir(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    if (f.estado !== 'borrador' && !f.tienePdf) {
      await this.showToast(this.transloco.translate('invoices.issued.download.pdfNotReady'), 'danger');
      return;
    }
    try {
      if (f.estado === 'borrador') {
        const { blob, nombre } = await this.invoicesRepo.generarDocumento(f.id);
        await compartirBlob(blob, nombre);
      } else {
        const blob = await this.invoicesRepo.obtenerPdfReal(f.id);
        await compartirBlob(blob, `Factura-${f.numFactura}.pdf`);
      }
    } catch {
      await this.showToast(this.transloco.translate('invoices.issued.share.error'), 'danger');
    }
  }

  async confirmarEliminar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    const { confirmado } = await pedirConfirmacion(this.alertCtrl, {
      header: this.transloco.translate('invoices.issued.deleteDraft.header'),
      message: this.transloco.translate('invoices.issued.deleteDraft.message', { num: f.numFactura, cliente: f.destinatario.nombre }),
      textoCancelar: this.transloco.translate('common.actions.cancel'),
      textoConfirmar: this.transloco.translate('common.actions.delete'),
      rolConfirmar: 'destructive',
    });
    if (!confirmado) return;

    try {
      // Un borrador puramente local (nunca guardado de verdad) todavia no ha consumido ningun
      // numero fiscal — se descarta sin llamar al backend en absoluto, en vez de depender de que
      // eliminar() reciba un 404 para caer al mismo sitio.
      if (f.esBorradorLocal) {
        await this.invoicesRepo.descartarLocal(f.id);
      } else {
        await this.invoicesRepo.eliminar(f.id);
      }
      await this.refresh();
      await this.showToast(this.transloco.translate('invoices.issued.deleteDraft.success'));
    } catch (e: any) {
      await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.deleteDraft.error'), 'danger');
    }
  }

  // Fase 7 del plan de integración (2026-08-21): llama de verdad a FacturaE/AEAT — deja de ser
  // una simulación. Mismo criterio de manejo de errores que confirmarEliminar: si falla, se
  // muestra el motivo y no se refresca (la factura no ha cambiado de estado).
  async confirmarContabilizar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    if (this.procesandoAeatIds.has(f.id)) return;
    const { confirmado } = await pedirConfirmacion(this.alertCtrl, {
      header: this.transloco.translate('invoices.issued.post.header'),
      message: this.transloco.translate('invoices.issued.post.message', { cliente: f.destinatario.nombre, importe: this.formatEuros(this.totalFactura(f)) }),
      textoCancelar: this.transloco.translate('common.actions.cancel'),
      textoConfirmar: this.transloco.translate('invoices.issued.actions.post'),
    });
    if (!confirmado || this.procesandoAeatIds.has(f.id)) return;

    this.procesandoAeatIds.add(f.id);
    try {
      await this.invoicesRepo.contabilizar(f.id);
      await this.refresh();
      await this.showToast(this.transloco.translate('invoices.issued.post.success', { cliente: f.destinatario.nombre }));
    } catch (e: any) {
      if (this.esCreditosAgotados(e)) {
        await this.mostrarAvisoCreditosAgotados();
      } else {
        await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.post.error'), 'danger');
      }
    } finally {
      this.procesandoAeatIds.delete(f.id);
    }
  }

  async confirmarFirmar(event: Event, f: FacturaEmitida) {
    event.stopPropagation();
    if (this.procesandoAeatIds.has(f.id)) return;
    const { confirmado } = await pedirConfirmacion(this.alertCtrl, {
      header: this.transloco.translate('invoices.issued.sign.header'),
      message: this.transloco.translate('invoices.issued.sign.message', { cliente: f.destinatario.nombre }),
      textoCancelar: this.transloco.translate('common.actions.cancel'),
      textoConfirmar: this.transloco.translate('invoices.issued.actions.sign'),
    });
    if (!confirmado || this.procesandoAeatIds.has(f.id)) return;

    this.procesandoAeatIds.add(f.id);
    try {
      await this.invoicesRepo.firmar(f.id);
      await this.refresh();
      await this.showToast(this.transloco.translate('invoices.issued.sign.success', { cliente: f.destinatario.nombre }));
    } catch (e: any) {
      if (this.esCreditosAgotados(e)) {
        await this.mostrarAvisoCreditosAgotados();
      } else {
        await this.showToast(e?.message ?? this.transloco.translate('invoices.issued.sign.error'), 'danger');
      }
    } finally {
      this.procesandoAeatIds.delete(f.id);
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color });
    await toast.present();
  }

  // Backend: FacturaEmitidaController devuelve HTTP 402 con code: "OCR_CREDITS_EXHAUSTED"
  // (Contabilizar y Firmar, mismo código que en Recibidas) cuando la empresa está sujeta a
  // control de créditos (ver PagosOptions.EmpresasControlCreditos) y no le queda saldo. El
  // 402 basta por sí solo para identificarlo — a día de hoy es el único caso que lo usa.
  private esCreditosAgotados(e: unknown): boolean {
    return e instanceof Error && /^HTTP 402\b/.test(e.message);
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

  formatEuros(v: number): string {
    return formatEurosUtil(v);
  }

  formatFecha(f: string): string {
    return formatFechaUtil(f);
  }
}
