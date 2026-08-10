import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  router.navigateByUrl('/login', { replaceUrl: true });
  return false;
};

/*
DECIDIR DI MOSTRAR SETUP O LOGIN AL ARRANCAR

const tenant = await this.tenant.getTenantKey();
if (!tenant) this.router.navigateByUrl('/setup', { replaceUrl: true });
else this.router.navigateByUrl('/login', { replaceUrl: true });
*/