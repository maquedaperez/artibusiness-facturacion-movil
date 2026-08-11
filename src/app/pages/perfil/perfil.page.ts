import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AuthService, User } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';
import { MockFacturasService, EmisorFiscal } from '../../services/mock-facturas.service';

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
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline } from 'ionicons/icons';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [
    CommonModule,
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
  ],
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
})
export class PerfilPage {
  user: User | null = null;
  emisor: EmisorFiscal | null = null;

  constructor(
    private auth: AuthService,
    private tenant: TenantService,
    private mock: MockFacturasService,
    private router: Router,
    private alertCtrl: AlertController
  ) {
    addIcons({ createOutline });
  }

  ionViewWillEnter() {
    this.user = this.auth.getUser();
    this.emisor = this.mock.getEmisor();
  }

  irADatosEmisor() {
    this.router.navigate(['/app/perfil/emisor']);
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async changeTenant() {
    const alert = await this.alertCtrl.create({
      header: 'Cambiar empresa',
      message: 'Se cerrará la sesión y tendrás que volver a introducir la clave de empresa. ¿Deseas continuar?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Sí, continuar',
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