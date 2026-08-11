import { ProveedorMock } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para el selector de proveedores (buscar + alta rápida).
 * El futuro HttpSuppliersRepository no tiene backend todavía — ver la petición
 * redactada en docs/SERVICE_CONTRACT_GAPS.md #5 (calcada de ClienteUsuarioController).
 */
export abstract class SuppliersRepository {
  abstract buscar(query: string): ProveedorMock[];
  abstract crearAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock;
}
