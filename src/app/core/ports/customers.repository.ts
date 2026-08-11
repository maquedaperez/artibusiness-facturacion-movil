import { ClienteMock, Destinatario } from '../../services/mock-facturas.service';
import { PaginaResultado } from '../../shared/types/pagination';

/**
 * Puerto tipado para el selector de clientes (buscar + alta rápida). No es una ficha de
 * cliente completa — ver la decisión de alcance en docs/SERVICE_CONTRACT_GAPS.md.
 * El futuro HttpCustomersRepository debe cumplir este contrato consumiendo
 * ClienteUsuarioController.findbyname/findbynif/insert (backend real confirmado,
 * payload exacto pendiente — ver gap #4).
 *
 * buscar() es async y paginado a propósito: es una búsqueda bajo demanda (mínimo 2
 * caracteres, debounce y cancelación en el componente), nunca un listado completo.
 * query.trim().length < 2 debe devolver una página vacía, no "todos los clientes".
 */
export abstract class CustomersRepository {
  abstract buscar(query: string, page?: number, pageSize?: number): Promise<PaginaResultado<ClienteMock>>;
  abstract crearAdHoc(data: Destinatario): ClienteMock;
}
