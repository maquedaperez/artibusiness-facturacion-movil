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
        path: 'recibidas',
        loadComponent: () =>
          import('./pages/facturas-recibidas/facturas-recibidas.page').then(m => m.FacturasRecibidasPage),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./pages/perfil/perfil.page').then(m => m.PerfilPage),
      },
    ],
  },

  { path: '**', redirectTo: 'splash' },
];