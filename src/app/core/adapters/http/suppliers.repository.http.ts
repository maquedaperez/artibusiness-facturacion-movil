import { Injectable, inject } from '@angular/core';
import { SuppliersRepository } from '../../ports/suppliers.repository';
import { MockSuppliersRepository } from '../mock/suppliers.repository.mock';
import { ApiService } from '../../../services/api.service';
import { ProveedorMock } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

// Confirmado contra el código real de WebAPIARTIBusiness (Controllers/ProveedoresController.cs
// + Services/ProveedorService.cs, revisado 2026-08-13): [Authorize], mismo JWT que el login.
//
// OJO: a diferencia de Recibidas/MediosPago/TipoFactura, aquí 'idEmpresa' es un campo
// OBLIGATORIO (int, no int?) en EnumerarProveedoresRequest — el backend NO cae al claim del
// token si se omite. Por eso lo leemos nosotros mismos del JWT (ApiService.getEmpresaId())
// y lo mandamos siempre explícito, en vez de confiar en que se resuelva solo como en el
// resto de endpoints. Pendiente pedirle al jefe que lo haga opcional para ser consistente
// con el resto de la API — mientras tanto, este rodeo funciona igual.
const PROVEEDORES_BASE_PATH = '/api/Proveedores';

type ProveedorApi = {
  idProveedor: number;
  idEmpresa: number;
  idSujeto: number;
  nombre: string | null;
  apellido1: string | null;
  apellido2: string | null;
  nombreCompleto: string | null;
  dni: string | null;
};

function mapearProveedor(dto: ProveedorApi): ProveedorMock {
  return {
    id: dto.idProveedor,
    nif: dto.dni?.trim() || '',
    nombre: dto.nombreCompleto?.trim() || dto.nombre?.trim() || 'Proveedor sin nombre',
  };
}

/**
 * Adaptador híbrido: solo `buscar` habla con el backend real
 * (POST /api/Proveedores/Enumerar). `crearAdHoc` sigue delegado al mismo almacén en
 * memoria que usa MockSuppliersRepository — el backend todavía no tiene un endpoint de
 * alta de proveedores (Crear), así que un proveedor nuevo elegido "al vuelo" sigue siendo
 * solo local hasta que exista.
 *
 * EnumerarProveedoresRequest solo admite buscar por 'nombre' O por 'dni' (son AND, no OR,
 * en el SQL del backend, así que no se pueden mandar los dos a la vez esperando un OR) —
 * este buscador manual usa 'nombre', igual que el resto de buscadores de la app.
 */
@Injectable()
export class HttpSuppliersRepository extends SuppliersRepository {
  private mockAdapter = inject(MockSuppliersRepository);
  private api = inject(ApiService);

  async buscar(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ProveedorMock>> {
    const q = query.trim();
    // Mismo criterio que el resto de buscadores bajo demanda de la app: nunca un listado
    // completo sin al menos 2 caracteres.
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const idEmpresa = this.api.getEmpresaId();
    if (idEmpresa == null) return { items: [], total: 0, page, pageSize };

    const body = { idEmpresa, nombre: q, top: pageSize };
    const resultado = await this.api.post<ProveedorApi[]>(`${PROVEEDORES_BASE_PATH}/Enumerar`, body);
    const items = (resultado ?? []).map(mapearProveedor);

    // Enumerar no pagina de verdad (ni page ni skip, solo 'top') — 'total' aquí es lo que
    // ha devuelto esta llamada, no un recuento real de coincidencias en la base de datos.
    // Misma limitación conocida que ya tiene Facturas Recibidas, no es un bug de aquí.
    return { items, total: items.length, page, pageSize };
  }

  crearAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock {
    return this.mockAdapter.crearAdHoc(data);
  }
}
