import { Component, OnDestroy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../../services/auth.service';

import { IonContent, IonItem, IonInput, IonButton, IonText, IonSpinner } from '@ionic/angular/standalone';

@Component({
  selector: 'app-mfa',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, IonContent, IonItem, IonInput, IonButton, IonText, IonSpinner],
  templateUrl: './mfa.page.html',
  styleUrls: ['./mfa.page.scss'],
})
export class MfaPage implements OnDestroy {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private router = inject(Router);
  private zone = inject(NgZone);
  private transloco = inject(TranslocoService);

  submitted = false;
  errorMsg = '';
  successMsg = '';
  // Verificar y reenviar se bloquean entre sí: reenviar mientras se comprueba un código
  // invalidaría el que se está verificando.
  verificando = false;
  reenviando = false;

  get algoEnCurso(): boolean {
    return this.verificando || this.reenviando;
  }

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
    if (this.algoEnCurso) return;
    this.submitted = true;
    this.errorMsg = '';
    if (this.form.invalid) return;

    this.verificando = true;
    try {
      await this.auth.verifyMfaCode(this.challengeId, this.form.value.code!, this.username);
      await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (e: any) {
      this.errorMsg = this.transloco.translate('auth.mfa.errorInvalidOrExpired');
    } finally {
      this.verificando = false;
    }
  }

  async resend() {
    if (this.algoEnCurso) return;
    this.errorMsg = '';
    this.successMsg = '';
    this.reenviando = true;
    try {
      const result = await this.auth.resendMfaCode(this.username);
      this.expiresAt = result.expiresAt ?? Date.now() + 5 * 60_000;
      this.startTimer();
      this.successMsg = this.transloco.translate('auth.mfa.resendSuccess');
    } catch (e: any) {
      this.errorMsg = this.transloco.translate('auth.mfa.resendError');
    } finally {
      this.reenviando = false;
    }
  }

  async backToLogin() {
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
