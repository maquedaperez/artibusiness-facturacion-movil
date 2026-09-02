import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { tenantGuard } from './guards/tenant.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'splash', pathMatch: 'full' },

  {
    path: 'splash',
    loadComponent: () =>
      import('./pages/splash/splash.page').then(m => m.SplashPage),
  },

  {
    path: 'setup',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./pages/setup/setup.page').then(m => m.SetupPage),
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then(m => m.LoginPage),
  },

  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage),
  },

  {
    path: 'mfa',
    loadComponent: () =>
      import('./pages/mfa/mfa.page').then(m => m.MfaPage),
  },

  // Vuelta de Stripe Checkout para el CLIENTE FINAL (StripeConnect:CheckoutSuccessUrl /
  // CheckoutCancelUrl). PÚBLICAS a propósito — sin authGuard ni tenantGuard: quien paga un
  // ticket no tiene cuenta en la app ni clave de empresa, así que cualquier guard aquí lo
  // devolvería al login. Van antes del comodín '**' para que no acaben en el splash.
  {
    path: 'pago/exito',
    data: { resultado: 'exito' },
    loadComponent: () =>
      import('./pages/pago-resultado/pago-resultado.page').then(m => m.PagoResultadoPage),
  },

  {
    path: 'pago/cancelado',
    data: { resultado: 'cancelado' },
    loadComponent: () =>
      import('./pages/pago-resultado/pago-resultado.page').then(m => m.PagoResultadoPage),
  },

  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/tabs/tabs.page').then(m => m.TabsPage),
    children: [
      { path: '', redirectTo: 'emitidas', pathMatch: 'full' },
      {
        path: 'emitidas',
        loadComponent: () =>
          import('./pages/facturas-emitidas/facturas-emitidas.page').then(m => m.FacturasEmitidasPage),
      },
      {
        path: 'emitidas/:id',
        loadComponent: () =>
          import('./pages/factura-detalle/factura-detalle.page').then(m => m.FacturaDetallePage),
      },
      {
        path: 'emitidas/:id/subsanar',
        loadComponent: () =>
          import('./pages/factura-subsanar/factura-subsanar.page').then(m => m.FacturaSubsanarPage),
      },
      {
        path: 'recibidas',
        loadComponent: () =>
          import('./pages/facturas-recibidas/facturas-recibidas.page').then(m => m.FacturasRecibidasPage),
      },
      {
        path: 'recibidas/:id',
        loadComponent: () =>
          import('./pages/factura-recibida-detalle/factura-recibida-detalle.page').then(m => m.FacturaRecibidaDetallePage),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./pages/perfil/perfil.page').then(m => m.PerfilPage),
      },
      {
        path: 'perfil/emisor',
        loadComponent: () =>
          import('./pages/datos-emisor/datos-emisor.page').then(m => m.DatosEmisorPage),
      },
    ],
  },

  { path: '**', redirectTo: 'splash' },
];