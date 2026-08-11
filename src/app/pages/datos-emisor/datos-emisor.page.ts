import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonItem, IonInput, IonRadioGroup, IonRadio, IonText,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, documentTextOutline } from 'ionicons/icons';

import { EmisorContactoEditable, EmisorFiscal } from '../../services/mock-facturas.service';
import { EmisorRepository } from '../../core/ports';
import { DemoBannerComponent } from '../../shared/demo-banner/demo-banner.component';

@Component({
  selector: 'app-datos-emisor',
  templateUrl: './datos-emisor.page.html',
  styleUrls: ['./datos-emisor.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonItem, IonInput, IonRadioGroup, IonRadio, IonText,
    DemoBannerComponent,
  ],
})
export class DatosEmisorPage implements OnInit {
  private emisorRepo = inject(EmisorRepository);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  emisor: EmisorFiscal = {
    esEmpresa: true, nombre: '', nif: '', direccion: '', poblacion: '', cp: '', provincia: '',
    telefono: '', registroMercantil: '', cnae: '', iban: '', swift: '',
  };
  errorMsg = '';

  constructor() {
    addIcons({ arrowBackOutline, documentTextOutline });
  }

  ngOnInit() {
    this.emisor = this.emisorRepo.getEmisor();
  }

  private telefonoValido(telefono: string): boolean {
    const t = telefono.trim();
    if (!t) return true; // opcional
    // Admite formatos internacionales legítimos: dígitos, espacios, guiones,
    // paréntesis y un + inicial opcional — no exige el formato español concreto.
    return /^\+?[0-9()\-\s]{6,20}$/.test(t) && /\d{6,}/.test(t.replace(/\D/g, ''));
  }

  async guardar() {
    this.errorMsg = '';

    if (!this.emisor.direccion.trim() || !this.emisor.poblacion.trim() || !this.emisor.cp.trim() || !this.emisor.provincia.trim()) {
      this.errorMsg = 'Dirección, población, código postal y provincia son obligatorios.';
      return;
    }

    if (!this.telefonoValido(this.emisor.telefono)) {
      this.errorMsg = 'El teléfono no tiene un formato válido.';
      return;
    }

    // Payload construido explícitamente con solo los campos de contacto — aunque
    // "emisor" tenga nombre/nif en memoria (llegaron de getEmisor), nunca viajan
    // de vuelta en la actualización.
    const payload: EmisorContactoEditable = {
      direccion: this.emisor.direccion,
      poblacion: this.emisor.poblacion,
      cp: this.emisor.cp,
      provincia: this.emisor.provincia,
      telefono: this.emisor.telefono,
    };
    this.emisorRepo.actualizarEmisor(payload);

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
