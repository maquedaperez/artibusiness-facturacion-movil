import { Injectable, inject } from '@angular/core';
import { Provincia, ProvincesRepository } from '../../ports/provinces.repository';
import { ApiService } from '../../../services/api.service';
import { CatalogoEnMemoria } from '../../../shared/utils/catalogo-en-memoria';
import { LimpiezaDeSesionService } from '../../../services/limpieza-de-sesion.service';

// POST /api/Provincias/Enumerar (PR 55). Mismo patrón que MediosPago/Enumerar: la empresa la
// resuelve el backend desde el token, aquí no se manda nada.
const PROVINCIAS_BASE_PATH = '/api/Provincias';

type ProvinciaApi = {
  idProvincia: number;
  provincia: string | null;
};

@Injectable({ providedIn: 'root' })
export class HttpProvincesRepository extends ProvincesRepository {
  private api = inject(ApiService);

  // El catálogo de una empresa no cambia dentro de una sesión. Se registra la limpieza porque
  // SÍ cambia al cambiar de empresa, que es justo el fallo que se arregló el 2026-09-14.
  private cache = new CatalogoEnMemoria<Provincia[]>();

  constructor() {
    super();
    inject(LimpiezaDeSesionService).registrar(() => this.cache.olvidar());
  }

  async enumerar(): Promise<Provincia[]> {
    try {
      return await this.cache.obtener(async () => {
        const respuesta = await this.api.post<ProvinciaApi[]>(`${PROVINCIAS_BASE_PATH}/Enumerar`, {});
        return (respuesta ?? [])
          .filter(p => (p.provincia ?? '').trim().length > 0)
          .map(p => ({ id: p.idProvincia, nombre: (p.provincia ?? '').trim() }));
      });
    } catch {
      // A propósito: sin catálogo, el campo de provincia sigue siendo texto libre y se puede
      // guardar igual. Un error aquí no puede impedir dar de alta a un cliente — y mientras el
      // PR 55 no esté publicado, este endpoint responde 404 en todas las llamadas.
      return [];
    }
  }
}
