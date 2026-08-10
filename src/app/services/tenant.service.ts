import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type TenantConfig = {
  key: string;
  label: string;
  baseUrl: string;
  company: number;
  businessUnit: number;
};

const CONFIG_API_URL_NATIVE = 'https://configurationapidispatcher-h2g0g4amcgdmaddh.westeurope-01.azurewebsites.net/api/configuration';
// En web se pasa por un proxy same-origin (netlify.toml / proxy.conf.js) para evitar CORS.
const CONFIG_API_URL_WEB = '/config-api/configuration';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly KEY = 'tenantKey';
  private readonly CONFIG_CACHE_KEY = 'tenantConfig';

  async getTenantKey(): Promise<string | null> {
    const r = await Preferences.get({ key: this.KEY });
    return r.value ?? null;
  }

  async setTenantKey(value: string): Promise<void> {
    await Preferences.set({ key: this.KEY, value: value.trim().toLowerCase() });
  }

  async clearTenantKey(): Promise<void> {
    await Preferences.remove({ key: this.KEY });
    await Preferences.remove({ key: this.CONFIG_CACHE_KEY });
  }

  async getTenantConfig(): Promise<TenantConfig | null> {
    const cached = await Preferences.get({ key: this.CONFIG_CACHE_KEY });
    if (cached.value) return JSON.parse(cached.value) as TenantConfig;

    const key = await this.getTenantKey();
    if (!key) return null;
    return await this.fetchAndCacheConfig(key);
  }

  async fetchAndCacheConfig(clave: string): Promise<TenantConfig> {
    try {
      let data: { idCentro: number; idEmpresa: number; url: string };

      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.request({
          url: CONFIG_API_URL_NATIVE,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: { clave },
        });

        if (res.status < 200 || res.status >= 300) {
          if (res.status === 404) throw new Error('Clave de empresa no encontrada.');
          if (res.status === 400) throw new Error('Clave inválida.');
          throw new Error(`Error ${res.status}`);
        }

        data = res.data;
      } else {
        const res = await fetch(CONFIG_API_URL_WEB, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave }),
        });

        if (!res.ok) {
          if (res.status === 404) throw new Error('Clave de empresa no encontrada.');
          if (res.status === 400) throw new Error('Clave inválida.');
          throw new Error(`Error ${res.status}`);
        }

        data = await res.json();
      }

      const config: TenantConfig = {
        key: clave,
        label: clave.toUpperCase(),
        baseUrl: data.url,
        company: data.idEmpresa,
        businessUnit: data.idCentro,
      };

      await Preferences.set({ key: this.CONFIG_CACHE_KEY, value: JSON.stringify(config) });
      return config;

    } catch (e: any) {
      if (e?.message?.includes('no encontrada') || e?.message?.includes('inválida')) throw e;
      throw new Error('Clave de empresa no encontrada.');
    }
  }

  async isTenantKeyValid(clave: string): Promise<boolean> {
    try {
      await this.fetchAndCacheConfig(clave);
      return true;
    } catch {
      return false;
    }
  }
}