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
 * SuppliersRepository usa HttpSuppliersRepository: solo buscar() habla con el backend real
 * (POST /api/Proveedores/Enumerar, confirmado 2026-08-13) — crearAdHoc sigue en el mismo
 * mock, porque el backend todavía no tiene un endpoint de alta de proveedores.
 *
 * IssuedInvoicesRepository usa HttpIssuedInvoicesRepository (Fase 1, 2026-08-20): solo
 * obtenerPorcentajesIva/obtenerMediosPago hablan con el backend real (mismo Impuesto/
 * MediosPagoController que ya usa Recibidas) — listar/guardar/contabilizar/firmar/etc.
 * siguen delegados al mock hasta sus propias fases del plan de integración de Emitidas.
 */
export const MOCK_REPOSITORY_PROVIDERS: Provider[] = [
  { provide: EmisorRepository, useClass: MockEmisorRepository },
  { provide: CustomersRepository, useClass: MockCustomersRepository },
  MockSuppliersRepository,
  { provide: SuppliersRepository, useClass: HttpSuppliersRepository },
  { provide: CatalogRepository, useClass: MockCatalogRepository },
  { provide: SubscriptionsRepository, useClass: MockSubscriptionsRepository },
  MockIssuedInvoicesRepository,
  { provide: IssuedInvoicesRepository, useClass: HttpIssuedInvoicesRepository },
  MockReceivedInvoicesRepository,
  { provide: ReceivedInvoicesRepository, useClass: HttpReceivedInvoicesRepository },
];
