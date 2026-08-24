import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  IonContent, IonHeader, IonTitle, IonToolbar,
  IonItem, IonInput, IonButton, IonText
} from '@ionic/angular/standalone';

import { TenantService } from '../../services/tenant.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoPipe,
    IonContent, IonHeader, IonTitle, IonToolbar,
    IonItem, IonInput, IonButton, IonText
  ],
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
})
export class SetupPage {
  private fb = inject(FormBuilder);
  private tenant = inject(TenantService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  submitted = false;
  invalidTenant = false;
  loading = false;      
  errorMsg = '';  

  form = this.fb.group({
    tenantKey: ['', [Validators.required, Validators.minLength(3)]],
  });

openLink() {
  window.open('https://www.artisoftware.com/alta-en-el-servicio-facturacion', '_system');
}

async submit() {
  this.submitted = true;
  this.invalidTenant = false;
  this.errorMsg = '';

  if (this.form.invalid) return;

  const key = this.form.value.tenantKey!.trim().toLowerCase();

  this.loading = true;
  try {
    const valid = await this.tenant.isTenantKeyValid(key);
    if (!valid) {
      this.invalidTenant = true;
      return;
    }
    await this.tenant.setTenantKey(key);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  } catch (e: any) {
    this.errorMsg = e?.message ?? this.transloco.translate('auth.setup.errorServer');
  } finally {
    this.loading = false;
  }
}
}
