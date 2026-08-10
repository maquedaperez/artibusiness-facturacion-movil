import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { App, AppState } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit, OnDestroy {
  private appStateListener?: PluginListenerHandle;

  constructor(private auth: AuthService, private router: Router) {}

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
    await this.appStateListener?.remove();
  }
}