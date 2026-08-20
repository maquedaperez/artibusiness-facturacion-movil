import { Provider } from '@angular/core';

import {
  EmisorRepository, CustomersRepository, SuppliersRepository,
  CatalogRepository, SubscriptionsRepository,
  IssuedInvoicesRepository, ReceivedInvoicesRepository,
} from '../ports';

import { MockEmisorRepository } from '../adapters/mock/emisor.repository.mock';
import { MockCustomersRepository } from '../adapters/mock/customers.repository.mock';
import { MockSuppliersRepository } from '../adapters/mock/suppliers.repository.mock';
import { MockCatalogRepository } from '../adapters/mock/catalog.repository.mock';
import { MockSubscriptionsRepository } from '../adapters/mock/subscriptions.repository.mock';
import { MockIssuedInvoicesRepository } from '../adapters/mock/issued-invoices.repository.mock';
import { MockReceivedInvoicesRepository } from '../adapters/mock/received-invoices.repository.mock';
import { HttpIssuedInvoicesRepository } from '../adapters/http/issued-invoices.repository.http';
import { HttpReceivedInvoicesRepository } from '../adapters/http/received-invoices.repository.http';
import { HttpSuppliersRepository } from '../adapters/http/suppliers.repository.http';
import { HttpCustomersRepository } from '../adapters/http/customers.repository.http';

/**
 * Único punto de la app que decide qué implementación de cada puerto se inyecta.
 * Cuando existan HttpXxxRepository respaldados por contratos confirmados (ver
 * docs/SERVICE_CONTRACT_GAPS.md), este es el único archivo que cambia para pasar a HTTP;
 * ninguna pantalla ni componente se toca.
 *
 * Deliberadamente NO hay todavía un `environment.production ? HTTP_PROVIDERS : MOCK_PROVIDERS`
 * — eso llega cuando haya más de un HttpXxxRepository real. Netlify sigue desplegando con
 * este mismo MOCK_REPOSITORY_PROVIDERS (es el entorno demo), así que activar OCR real aquí
 * también lo activa ahí en cuanto se haga push — solo hacerlo cuando el backend confirme
 * que está desplegado con el token real puesto (ver docs/OCR_BACKEND_INTEGRATION.md).
 *
 * ReceivedInvoicesRepository usa HttpReceivedInvoicesRepository: listar/obtenerPorId y
 * crearDesdeOcr hablan con el backend real — crear-manual/editar/eliminar siguen delegando
 * en el mismo mock por debajo, porque Guardar exige catálogos (Impuestos, Proveedores/Crear)
 * que el backend todavía no expone.
 *
 * SuppliersRepository usa HttpSuppliersRepository: buscar() y crearAdHoc() hablan con el
 * backend real (POST /api/Proveedores/Enumerar y /Crear, confirmados 2026-08-14).
 *
 * IssuedInvoicesRepository usa HttpIssuedInvoicesRepository: obtenerPorcentajesIva/
 * obtenerMediosPago (Fase 1) y listar/obtenerPorId (Fase 2, 2026-08-20, contra
 * FacturaEmitidaController/Enumerar) hablan con el backend real — guardar/contabilizar/
 * firmar/eliminar/duplicar siguen delegados al mock hasta sus propias fases.
 *
 * CustomersRepository usa HttpCustomersRepository (Fase 3, 2026-08-20): solo buscar() habla
 * con el backend real (POST /api/Clientes/Enumerar, nuevo, calcado de Proveedores) —
 * crearAdHoc sigue en el mismo mock: la tabla 'clientes' real tiene columnas obligatorias de
 * cuenta bancaria/SEPA y Dynamics 365 que no tiene sentido rellenar a ciegas desde un alta
 * rápida, pendiente de decisión del jefe (ver ClienteService.cs).
 */
export const MOCK_REPOSITORY_PROVIDERS: Provider[] = [
  { provide: EmisorRepository, useClass: MockEmisorRepository },
  MockCustomersRepository,
  { provide: CustomersRepository, useClass: HttpCustomersRepository },
  MockSuppliersRepository,
  { provide: SuppliersRepository, useClass: HttpSuppliersRepository },
  { provide: CatalogRepository, useClass: MockCatalogRepository },
  { provide: SubscriptionsRepository, useClass: MockSubscriptionsRepository },
  MockIssuedInvoicesRepository,
  { provide: IssuedInvoicesRepository, useClass: HttpIssuedInvoicesRepository },
  MockReceivedInvoicesRepository,
  { provide: ReceivedInvoicesRepository, useClass: HttpReceivedInvoicesRepository },
];
