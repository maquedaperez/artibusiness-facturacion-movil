import { Injectable, inject } from '@angular/core';
import { CustomersRepository } from '../../ports/customers.repository';
import { MockCustomersRepository } from '../mock/customers.repository.mock';
import { ApiService } from '../../../services/api.service';
import { ClienteMock, Destinatario } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

// Fase 3 del plan de integración de Emitidas (2026-08-20): ClientesController es nuevo
// (Controllers/ClientesController.cs + Services/ClienteService.cs), calcado de
// ProveedoresController/ProveedorService (misma relación 'clientes'/'sujeto' 1:1 que
// 'proveedores'/'sujeto') — a diferencia de ese, aquí idEmpresa SÍ es opcional con fallback
// al claim del token (ver EnumerarClientesRequest.cs), así que no hace falta leerlo nosotros
// mismos con getEmpresaId() como sí hace suppliers.repository.http.ts.
const CLIENTES_BASE_PATH = '/api/Clientes';

type DireccionApi = {
  idDireccion: number;
  direccion: string | null;
  codigoPostal: string | null;
  poblacion: string | null;
  idProvincia: number | null;
  provincia: string | null;
};

type ClienteApi = {
  idCliente: number;
  idEmpresa: number;
  idSujeto: number;
  nombre: string | null;
  apellido1: string | null;
  apellido2: string | null;
  nombreCompleto: string | null;
  dni: string | null;
  direccionFacturacion: DireccionApi | null;
};

// Igual que en Recibidas/Emitidas: un CIF de empresa empieza siempre por letra, un DNI/NIE
// de particular por dígito (o X/Y/Z, que aquí caen del lado "empresa" por simplicidad — dato
// solo cosmético, ver factura-detalle.page.html).
function esEmpresaDesdeNif(nif: string | null | undefined): boolean {
  return !/^\d/.test((nif ?? '').trim());
}

function mapearCliente(dto: ClienteApi): ClienteMock {
  const nombre = dto.nombreCompleto?.trim() || dto.nombre?.trim() || 'Cliente sin nombre';
  return {
    id: dto.idCliente,
    nif: dto.dni?.trim() || '',
    nombre,
    esEmpresa: esEmpresaDesdeNif(dto.dni),
    direccion: dto.direccionFacturacion?.direccion?.trim() || undefined,
    poblacion: dto.direccionFacturacion?.poblacion?.trim() || undefined,
    cp: dto.direccionFacturacion?.codigoPostal?.trim() || undefined,
    provincia: dto.direccionFacturacion?.provincia?.trim() || undefined,
  };
}

/**
 * Fase 3 del plan de integración de Emitidas (2026-08-20): solo `buscar()` habla con el
 * backend real (POST /api/Clientes/Enumerar) — `crearAdHoc()` sigue delegado al mismo mock en
 * memoria que usa MockCustomersRepository, porque la tabla `clientes` real tiene columnas
 * obligatorias de cuenta bancaria/SEPA y sincronización Dynamics 365 (ver ClienteService.cs)
 * que no hace sentido rellenar a ciegas desde un alta rápida en el selector — pendiente de
 * decisión del jefe sobre qué valores por defecto son seguros.
 */
@Injectable()
export class HttpCustomersRepository extends CustomersRepository {
  private mockAdapter = inject(MockCustomersRepository);
  private api = inject(ApiService);

  async buscar(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ClienteMock>> {
    const q = query.trim();
    // Mismo criterio que el resto de buscadores bajo demanda de la app: nunca un listado
    // completo sin al menos 2 caracteres.
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    // Igual que en Proveedores: NIF/CIF/NIE españoles tienen 9 caracteres y siempre mezclan
    // letras y dígitos — un nombre de cliente normal no cumple eso a la vez, sirve como
    // heurística simple para decidir qué filtro mandar (Enumerar los trata como AND, no OR).
    const pareceNif = q.length === 9 && /[A-Za-z]/.test(q) && /\d/.test(q);
    const body = pareceNif ? { dni: q, top: pageSize } : { nombre: q, top: pageSize };
    const resultado = await this.api.post<ClienteApi[]>(`${CLIENTES_BASE_PATH}/Enumerar`, body);
    const items = (resultado ?? []).map(mapearCliente);

    // Enumerar no pagina de verdad (ni page ni skip, solo 'top') — mismo criterio/limitación
    // ya conocida de Proveedores/Recibidas.
    return { items, total: items.length, page, pageSize };
  }

  crearAdHoc(data: Destinatario): ClienteMock {
    return this.mockAdapter.crearAdHoc(data);
  }
}
