import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { TenantService } from '../../services/tenant.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonSpinner, IonContent, CommonModule, FormsModule],
})
export class SplashPage implements OnInit, OnDestroy {
  private tenant = inject(TenantService);
  private auth = inject(AuthService);
  private router = inject(Router);

  private temporizador?: number;

  ngOnInit() {
    this.temporizador = window.setTimeout(() => this.decidirDestino(), 1200);
  }

  ngOnDestroy() {
    // Sin esto, salir de la pantalla antes de que venza el temporizador navegaba igualmente
    // 1,2 s después, por encima de donde estuviera el usuario.
    if (this.temporizador != null) clearTimeout(this.temporizador);
  }

  private async decidirDestino() {
    try {
      if (this.auth.isLoggedIn()) {
        await this.router.navigateByUrl('/app', { replaceUrl: true });
        return;
      }
      const key = (await this.tenant.getTenantKey())?.trim();
      await this.router.navigateByUrl(key ? '/login' : '/setup', { replaceUrl: true });
    } catch {
      // Si leer las preferencias falla (pasa en web con el almacenamiento bloqueado), antes se
      // quedaba AQUÍ PARA SIEMPRE: la promesa se rompía dentro del setTimeout, nadie la
      // recogía y la app no salía nunca del logo. Sin clave no se puede hacer nada más que
      // pedirla, así que se va a /setup.
      await this.router.navigateByUrl('/setup', { replaceUrl: true });
    }
  }
}