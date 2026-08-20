import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp, HttpOptions } from '@capacitor/core';
import { environment } from 'src/environments/environment';
import { TenantService } from './tenant.service';
import { decodeJwtPayload } from '../shared/utils/jwt';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private tenant = inject(TenantService);

  private readonly TOKEN_KEY = 'arti_access_token';

  // Algunos endpoints (ej. ProveedoresController/Enumerar) declaran idEmpresa como
  // obligatorio en vez de opcional-con-fallback-al-token como el resto de la API — así que
  // ahí sí hace falta mandarlo explícito. El login no devuelve el id de empresa en el JSON
  // (solo userCompany, el NOMBRE), pero sí viaja como claim "EmpresaId" dentro del propio
  // JWT (confirmado en TokenServiceEmployee.cs), así que lo leemos de ahí en vez de pedirle
  // al backend un campo nuevo.
  getEmpresaId(): number | null {
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (!token) return null;
    const payload = decodeJwtPayload<{ EmpresaId?: string }>(token);
    const empresaId = payload?.EmpresaId ? Number(payload.EmpresaId) : NaN;
    return Number.isFinite(empresaId) ? empresaId : null;
  }

  private async resolveBaseUrl(): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      // ⚠️ TEMPORAL: forzamos Development porque DocumentoController (OCR) todavía no está
      // publicado en Producción. Sin esto, el nativo resolvía el baseUrl real (Producción)
      // vía la clave de empresa mientras Netlify seguía apuntando a Development — mismo
      // usuario/clave, dos bases de datos distintas, y el login fallaba solo en el móvil.
      // Revertir a `(await this.tenant.getTenantConfig())?.baseUrl` en cuanto el jefe
      // publique OCR en Producción.
      return (environment.defaultBaseUrl ?? '').replace(/\/$/, '');
    }

    // Web (2026-08-20): resuelve la URL real contra el dispatcher, mismo mecanismo que ya
    // usa nativo — TenantService.getTenantConfig() ya cachea lo que devolvió
    // /config-api/configuration para la clave introducida en /setup (Netlify lo proxea sin
    // CORS, ver netlify.toml). Ya no depende del redirect estático /api/* (retirado):
    // ahora la llamada va directa, cross-origin, al backend real que haya resuelto la
    // clave — por eso api.service.ts ya no manda credentials:'include' (no hace falta,
    // la sesión va por Bearer token, y con AllowAnyOrigin() en el backend un origen
    // comodín no es compatible con peticiones credenciales).
    //
    // Sin clave resuelta todavía (sesión rota, o alguna llamada excepcional antes de pasar
    // por /setup) cae al mismo fallback fijo que usaba el proxy hasta ahora, para no dejar
    // la app completamente inutilizable.
    const config = await this.tenant.getTenantConfig();
    return (config?.baseUrl ?? environment.defaultBaseUrl ?? '').replace(/\/$/, '');
  }

  private buildHeaders(extra?: Record<string, string>, opts?: { defaultJson?: boolean }): Record<string, string> {
    const h: Record<string, string> = { ...(extra ?? {}) };

    const token = localStorage.getItem(this.TOKEN_KEY);
    if (token) h['Authorization'] = `Bearer ${token}`;

    if (opts?.defaultJson !== false && !h['Content-Type']) h['Content-Type'] = 'application/json';
    if (!h['Accept']) h['Accept'] = '*/*';

    return h;
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // readAsDataURL da "data:<mime>;base64,<payload>" — el bridge nativo de
        // Capacitor solo quiere el payload.
        const dataUrl = reader.result as string;
        resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

    const r = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
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

  // Descarga binaria autenticada — usado hoy solo por el documento adjunto de una factura
  // recibida (GET /api/FacturasRecibidas/{id}/Documento). A diferencia de get(), aquí el
  // cuerpo no es JSON, así que no se puede reutilizar tal cual: hace falta pedir
  // responseType 'blob' explícito en nativo (si no, CapacitorHttp intenta interpretar el
  // binario como texto/JSON y lo corrompe), y CapacitorHttp con 'blob' devuelve el
  // contenido en base64 dentro de res.data en vez de como Blob directamente — hay que
  // decodificarlo a mano.
  async getBlob(path: string, extraHeaders?: Record<string, string>): Promise<Blob> {
    const baseUrl = await this.resolveBaseUrl();
    const url = `${baseUrl}${path}`;
    const headers = this.buildHeaders(extraHeaders, { defaultJson: false });
    delete headers['Content-Type'];

    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({ url, method: 'GET', headers, responseType: 'blob' });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const contentType = res.headers?.['Content-Type'] ?? res.headers?.['content-type'] ?? 'application/octet-stream';
      const binario = atob(res.data as string);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      return new Blob([bytes], { type: contentType });
    }

    const r = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} - ${r.statusText}`);
    }
    return r.blob();
  }

  // DELETE simple, sin body — usado hoy solo por Facturas Recibidas. El backend devuelve
  // 204 No Content en éxito, por eso el manejo de "sin texto" ya cubierto abajo (igual que
  // get()) es el camino normal, no un caso raro.
  async delete<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
    const baseUrl = await this.resolveBaseUrl();
    const url = `${baseUrl}${path}`;
    const headers = this.buildHeaders(extraHeaders);

    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({ url, method: 'DELETE', headers });
      if (res.status < 200 || res.status >= 300) {
        const msg = res.data ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : '';
        throw new Error(`HTTP ${res.status} ${msg}`);
      }
      return res.data as T;
    }

    const r = await fetch(url, { method: 'DELETE', headers, cache: 'no-store' });
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

  // Subida de un fichero real (multipart/form-data) — usado hoy solo por el OCR de
  // Facturas Recibidas. En web se apoya en FormData/fetch (el navegador añade el
  // boundary solo, por eso NO se fija Content-Type a mano). En nativo, CapacitorHttp no
  // acepta FormData directamente: hay que declarar dataType: 'formData' y mandar el
  // fichero como entrada base64File — es el único formato que entiende el puente nativo
  // (visto en CapacitorHttpUrlConnection.java de @capacitor/android, no está documentado
  // en la guía pública de CapacitorHttp).
  async postMultipart<T>(
    path: string,
    file: File,
    fieldName = 'file',
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const baseUrl = await this.resolveBaseUrl();
    const url = `${baseUrl}${path}`;

    if (Capacitor.isNativePlatform()) {
      const base64Value = await this.fileToBase64(file);
      const headers = this.buildHeaders(
        { ...(extraHeaders ?? {}), 'Content-Type': 'multipart/form-data' },
        { defaultJson: false },
      );

      const res = await CapacitorHttp.request({
        url,
        method: 'POST',
        headers,
        dataType: 'formData',
        data: [
          {
            type: 'base64File',
            key: fieldName,
            value: base64Value,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
          },
        ],
      } as HttpOptions);

      if (res.status < 200 || res.status >= 300) {
        const msg = res.data ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : '';
        throw new Error(`HTTP ${res.status} ${msg}`);
      }
      return res.data as T;
    }

    // Web: FormData deja que fetch calcule el boundary correcto solo — si fijáramos
    // Content-Type a mano aquí, fetch NO lo sobreescribiría y el servidor no podría
    // parsear el body.
    const form = new FormData();
    form.append(fieldName, file, file.name);

    const headers = this.buildHeaders(extraHeaders, { defaultJson: false });
    delete headers['Content-Type'];

    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
      cache: 'no-store',
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
