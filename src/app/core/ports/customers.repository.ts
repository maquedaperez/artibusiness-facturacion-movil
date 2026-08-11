import { ClienteMock, Destinatario } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para el selector de clientes (buscar + alta rápida). No es una ficha de
 * cliente completa — ver la decisión de alcance en docs/SERVICE_CONTRACT_GAPS.md.
 * El futuro HttpCustomersRepository debe cumplir este contrato consumiendo
 * ClienteUsuarioController.findbyname/findbynif/insert (backend real confirmado,
 * payload exacto pendiente — ver gap #4).
 */
export abstract class CustomersRepository {
  abstract buscar(query: string): ClienteMock[];
  abstract crearAdHoc(data: Destinatario): ClienteMock;
}
