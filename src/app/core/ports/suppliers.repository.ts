import { ProveedorMock } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

/**
 * Puerto tipado para el selector de proveedores (buscar + alta rápida).
 * El futuro HttpSuppliersRepository no tiene backend todavía — ver la petición
 * redactada en docs/SERVICE_CONTRACT_GAPS.md #5 (calcada de ClienteUsuarioController).
 *
 * buscar() es async y paginado a propósito — ver la nota equivalente en
 * CustomersRepository: nunca debe devolver el listado completo sin query.
 */
export abstract class SuppliersRepository {
  abstract buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ProveedorMock>>;
  abstract crearAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock;
}
