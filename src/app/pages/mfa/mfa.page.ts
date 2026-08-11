import { Component, OnDestroy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

import { IonContent, IonItem, IonInput, IonButton, IonText } from '@ionic/angular/standalone';

@Component({
  selector: 'app-mfa',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText],
  templateUrl: './mfa.page.html',
  styleUrls: ['./mfa.page.scss'],
})
export class MfaPage implements OnDestroy {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private router = inject(Router);
  private zone = inject(NgZone);

  submitted = false;
  errorMsg = '';
  successMsg = '';

  challengeId = '';
  maskedEmail = '';
  username = '';

  expiresAt = 0;
  minutesLeftLabel = '';
  private timerId?: number;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  constructor() {
    this.challengeId = this.route.snapshot.queryParamMap.get('c') ?? '';
    this.maskedEmail = this.route.snapshot.queryParamMap.get('e') ?? '';
    this.username = this.route.snapshot.queryParamMap.get('u') ?? '';

    const x = this.route.snapshot.queryParamMap.get('x');
    this.expiresAt = x ? Number(x) : 0;

    // Si no viene expiresAt (porque no hay MFA real), pon 5 min por defecto
    if (!this.expiresAt) this.expiresAt = Date.now() + 5 * 60_000;

    this.startTimer();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private startTimer() {
    this.stopTimer();
    this.updateCountdown();

    this.timerId = window.setInterval(() => {
      this.zone.run(() => this.updateCountdown());
    }, 1000);
  }

  private stopTimer() {
    if (this.timerId != null) {
      clearInterval(this.timerId);
      this.timerId = undefined;
    }
  }

  private updateCountdown() {
    const msLeft = Math.max(0, this.expiresAt - Date.now());
    const min = Math.floor(msLeft / 60000);
    const sec = Math.floor((msLeft % 60000) / 1000);

    this.minutesLeftLabel = `${min}:${String(sec).padStart(2, '0')}`;

    if (msLeft <= 0) this.stopTimer();
  }

  async submit() {
    this.submitted = true;
    this.errorMsg = '';
    if (this.form.invalid) return;

    try {
      await this.auth.verifyMfaCode(this.challengeId, this.form.value.code!, this.username);
      await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (e: any) {
      this.errorMsg = 'Código incorrecto o expirado. Inténtalo de nuevo.';
    }
  }

  async resend() {
    this.errorMsg = '';
    this.successMsg = '';
    try {
      const result = await this.auth.resendMfaCode(this.username);
      this.expiresAt = result.expiresAt ?? Date.now() + 5 * 60_000;
      this.startTimer();
      this.successMsg = 'Código reenviado correctamente.';
    } catch (e: any) {
      this.errorMsg = 'No se pudo reenviar el código. Inténtalo de nuevo.';
    }
  }

  async backToLogin() {
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
