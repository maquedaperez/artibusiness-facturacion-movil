import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonContent, IonIcon, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, alertCircleOutline } from 'ionicons/icons';

export type ResultadoPago = 'exito' | 'cancelado';

// Pantalla PÚBLICA (sin authGuard) a la que Stripe Checkout devuelve al CLIENTE FINAL tras
// pagar o cancelar un ticket — configurada en StripeConnect:CheckoutSuccessUrl /
// CheckoutCancelUrl. Es la única pantalla de esta app pensada para alguien que NO tiene cuenta:
// sin ella, Stripe devolvía a '/', que cae en el splash y acaba en /setup o /login — un cliente
// que acaba de pagar veía la pantalla de configuración de una app de facturación ajena y podía
// pensar que el pago había fallado.
//
// Deliberadamente informativa y sin salidas: no ofrece ningún enlace a la app (el cliente no
// tiene nada que hacer dentro) y NUNCA afirma por sí sola que el cobro esté confirmado en
// nuestro sistema — la confirmación real llega por el webhook de Stripe, no por este redirect
// (que además puede no llegar nunca si el cliente cierra el navegador antes).
@Component({
  selector: 'app-pago-resultado',
  templateUrl: './pago-resultado.page.html',
  styleUrls: ['./pago-resultado.page.scss'],
  standalone: true,
  imports: [CommonModule, TranslocoPipe, IonContent, IonIcon, IonText],
})
export class PagoResultadoPage implements OnInit {
  private route = inject(ActivatedRoute);

  resultado: ResultadoPago = 'exito';

  constructor() {
    addIcons({ checkmarkCircleOutline, alertCircleOutline });
  }

  ngOnInit() {
    // Lo fija la propia ruta (data.resultado), no un query param: así no se puede provocar una
    // pantalla de "pago recibido" manipulando la URL.
    this.resultado = this.route.snapshot.data['resultado'] === 'cancelado' ? 'cancelado' : 'exito';
  }

  get esExito(): boolean {
    return this.resultado === 'exito';
  }
}
