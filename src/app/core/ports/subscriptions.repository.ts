import { Suscripcion } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

/**
 * Puerto tipado para el selector de "línea de suscripción" al añadir una línea a una
 * factura. Búsqueda bajo demanda, nunca el listado completo. En este lote solo se usa
 * para elegir el origen de una línea puntual — no genera renovaciones ni cobros
 * automáticos. No existe backend real todavía — ver docs/SERVICE_CONTRACT_GAPS.md.
 */
export abstract class SubscriptionsRepository {
  abstract buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<Suscripcion>>;
}
