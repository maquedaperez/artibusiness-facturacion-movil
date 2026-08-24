import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';
import { Preferences } from '@capacitor/preferences';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

import { IonContent, IonItem, IonInput, IonButton, IonText } from '@ionic/angular/standalone';

const SAVED_USERNAME_KEY = 'saved_username';
const SAVED_PASSWORD_KEY = 'saved_password';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    IonContent,
    IonItem,
    IonInput,
    IonButton,
    IonText,
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private tenant = inject(TenantService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  submitted = false;
  tenantKeyLabel = '';
  errorMsg = '';
  hasBiometrics = false;

  form = this.fb.group({
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(4)]],
  });

async ngOnInit() {
  const cfg = await this.tenant.getTenantConfig();
  this.tenantKeyLabel = cfg?.label ?? (await this.tenant.getTenantKey()) ?? '';

  if (this.auth.isLoggedIn()) {
    await this.router.navigateByUrl('/app/emitidas', { replaceUrl: true });
    return;
  }

  // ✅ Comprobar si viene de logout manual
  const { value: manualLogout } = await Preferences.get({ key: 'manual_logout' });
  if (manualLogout === 'true') {
    await Preferences.remove({ key: 'manual_logout' });
    // Rellenar formulario pero NO lanzar Face ID
    const saved = await this.getSavedCredentials();
    if (saved) this.form.setValue({ username: saved.username, password: saved.password });
    return;
  }

// ✅ Intentar biometría si disponible
  try {
    const info = await BiometricAuth.checkBiometry();
    this.hasBiometrics = info.isAvailable;
    if (this.hasBiometrics) {
      const saved = await this.getSavedCredentials();
      if (saved) {
        await this.loginWithBiometrics(saved.username, saved.password);
      }
      return; // ✅ añadir esto — no seguir al bloque de sin biometría
    }
  } catch {
    this.hasBiometrics = false;
  }

  // ✅ Sin biometría — rellenar formulario
  const saved = await this.getSavedCredentials();
  if (saved) {
    this.form.setValue({ username: saved.username, password: saved.password });
  }

}
  private async getSavedCredentials(): Promise<{ username: string; password: string } | null> {
    const u = await Preferences.get({ key: SAVED_USERNAME_KEY });
    const p = await Preferences.get({ key: SAVED_PASSWORD_KEY });
    if (u.value && p.value) return { username: u.value, password: p.value };
    return null;
  }

  private async loginWithBiometrics(username: string, password: string) {
    try {
      await BiometricAuth.authenticate({
        reason: this.transloco.translate('auth.login.biometricReason'),
        cancelTitle: this.transloco.translate('common.actions.cancel'),
        allowDeviceCredential: true,
      });

      this.form.setValue({ username, password });
      await this.doLogin(username, password);
    } catch {
      // Usuario canceló — rellena el formulario igualmente
      this.form.setValue({ username, password });
    }
  }

  async goToSetup() {
    await this.tenant.clearTenantKey();
    await this.router.navigateByUrl('/setup', { replaceUrl: true });
  }

  async submit() {
    this.submitted = true;
    this.errorMsg = '';

    if (this.form.invalid) return;

    const username = this.form.value.username!;
    const password = this.form.value.password!;

    await this.doLogin(username, password);
  }

  private async doLogin(username: string, password: string) {
    const cfg = await this.tenant.getTenantConfig();
    if (!cfg) {
      await this.router.navigateByUrl('/setup', { replaceUrl: true });
      return;
    }

    try {
      const result = await this.auth.login({
        tenantKey: cfg.key,
        company: cfg.company,
        businessUnit: cfg.businessUnit,
        username,
        password,
      });

      // ✅ Login OK → guarda credenciales para próxima vez
      await Preferences.set({ key: SAVED_USERNAME_KEY, value: username });
      await Preferences.set({ key: SAVED_PASSWORD_KEY, value: password });

      if (!result.mfa) {
        await this.router.navigateByUrl('/app', { replaceUrl: true });
        return;
      }

      await this.router.navigate(['/mfa'], {
        queryParams: {
          c: result.challengeId,
          e: result.maskedEmail,
          x: result.expiresAt,
          u: result.username,
        },
        replaceUrl: true,
      });

    } catch (e: any) {
      console.error('[LOGIN] ERROR', e);
      const msg = String(e?.message ?? '');
      if (msg.includes('401')) {
        this.errorMsg = this.transloco.translate('auth.login.errorInvalidCredentials');
      } else if (msg.includes('400')) {
        this.errorMsg = this.transloco.translate('auth.login.errorBadRequest');
      } else if (msg.includes('500')) {
        this.errorMsg = this.transloco.translate('auth.login.errorServer');
      } else {
        this.errorMsg = this.transloco.translate('auth.login.errorGeneric');
      }
    }
  }
}