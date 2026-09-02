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
 * QUÉ SIGUE SIENDO MOCK (y por tanto oculto en la interfaz, ver
 * funcionalidades-pendientes.ts): EmisorRepository (ficha de la empresa), CatalogRepository
 * (catálogo de productos) y SubscriptionsRepository (suscripciones). Los tres muestran datos
 * inventados, así que sus entradas en la interfaz están ocultas hasta que exista el endpoint
 * real. Mantener esta lista al día: es el mapa que se consulta para saber qué es de verdad.
 *
 * Deliberadamente NO hay todavía un `environment.production ? HTTP_PROVIDERS : MOCK_PROVIDERS`
 * — eso llega cuando haya más de un HttpXxxRepository real. Netlify sigue desplegando con
 * este mismo MOCK_REPOSITORY_PROVIDERS (es el entorno demo), así que activar OCR real aquí
 * también lo activa ahí en cuanto se haga push — solo hacerlo cuando el backend confirme
 * que está desplegado con el token real puesto (ver docs/OCR_BACKEND_INTEGRATION.md).
 *
 * ReceivedInvoicesRepository usa HttpReceivedInvoicesRepository: listar/obtenerPorId,
 * crearDesdeOcr, crear-manual/editar/eliminar y los adjuntos (Blob Storage real vía
 * /Documento) hablan todos con el backend real. Solo queda local la vista previa del
 * documento ANTES del primer guardado (adjuntarDocumento devuelve una data URL), que es
 * deliberado: todavía no hay id real al que subir nada.
 *
 * SuppliersRepository usa HttpSuppliersRepository: buscar() y crearAdHoc() hablan con el
 * backend real (POST /api/Proveedores/Enumerar y /Crear, confirmados 2026-08-14).
 *
 * IssuedInvoicesRepository usa HttpIssuedInvoicesRepository: obtenerPorcentajesIva/
 * obtenerMediosPago (Fase 1), listar/obtenerPorId (Fase 2), guardar/obtenerNumeradores
 * (Fase 4), eliminar/duplicar (Fase 6) y contabilizar/firmar (Fase 7, 2026-08-21 — llaman a
 * FacturaEmitidaController.Contabilizar/Firmar, que a su vez llama al microservicio FacturaE
 * real de AEAT/VERI*FACTU) hablan todas con el backend real. Solo generarDocumento sigue
 * delegado al mock (genera un PDF de ejemplo, no fiscal).
 *
 * CustomersRepository usa HttpCustomersRepository: buscar() (POST /api/Clientes/Enumerar) y
 * crearAdHoc() (POST /api/Clientes/Crear, desde el blindaje del 2026-08-24) hablan las dos con
 * el backend real. Un cliente creado desde el selector trae un idCliente REAL, igual que uno
 * elegido de la búsqueda.
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
