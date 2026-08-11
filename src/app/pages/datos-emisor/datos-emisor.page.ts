import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonItem, IonInput, IonRadioGroup, IonRadio, IonText, IonChip, IonLabel,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, documentTextOutline } from 'ionicons/icons';

import { MockFacturasService, EmisorFiscal } from '../../services/mock-facturas.service';

@Component({
  selector: 'app-datos-emisor',
  templateUrl: './datos-emisor.page.html',
  styleUrls: ['./datos-emisor.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonItem, IonInput, IonRadioGroup, IonRadio, IonText, IonChip, IonLabel,
  ],
})
export class DatosEmisorPage implements OnInit {
  private mock = inject(MockFacturasService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  emisor: EmisorFiscal = {
    esEmpresa: true, nombre: '', nif: '', direccion: '', poblacion: '', cp: '', provincia: '',
    registroMercantil: '', cnae: '', iban: '', swift: '',
  };
  errorMsg = '';

  constructor() {
    addIcons({ arrowBackOutline, documentTextOutline });
  }

  ngOnInit() {
    this.emisor = this.mock.getEmisor();
  }

  async guardar() {
    this.errorMsg = '';
    if (!this.emisor.nombre.trim() || !this.emisor.nif.trim()) {
      this.errorMsg = 'Nombre/razón social y NIF/CIF son obligatorios.';
      return;
    }

    this.mock.actualizarEmisor(this.emisor);

    const toast = await this.toastCtrl.create({
      message: 'Datos fiscales guardados.',
      duration: 2000,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }

  volver() {
    this.router.navigateByUrl('/app/perfil', { replaceUrl: true });
  }
}
