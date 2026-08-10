import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AuthService, User } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';

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
  AlertController,
} from '@ionic/angular/standalone';

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
  ],
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
})
export class PerfilPage {
  user: User | null = null;

  constructor(
    private auth: AuthService,
    private tenant: TenantService,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  ionViewWillEnter() {
    this.user = this.auth.getUser();
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