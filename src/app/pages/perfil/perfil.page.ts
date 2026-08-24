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

  user: User | null = null;
  emisor: EmisorFiscal | null = null;

  constructor() {
    addIcons({ chevronForwardOutline });
  }

  ionViewWillEnter() {
    this.user = this.auth.getUser();
    this.emisor = this.emisorRepo.getEmisor();
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
    // 'perfil.*' que ya usa el resto de la pantalla, sin duplicar claves.
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('perfil.cambiarEmpresa'),
      message: this.transloco.translate('perfil.alertaCambiarEmpresaMensaje'),
      buttons: [
        { text: this.transloco.translate('perfil.cancelar'), role: 'cancel' },
        {
          text: this.transloco.translate('perfil.siContinuar'),
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
