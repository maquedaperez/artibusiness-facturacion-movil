import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';

import {
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonText,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { duracionDeToast } from '../../shared/utils/duracion-de-toast';

@Component({
  selector: 'app-forgot-password',
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
    IonSpinner,
  ],
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
})
export class ForgotPasswordPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private tenant = inject(TenantService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);
  private toastCtrl = inject(ToastController);

  submitted = false;
  enviando = false;

  form = this.fb.group({
    identifier: ['', Validators.required],
  });

  async submit() {
    if (this.enviando) return;
    this.submitted = true;
    if (this.form.invalid) return;

    const identifier = this.form.value.identifier!;

    this.enviando = true;
    try {
      const tenantKey = (await this.tenant.getTenantKey())?.trim();
      if (!tenantKey) {
        await this.router.navigateByUrl('/setup', { replaceUrl: true });
        return;
      }

      await this.auth.forgotPassword(tenantKey, identifier);

      await this.mostrarAviso(this.transloco.translate('auth.forgotPassword.successAlert'), 'success');
    } catch {
      await this.mostrarAviso(this.transloco.translate('auth.forgotPassword.errorAlert'), 'danger');
    } finally {
      this.enviando = false;
    }
  }

  // Era el único sitio de la app con el alert() del navegador: un cuadro del sistema, con el
  // dominio escrito encima, que no se parece a ningún otro aviso de la aplicación.
  private async mostrarAviso(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: duracionDeToast(message),
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
