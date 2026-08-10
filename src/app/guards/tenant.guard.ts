import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { TenantService } from '../services/tenant.service';

export const tenantGuard: CanActivateFn = async () => {
  const tenant = inject(TenantService);
  const router = inject(Router);

  const key = await tenant.getTenantKey();
  if (key) {
    await router.navigateByUrl('/login', { replaceUrl: true });
    return false;
  }
  return true;
};
