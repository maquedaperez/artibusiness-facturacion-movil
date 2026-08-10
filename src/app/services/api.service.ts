import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp, HttpOptions } from '@capacitor/core';
import { environment } from 'src/environments/environment';
import { TenantService } from './tenant.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly TOKEN_KEY = 'arti_access_token';

  constructor(private tenant: TenantService) {}

  private async resolveBaseUrl(): Promise<string> {
    if (!Capacitor.isNativePlatform()) return '';
    const cfg = await this.tenant.getTenantConfig();
    return (cfg?.baseUrl ?? environment.defaultBaseUrl ?? '').replace(/\/$/, '');
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...(extra ?? {}) };

    const token = localStorage.getItem(this.TOKEN_KEY);
    if (token) h['Authorization'] = `Bearer ${token}`;

    if (!h['Content-Type']) h['Content-Type'] = 'application/json';
    if (!h['Accept']) h['Accept'] = '*/*';

    return h;
  }

  private stripHtmlToOneLine(text: string): string {
    const t = (text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return t.slice(0, 240);
  }

  async get<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
    const baseUrl = await this.resolveBaseUrl();
    const url = `${baseUrl}${path}`;
    const headers = this.buildHeaders(extraHeaders);

    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({ url, method: 'GET', headers });
      if (res.status < 200 || res.status >= 300) {
        const msg = res.data ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : '';
        throw new Error(`HTTP ${res.status} ${msg}`);
      }
      return res.data as T;
    }

    const r = await fetch(url, { method: 'GET', headers, cache: 'no-store', credentials: 'include' });
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      const ct = r.headers.get('content-type') ?? '';
      const detail = ct.includes('text/html') ? this.stripHtmlToOneLine(text) : (text || r.statusText);
      throw new Error(`HTTP ${r.status} - ${detail}`);
    }
    if (!text) return undefined as unknown as T;
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
    }
    return text as unknown as T;
  }

  async post<T>(path: string, body: any, extraHeaders?: Record<string, string>): Promise<T> {
    const baseUrl = await this.resolveBaseUrl();
    const url = `${baseUrl}${path}`;
    const headers = this.buildHeaders(extraHeaders);

    if (Capacitor.isNativePlatform()) {
      const opts: HttpOptions = {
        url,
        method: 'POST',
        headers,
        data: body ?? {},
      };

      const res = await CapacitorHttp.request(opts);

      if (res.status < 200 || res.status >= 300) {
        const msg = res.data
          ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
          : '';
        throw new Error(`HTTP ${res.status} ${msg}`);
      }

      return res.data as T;
    }

    // Web
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
      credentials: 'include',
    });

    const text = await r.text().catch(() => '');

    if (!r.ok) {
      const ct = r.headers.get('content-type') ?? '';
      const detail = ct.includes('text/html')
        ? this.stripHtmlToOneLine(text)
        : (text || r.statusText);
      throw new Error(`HTTP ${r.status} - ${detail}`);
    }

    if (!text) return undefined as unknown as T;

    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
    }

    return text as unknown as T;
  }
}
