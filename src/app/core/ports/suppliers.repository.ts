import { ProveedorMock } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

/**
 * Puerto tipado para el selector de proveedores (buscar + alta rápida). Backend real
 * confirmado 2026-08-14: ProveedoresController — Enumerar y Crear.
 *
 * buscar() es async y paginado a propósito — ver la nota equivalente en
 * CustomersRepository: nunca debe devolver el listado completo sin query.
 *
 * crearAdHoc() es async: llama a POST /api/Proveedores/Crear de verdad (no es un simple
 * alta local) — puede rechazar (NIF ya existente = 409, provincia inexistente en el
 * catálogo de la empresa = 400, etc.), así que quien la llama debe manejarla como
 * cualquier otra llamada de red, no como una operación local instantánea.
 */
export abstract class SuppliersRepository {
  abstract buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ProveedorMock>>;
  abstract crearAdHoc(data: Omit<ProveedorMock, 'id'>): Promise<ProveedorMock>;
}
