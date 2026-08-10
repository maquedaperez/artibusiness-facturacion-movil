import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

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
  submitted = false;

  form = this.fb.group({
    identifier: ['', Validators.required],
  });

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private tenant: TenantService,
    private router: Router
  ) {}

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

      alert('Si el usuario existe, se enviarán las instrucciones.');
    } catch {
      alert('No se pudo enviar la solicitud.');
    }
  }
}
