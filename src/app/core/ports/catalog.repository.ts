import { ProductoCatalogo } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

/**
 * Puerto tipado para el selector de "línea de catálogo" al añadir una línea a una
 * factura. Igual que Customers/Suppliers: búsqueda bajo demanda, nunca el catálogo
 * completo. No existe backend real todavía — ver docs/SERVICE_CONTRACT_GAPS.md.
 */
export abstract class CatalogRepository {
  abstract buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ProductoCatalogo>>;
}
