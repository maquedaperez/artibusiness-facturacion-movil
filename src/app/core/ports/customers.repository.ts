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
  // Blindaje 2026-08-24: pasa a ser async y exige idMedioPago — WebAPIARTIBusiness/Clientes/Crear
  // ya existe de verdad (POST /api/Clientes/Crear), así que un cliente "nuevo" desde el
  // selector ya obtiene un idCliente REAL, no uno de mock. idMedioPago es obligatorio porque es
  // la única columna NOT NULL de la tabla `clientes` que decide algo real del negocio (con qué
  // se le cobra) — nunca se asume un valor por defecto, lo elige el usuario en el formulario.
  abstract crearAdHoc(data: Destinatario, idMedioPago: number): Promise<ClienteMock>;
}
