import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonCard, IonCardContent, IonText, IonBadge, IonChip, IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, documentTextOutline } from 'ionicons/icons';

import { MockFacturasService, FacturaRecibida } from '../../services/mock-facturas.service';

@Component({
  selector: 'app-factura-recibida-detalle',
  templateUrl: './factura-recibida-detalle.page.html',
  styleUrls: ['./factura-recibida-detalle.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonCard, IonCardContent, IonText, IonBadge, IonChip, IonLabel,
  ],
})
export class FacturaRecibidaDetallePage implements OnInit {
  factura: FacturaRecibida | null = null;
  errorMsg = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mock: MockFacturasService,
  ) {
    addIcons({ arrowBackOutline, documentTextOutline });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const factura = this.mock.getFacturaRecibidaById(id);
    if (!factura) {
      this.errorMsg = 'Factura no encontrada.';
      return;
    }
    this.factura = factura;
  }

  volver() {
    this.router.navigateByUrl('/app/recibidas', { replaceUrl: true });
  }

  formatEuros(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }

  formatFecha(f: string): string {
    const d = new Date(`${f}T00:00:00`);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
}
