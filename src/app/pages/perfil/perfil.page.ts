import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService, User } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';
import { EmisorFiscal } from '../../services/mock-facturas.service';
import { EmisorRepository } from '../../core/ports';
import { LanguageService, IdiomaSoportado } from '../../core/i18n/language.service';
import { PagosService, EstadoPagos } from '../../services/pagos.service';
import { PagosConnectService, EstadoPagosConnect } from '../../services/pagos-connect.service';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonFooter,
  IonToolbar,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonText,
  IonIcon,
  IonItem,
  IonSelect,
  IonSelectOption,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline } from 'ionicons/icons';
import { DATOS_EMISOR_DISPONIBLES } from '../../core/providers/funcionalidades-pendientes';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoPipe,
    IonContent,
    IonHeader,
    IonTitle,
    IonFooter,
    IonToolbar,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonText,
    IonIcon,
    IonItem,
    IonSelect,
    IonSelectOption,
  ],
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
})
export class PerfilPage {
  private auth = inject(AuthService);
  private tenant = inject(TenantService);
  private emisorRepo = inject(EmisorRepository);

  // Ver funcionalidades-pendientes.ts: la ficha de emisor todavia sale del mock.
  readonly datosEmisorDisponibles = DATOS_EMISOR_DISPONIBLES;
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private languageService = inject(LanguageService);
  private transloco = inject(TranslocoService);
  private pagosService = inject(PagosService);
  private pagosConnectService = inject(PagosConnectService);

  user: User | null = null;
  emisor: EmisorFiscal | null = null;

  estadoPagos: EstadoPagos | null = null;
  cargandoPagos = true;
  errorPagos = false;
  abriendoPortal = false;

  // Stripe Connect (Fase 3, 2026-09-02) — cobro de tickets a los clientes finales. Mismo
  // criterio que el botón "Cobrar con tarjeta" de factura-detalle.page.ts: NUNCA se muestra
  // nada de esto sin haber confirmado antes que el módulo responde de verdad — mientras
  // StripeConnect:Enabled=false (todo el MVP), el endpoint de estado da 503 y esta sección
  // completa permanece oculta, nunca aparece un botón que fuera a fallar al pulsarlo.
  estadoConnect: EstadoPagosConnect | null = null;
  moduloConnectDisponible = false;
  cargandoConnect = true;
  conectandoStripe = false;

  constructor() {
    addIcons({ chevronForwardOutline });
  }

  ionViewWillEnter() {
    this.user = this.auth.getUser();
    this.emisor = this.emisorRepo.getEmisor();
    // Refresco al volver del portal (decisión cerrada 2026-08-27: basta con que el usuario
    // vuelva manualmente a la app para la demo, sin Universal Links) — ionViewWillEnter ya se
    // dispara cada vez que se reentra a esta pestaña, así que no hace falta ningún mecanismo
    // adicional de "detectar la vuelta".
    this.cargarEstadoPagos();
    this.cargarEstadoConnect();
  }

  private async cargarEstadoPagos() {
    this.cargandoPagos = true;
    this.errorPagos = false;
    try {
      this.estadoPagos = await this.pagosService.obtenerEstado();
    } catch {
      this.errorPagos = true;
    } finally {
      this.cargandoPagos = false;
    }
  }

  private async cargarEstadoConnect() {
    this.cargandoConnect = true;
    try {
      this.estadoConnect = await this.pagosConnectService.obtenerEstado();
      this.moduloConnectDisponible = true;
    } catch {
      // 503 (StripeConnect:Enabled=false) o cualquier otro fallo: se trata igual, la sección
      // entera se oculta en vez de mostrar un error — su ausencia es el estado normal del MVP.
      this.moduloConnectDisponible = false;
    } finally {
      this.cargandoConnect = false;
    }
  }

  // Crea o retoma el onboarding de Stripe Express para esta empresa y redirige. Silencioso ante
  // un fallo, mismo criterio que conseguirMasCreditos(): un botón secundario de Perfil no debe
  // mostrar un error alarmante si el módulo está a medio configurar.
  async conectarStripe() {
    if (this.conectandoStripe) return;
    this.conectandoStripe = true;
    try {
      const url = await this.pagosConnectService.iniciarOnboarding();
      this.pagosConnectService.abrirOnboarding(url);
    } catch {
      // Silencioso a propósito, ver comentario de arriba.
    } finally {
      this.conectandoStripe = false;
    }
  }

  async conseguirMasCreditos() {
    if (this.abriendoPortal) return;
    this.abriendoPortal = true;
    try {
      const url = await this.pagosService.obtenerUrlAccesoPortal();
      this.pagosService.abrirPortalDePagos(url);
    } catch {
      // Silencioso a propósito para el MVP de demo: si el módulo de pagos está desactivado
      // (Stripe:Enabled=false) o falla la llamada, no tiene sentido mostrar un error alarmante
      // por un botón secundario — el usuario simplemente no ve reflejado ningún cambio.
    } finally {
      this.abriendoPortal = false;
    }
  }

  get idiomaActual(): IdiomaSoportado {
    return this.languageService.idiomaActual;
  }

  get idiomasSoportados(): readonly IdiomaSoportado[] {
    return this.languageService.idiomasSoportados;
  }

  async cambiarIdioma(idioma: IdiomaSoportado) {
    await this.languageService.cambiarIdioma(idioma);
  }

  irADatosEmisor() {
    this.router.navigate(['/app/perfil/emisor']);
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async changeTenant() {
    // Los textos del alert se resuelven con transloco.translate() (no un pipe: no hay
    // template Angular dentro de las opciones de AlertController) — mismo namespace
    // 'profile.*'/'common.actions.*' que ya usa el resto de la app, sin duplicar claves.
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('profile.changeCompany'),
      message: this.transloco.translate('profile.changeCompanyConfirm'),
      buttons: [
        { text: this.transloco.translate('common.actions.cancel'), role: 'cancel' },
        {
          text: this.transloco.translate('common.actions.yesContinue'),
          role: 'destructive',
          handler: async () => {
            await this.tenant.clearTenantKey();
            this.auth.logout();
            await this.router.navigateByUrl('/setup', { replaceUrl: true });
          },
        },
      ],
    });
    await alert.present();
  }
}
