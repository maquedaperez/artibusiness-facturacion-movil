import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

import { EmisorFiscal } from '../../services/mock-facturas.service';
import { EmisorRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';

@Component({
  selector: 'app-datos-emisor',
  templateUrl: './datos-emisor.page.html',
  styleUrls: ['./datos-emisor.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    TranslocoPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonText,
    DemoBannerComponent,
  ],
})
export class DatosEmisorPage implements OnInit {
  private emisorRepo = inject(EmisorRepository);
  private router = inject(Router);

  emisor: EmisorFiscal = {
    esEmpresa: true, nombre: '', nif: '', direccion: '', poblacion: '', cp: '', provincia: '',
    telefono: '', registroMercantil: '', cnae: '', iban: '', swift: '',
  };

  constructor() {
    addIcons({ arrowBackOutline });
  }

  ngOnInit() {
    this.emisor = this.emisorRepo.getEmisor();
  }

  volver() {
    this.router.navigateByUrl('/app/perfil', { replaceUrl: true });
  }
}
