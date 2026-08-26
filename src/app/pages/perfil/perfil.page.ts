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
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private languageService = inject(LanguageService);
  private transloco = inject(TranslocoService);
  private pagosService = inject(PagosService);

  user: User | null = null;
  emisor: EmisorFiscal | null = null;

  estadoPagos: EstadoPagos | null = null;
  cargandoPagos = true;
  errorPagos = false;
  abriendoPortal = false;

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
