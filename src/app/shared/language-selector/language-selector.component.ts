import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

import { LanguageService, IdiomaSoportado, IDIOMAS_SOPORTADOS } from '../../core/i18n/language.service';

const BANDERAS: Record<IdiomaSoportado, string> = { es: '🇪🇸', en: '🇬🇧', uk: '🇺🇦' };

// Selector de idioma para pantallas previas al login (Configuración inicial, Login) —
// alguien que no lea español todavía tiene que poder cambiar de idioma ANTES de entender
// el resto de la pantalla. Reutiliza LanguageService.cambiarIdioma() (mismo mecanismo que
// ya usa Perfil): persiste la preferencia y no depende de haber iniciado sesión.
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
      >{{ banderas[idioma] }}</button>
    </div>
  `,
  styles: [`
    .selector-idioma {
      display: flex;
      justify-content: center;
      gap: 14px;
    }
    .bandera-btn {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: var(--ion-color-step-100, #f0f0f0);
      font-size: 24px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
      transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
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
  readonly banderas = BANDERAS;

  get idiomaActual(): IdiomaSoportado {
    return this.languageService.idiomaActual;
  }

  async seleccionar(idioma: IdiomaSoportado) {
    if (idioma === this.idiomaActual) return;
    await this.languageService.cambiarIdioma(idioma);
  }
}
