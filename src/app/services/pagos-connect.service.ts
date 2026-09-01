import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ApiService } from './api.service';

// Stripe Connect (Fase 3, 2026-09-02) — cobro a los clientes finales de cada empresa.
// DELIBERADAMENTE un servicio propio, separado de PagosService (créditos/suscripciones de
// ARTIBusiness): son dos integraciones de Stripe distintas, con su propio controller
// (PagosConnectController), su propia sección de configuración y sus propias tablas en el
// backend — nunca deben mezclarse.
const PAGOS_CONNECT_BASE_PATH = '/api/PagosConnect';

export type EstadoPagosConnect = {
  conectado: boolean;
  estado: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

@Injectable({ providedIn: 'root' })
export class PagosConnectService {
  private api = inject(ApiService);

  async obtenerEstado(): Promise<EstadoPagosConnect> {
    return this.api.get<EstadoPagosConnect>(`${PAGOS_CONNECT_BASE_PATH}/estado`);
  }

  // Devuelve la URL de onboarding de Stripe Express a la que redirigir a quien administra la
  // empresa — el propio backend decide si es la primera vez (crea la cuenta) o si ya existe una
  // conexión sin terminar (genera un link nuevo para retomarla), nunca el cliente.
  async iniciarOnboarding(): Promise<string> {
    const respuesta = await this.api.post<{ url: string }>(`${PAGOS_CONNECT_BASE_PATH}/conectar`, {});
    return respuesta.url;
  }

  // Mismo criterio que PagosService.abrirPortalDePagos: en nativo, window.open(url, '_system')
  // abre el navegador del sistema (no le afecta el bloqueo de pop-ups); en web, navegar en la
  // misma pestaña evita el bloqueo de pop-ups tras una llamada de red (el gesto de clic original
  // ya no está "vivo" cuando llega la URL).
  abrirOnboarding(url: string): void {
    if (Capacitor.isNativePlatform()) {
      window.open(url, '_system');
      return;
    }
    window.location.assign(url);
  }
}
