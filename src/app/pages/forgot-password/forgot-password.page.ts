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
} from '@ionic/angular/standalone';

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

  submitted = false;

  form = this.fb.group({
    identifier: ['', Validators.required],
  });

  async submit() {
    this.submitted = true;
    if (this.form.invalid) return;

    const identifier = this.form.value.identifier!;

    try {
      const tenantKey = (await this.tenant.getTenantKey())?.trim();
      if (!tenantKey) {
        await this.router.navigateByUrl('/setup', { replaceUrl: true });
        return;
      }

      await this.auth.forgotPassword(tenantKey, identifier);

      alert(this.transloco.translate('auth.forgotPassword.successAlert'));
    } catch {
      alert(this.transloco.translate('auth.forgotPassword.errorAlert'));
    }
  }
}
