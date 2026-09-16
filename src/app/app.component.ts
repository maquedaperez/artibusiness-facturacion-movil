import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { App, AppState } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { TranslocoService } from '@jsverse/transloco';
import { AuthService } from './services/auth.service';
import { configurarTraductorDeErrores } from './shared/utils/mensaje-de-error';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  private appStateListener?: PluginListenerHandle;

  constructor() {
    // Un único registro para toda la app: ver configurarTraductorDeErrores.
    configurarTraductorDeErrores((clave, params) => this.transloco.translate(clave, params));
  }

  async ngOnInit() {
    this.appStateListener = await App.addListener('appStateChange', (state: AppState) => {
      const currentUrl = this.router.url;
      const inAuthFlow = currentUrl.startsWith('/login') || currentUrl.startsWith('/mfa') || currentUrl.startsWith('/setup');
      if (state.isActive && !this.auth.isLoggedIn() && !inAuthFlow) {
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    });
  }

  async ngOnDestroy() {
    configurarTraductorDeErrores(null);
    await this.appStateListener?.remove();
  }
}