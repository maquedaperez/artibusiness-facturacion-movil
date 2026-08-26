import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ApiService } from './api.service';

// Confirmado contra el código real de WebAPIARTIBusiness (Controllers/PagosController.cs):
// GET /api/Pagos/estado y POST /api/Pagos/acceso-portal usan el mismo JWT de empleado que ya
// usa el resto de la app — ningún endpoint nuevo aquí, solo consumo del módulo de pagos.
const PAGOS_BASE_PATH = '/api/Pagos';

export type EstadoPagos = {
  saldoCreditos: number;
  esIlimitado: boolean;
  suscripcion: { estado: string; cancelaraAlFinalPeriodo: boolean } | null;
};

@Injectable({ providedIn: 'root' })
export class PagosService {
  private api = inject(ApiService);

  async obtenerEstado(): Promise<EstadoPagos> {
    return this.api.get<EstadoPagos>(`${PAGOS_BASE_PATH}/estado`);
  }

  // Paso 1 del acceso de un solo uso (informe de revisión previa, punto 1): pide al backend una
  // URL de un solo uso hacia el portal externo — nunca se envía el JWT de la app a ningún sitio,
  // solo se usa para autenticar ESTA llamada.
  async obtenerUrlAccesoPortal(): Promise<string> {
    const respuesta = await this.api.post<{ url: string }>(`${PAGOS_BASE_PATH}/acceso-portal`, {});
    return respuesta.url;
  }

  // Mismo patrón ya usado en setup.page.ts (openLink) para abrir un enlace externo — funciona
  // tanto en nativo (abre el navegador del sistema) como en web (nueva pestaña). Sin
  // dependencias nuevas de Capacitor para el MVP de la demo.
  abrirPortalDePagos(url: string): void {
    const target = Capacitor.isNativePlatform() ? '_system' : '_blank';
    window.open(url, target);
  }
}
