import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

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
    IonContent, IonHeader, IonTitle, IonToolbar,
    IonItem, IonInput, IonButton, IonText
  ],
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
})
export class SetupPage {
  submitted = false;
  invalidTenant = false;
  loading = false;      
  errorMsg = '';  

  form = this.fb.group({
    tenantKey: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor(
    private fb: FormBuilder,
    private tenant: TenantService,
    private router: Router
  ) {}

openLink() {
  window.open('https://www.artisoftware.com/artibusiness/artibusiness-rrhh/alta-en-el-servicio/', '_system');
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
    this.errorMsg = e?.message ?? 'Error al conectar con el servidor.';
  } finally {
    this.loading = false;
  }
}
}
