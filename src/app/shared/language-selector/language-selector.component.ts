import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

import { LanguageService, IdiomaSoportado, IDIOMAS_SOPORTADOS } from '../../core/i18n/language.service';

// Selector de idioma para pantallas previas al login (Configuración inicial, Login) —
// alguien que no lea español todavía tiene que poder cambiar de idioma ANTES de entender
// el resto de la pantalla. Reutiliza LanguageService.cambiarIdioma() (mismo mecanismo que
// ya usa Perfil): persiste la preferencia y no depende de haber iniciado sesión.
//
// Banderas dibujadas como SVG inline (no emoji): en Windows los emoji de bandera
// (🇪🇸🇬🇧🇺🇦) no tienen glifo de bandera en la fuente del sistema y se ven como texto plano
// ("ES"/"GB"/"UA") en vez de la banderita — confirmado 2026-08-25 en captura real del
// usuario. El SVG se ve igual en cualquier plataforma.
@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  template: `
    <div class="selector-idioma" role="group" aria-label="Idioma / Language / Мова">
      <button
        type="button"
        *ngFor="let idioma of idiomas"
        class="bandera-btn"
        [class.activa]="idioma === idiomaActual"
        [attr.aria-pressed]="idioma === idiomaActual"
        [attr.aria-label]="'common.languages.' + idioma | transloco"
        (click)="seleccionar(idioma)"
      >
        <svg *ngIf="idioma === 'es'" viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" class="bandera-svg">
          <rect width="3" height="2" fill="#AA151B"/>
          <rect y="0.5" width="3" height="1" fill="#F1BF00"/>
        </svg>
        <svg *ngIf="idioma === 'en'" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" class="bandera-svg">
          <rect width="60" height="30" fill="#012169"/>
          <path d="M0,0 60,30 M60,0 0,30" stroke="#FFF" stroke-width="6"/>
          <path d="M0,0 60,30 M60,0 0,30" stroke="#C8102E" stroke-width="2"/>
          <path d="M30,0 V30 M0,15 H60" stroke="#FFF" stroke-width="10"/>
          <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/>
        </svg>
        <svg *ngIf="idioma === 'uk'" viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" class="bandera-svg">
          <rect width="3" height="1" fill="#005BBB"/>
          <rect y="1" width="3" height="1" fill="#FFD500"/>
        </svg>
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      margin-top: 32px;
      margin-bottom: 1cm;
    }
    .selector-idioma {
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .bandera-btn {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: var(--ion-color-step-100, #f0f0f0);
      overflow: hidden;
      padding: 0;
      cursor: pointer;
      transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .bandera-svg {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
    .bandera-btn:hover { transform: translateY(-1px); }
    .bandera-btn:focus-visible { outline: 2px solid var(--ion-color-primary, #3880ff); outline-offset: 2px; }
    .bandera-btn.activa {
      border-color: var(--ion-color-primary, #3880ff);
      box-shadow: 0 0 0 3px rgba(56, 128, 255, .15);
    }
  `],
})
export class LanguageSelectorComponent {
  private languageService = inject(LanguageService);

  readonly idiomas = IDIOMAS_SOPORTADOS;

  get idiomaActual(): IdiomaSoportado {
    return this.languageService.idiomaActual;
  }

  async seleccionar(idioma: IdiomaSoportado) {
    if (idioma === this.idiomaActual) return;
    await this.languageService.cambiarIdioma(idioma);
  }
}
