import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { TenantService } from './tenant.service';
import { Preferences } from '@capacitor/preferences';

export type User = {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  tenantKey?: string;
  company?: number;
  businessUnit?: number;
  expiration?: string;
  empresaNombre?: string; // ✅ nuevo
};

export type LoginRequest = {
  tenantKey: string;
  company: number;
  businessUnit: number;
  username: string;
  password: string;
};

type ApiLoginResponse = {
  token?: string;
  Token?: string;
  expiration?: string;
  Expiration?: string;
  userFirstName?: string;
  UserFirstName?: string;
  userLastName?: string;
  UserLastName?: string;
  userEmail?: string;
  UserEmail?: string;
  userPhone?: string;
  UserPhone?: string;
  userBusinessUnitRelationship?: number;
  employeeId?: number;
  EmployeeId?: number;
  id?: number;
  userCompany?: string;
  UserCompany?: string;
  empresaNombre?: string;
  challengeId?: string;
  ChallengeId?: string;
  maskedEmail?: string;
  MaskedEmail?: string;
  acceso?: string;
};

export type LoginResult =
  | { mfa: false }
  | { mfa: true; challengeId: string; maskedEmail: string; expiresAt: number; username: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'arti_access_token';
  private readonly USER_KEY = 'arti_user';
  private readonly EMPLOYEE_ID_KEY = 'arti_employee_id';
  private readonly SESSION_EXPIRY_KEY = 'arti_session_expiry';
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

  constructor(private api: ApiService, private tenant: TenantService) {}

  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    if (!this.getAccessToken()) return false;
    const expiry = localStorage.getItem(this.SESSION_EXPIRY_KEY);
    if (!expiry) return false;
    if (Date.now() > Number(expiry)) {
      this.logout();
      return false;
    }
    return true;
  }

  getEmployeeId(): number | null {
    const raw = localStorage.getItem(this.EMPLOYEE_ID_KEY);
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num) && num > 0) return num;
    }
    const user = this.getUser();
    if (user?.id) {
      const num = Number(user.id);
      if (!isNaN(num) && num > 0) return num;
    }
    return null;
  }

  getUser(): User | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  }

logout(): void {
  localStorage.removeItem(this.TOKEN_KEY);
  localStorage.removeItem(this.USER_KEY);
  localStorage.removeItem(this.EMPLOYEE_ID_KEY);
  localStorage.removeItem(this.SESSION_EXPIRY_KEY);
  Preferences.set({ key: 'manual_logout', value: 'true' });
}

  async login(req: LoginRequest): Promise<LoginResult> {
    const res = await this.api.post<ApiLoginResponse>('/api/Employees/authenticate', {
      Company: req.company,
      BusinessUnit: req.businessUnit,
      username: req.username,
      password: req.password,
    });

    const token       = res?.token       ?? res?.Token;
    const challengeId = res?.challengeId ?? res?.ChallengeId;
    const maskedEmail = res?.maskedEmail ?? res?.MaskedEmail ?? '';
    const isMfa       = !!challengeId || res?.acceso === 'mfa';

    // ✅ Login directo sin MFA
    if (token) {
      const firstName = res?.userFirstName ?? res?.UserFirstName ?? '';
      const lastName  = res?.userLastName  ?? res?.UserLastName  ?? '';
      const fullName  = `${firstName} ${lastName}`.trim() || 'Usuario';
      const empId     = res?.employeeId    ?? res?.EmployeeId;

      const user: User = {
        id: String(empId),
        name: fullName,
        role: 'Employee',
        email: res?.userEmail ?? res?.UserEmail ?? req.username,
        phone: res?.userPhone ?? res?.UserPhone,
        tenantKey: req.tenantKey,
        company: req.company,
        businessUnit: req.businessUnit,
        expiration: res?.expiration ?? res?.Expiration,
        empresaNombre: res?.userCompany ?? res?.UserCompany ?? res?.empresaNombre ?? '',
      };

      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      localStorage.setItem(this.EMPLOYEE_ID_KEY, String(empId!));
      localStorage.setItem(this.SESSION_EXPIRY_KEY, String(Date.now() + this.SESSION_DURATION_MS));
      return { mfa: false };
    }

    // ✅ MFA requerido
    if (isMfa) {
      return {
        mfa: true,
        challengeId: challengeId ?? '',
        maskedEmail,
        expiresAt: Date.now() + 5 * 60_000,
        username: req.username,
      };
    }

    throw new Error('Login inválido');
  }

  // ✅ Implementación real MFA
  async verifyMfaCode(challengeId: string, code: string, username: string): Promise<void> {
    const cfg = await this.tenant.getTenantConfig();
    if (!cfg) throw new Error('Tenant no configurado');

    const res = await this.api.post<ApiLoginResponse>('/api/Employees/authenticatemfa', {
      Company: cfg.company,
      BusinessUnit: cfg.businessUnit,
      username,
      ValidationCode: code,
    });

    const token = res?.token ?? res?.Token;
    if (!token) throw new Error('Código inválido');

    const firstName = res?.userFirstName ?? res?.UserFirstName ?? '';
    const lastName  = res?.userLastName  ?? res?.UserLastName  ?? '';
    const fullName  = `${firstName} ${lastName}`.trim() || 'Usuario';
    const empId     = res?.employeeId ?? res?.EmployeeId ?? res?.id;

    const user: User = {
      id: String(empId),
      name: fullName,
      role: 'Employee',
      email: res?.userEmail ?? res?.UserEmail ?? username,
      phone: res?.userPhone ?? res?.UserPhone,
      tenantKey: cfg.key,
      company: cfg.company,
      businessUnit: cfg.businessUnit,
      expiration: res?.expiration ?? res?.Expiration,
      empresaNombre: res?.userCompany ?? res?.UserCompany ?? res?.empresaNombre ?? '',
    };

    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    localStorage.setItem(this.EMPLOYEE_ID_KEY, String(empId!));
    localStorage.setItem(this.SESSION_EXPIRY_KEY, String(Date.now() + this.SESSION_DURATION_MS));
  }

  async forgotPassword(_tenantKey: string, identifier: string): Promise<{ ok: true }> {
    const cfg = await this.tenant.getTenantConfig();
    if (!cfg) throw new Error('Tenant no configurado');

    await this.api.post<{ mensaje: string }>('/api/Employees/forgot', {
      Company: cfg.company,
      username: identifier,
    });

    return { ok: true };
  }

  async resendMfaCode(username: string): Promise<{ ok: true; expiresAt?: number }> {
    const cfg = await this.tenant.getTenantConfig();
    if (!cfg) throw new Error('Tenant no configurado');

    const { value: password } = await Preferences.get({ key: 'saved_password' });
    if (!password) throw new Error('No se pudieron recuperar las credenciales');

    await this.api.post<ApiLoginResponse>('/api/Employees/authenticate', {
      Company: cfg.company,
      BusinessUnit: cfg.businessUnit,
      username,
      password,
    });

    return { ok: true, expiresAt: Date.now() + 5 * 60_000 };
  }
}