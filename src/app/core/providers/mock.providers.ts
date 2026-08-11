import { Provider } from '@angular/core';

import {
  EmisorRepository, CustomersRepository, SuppliersRepository,
  IssuedInvoicesRepository, ReceivedInvoicesRepository,
} from '../ports';

import { MockEmisorRepository } from '../adapters/mock/emisor.repository.mock';
import { MockCustomersRepository } from '../adapters/mock/customers.repository.mock';
import { MockSuppliersRepository } from '../adapters/mock/suppliers.repository.mock';
import { MockIssuedInvoicesRepository } from '../adapters/mock/issued-invoices.repository.mock';
import { MockReceivedInvoicesRepository } from '../adapters/mock/received-invoices.repository.mock';

/**
 * Único punto de la app que decide qué implementación de cada puerto se inyecta.
 * Hoy solo existe la variante mock — cuando existan HttpXxxRepository respaldados por
 * contratos confirmados (ver docs/SERVICE_CONTRACT_GAPS.md), este es el único archivo que
 * cambia para pasar a HTTP; ninguna pantalla ni componente se toca.
 *
 * Deliberadamente NO hay todavía un `environment.production ? HTTP_PROVIDERS : MOCK_PROVIDERS`
 * — eso llega cuando exista al menos un HttpXxxRepository real que ofrecer como alternativa.
 * Netlify sigue desplegando con MOCK_REPOSITORY_PROVIDERS a propósito (es el entorno demo).
 */
export const MOCK_REPOSITORY_PROVIDERS: Provider[] = [
  { provide: EmisorRepository, useClass: MockEmisorRepository },
  { provide: CustomersRepository, useClass: MockCustomersRepository },
  { provide: SuppliersRepository, useClass: MockSuppliersRepository },
  { provide: IssuedInvoicesRepository, useClass: MockIssuedInvoicesRepository },
  { provide: ReceivedInvoicesRepository, useClass: MockReceivedInvoicesRepository },
];
