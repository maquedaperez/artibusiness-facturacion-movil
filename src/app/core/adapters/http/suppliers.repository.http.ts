import { Injectable, inject } from '@angular/core';
import { SuppliersRepository } from '../../ports/suppliers.repository';
import { ApiService } from '../../../services/api.service';
import { ProveedorMock } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';
import { limpiarNombreProveedor } from '../../../shared/utils/limpiar-nombre-proveedor';

// Confirmado contra el código real de WebAPIARTIBusiness (Controllers/ProveedoresController.cs
// + Services/ProveedorService.cs, revisado 2026-08-14): [Authorize], mismo JWT que el login.
//
// OJO: a diferencia de Recibidas/MediosPago/TipoFactura, en EnumerarProveedoresRequest
// 'idEmpresa' es un campo OBLIGATORIO (int, no int?) — el backend NO cae al claim del token
// si se omite. Por eso lo leemos nosotros mismos del JWT (ApiService.getEmpresaId()) y lo
// mandamos siempre explícito. En CrearProveedorRequest, en cambio, sí es int? opcional —
// inconsistencia entre los dos endpoints del mismo controlador, pero lo mandamos explícito
// en los dos por simplicidad y para no depender de cuál es cuál.
const PROVEEDORES_BASE_PATH = '/api/Proveedores';

type DireccionApi = {
  idDireccion: number;
  direccion: string | null;
  codigoPostal: string | null;
  poblacion: string | null;
  idProvincia: number | null;
  provincia: string | null;
};

type ProveedorApi = {
  idProveedor: number;
  idEmpresa: number;
  idSujeto: number;
  nombre: string | null;
  apellido1: string | null;
  apellido2: string | null;
  nombreCompleto: string | null;
  dni: string | null;
  direccionFacturacion: DireccionApi | null;
};

// El backend exige Nombre Y Apellido1 como dos campos NO vacíos por separado (reutiliza la
// tabla 'sujeto' que comparte con clientes/empleados, siempre persona física) — y NO basta
// con un espacio: la validación usa IsNullOrWhiteSpace, no IsNullOrEmpty (confirmado en
// ProveedoresController.Crear, probado en real 2026-08-14: rechaza con 400 "apellido1 es
// obligatorio"). Decisión explícita del jefe (2026-08-14, no se toca el backend: apellido1
// se queda obligatorio): la razón social completa va siempre en Nombre, y Apellido1 se
// manda como un punto fijo '.' — un placeholder reconocible a propósito (permite luego
// identificar en BBDD qué proveedores se dieron de alta desde este flujo simplificado),
// en vez de partir el texto para intentar disimularlo.
const APELLIDO1_PLACEHOLDER = '.';

function mapearProveedor(dto: ProveedorApi): ProveedorMock {
  const nombreCrudo = dto.nombreCompleto?.trim() || dto.nombre?.trim() || 'Proveedor sin nombre';
  return {
    id: dto.idProveedor,
    nif: dto.dni?.trim() || '',
    nombre: limpiarNombreProveedor(nombreCrudo),
    direccion: dto.direccionFacturacion?.direccion?.trim() || undefined,
    poblacion: dto.direccionFacturacion?.poblacion?.trim() || undefined,
    cp: dto.direccionFacturacion?.codigoPostal?.trim() || undefined,
    provincia: dto.direccionFacturacion?.provincia?.trim() || undefined,
  };
}

/**
 * Adaptador real: `buscar` y `crearAdHoc` hablan con el backend
 * (POST /api/Proveedores/Enumerar y POST /api/Proveedores/Crear, ambos confirmados en
 * código 2026-08-14).
 *
 * EnumerarProveedoresRequest solo admite buscar por 'nombre' O por 'dni' (son AND, no OR,
 * en el SQL del backend, así que no se pueden mandar los dos a la vez esperando un OR) —
 * este buscador manual usa 'nombre', igual que el resto de buscadores de la app.
 *
 * CrearProveedorRequest exige 'nombre' Y 'apellido1' por separado, como si 'proveedores'
 * fuera siempre una persona física (viene de reutilizar la misma tabla 'sujeto' que
 * clientes/empleados) — pero un proveedor de esta app es casi siempre una empresa, con un
 * único texto de razón social (el que da el OCR, ej. "IBERDROLA CLIENTES, S.A.U."), nunca
 * separado en nombre/apellidos de verdad. Decisión del jefe (2026-08-14): la razón social
 * completa va en 'nombre', apellido1 se manda como placeholder fijo '.' (ver
 * APELLIDO1_PLACEHOLDER) — no un espacio en blanco, el backend lo rechaza (usa
 * IsNullOrWhiteSpace, no IsNullOrEmpty, confirmado en pruebas reales 2026-08-14).
 */
@Injectable()
export class HttpSuppliersRepository extends SuppliersRepository {
  private api = inject(ApiService);

  async buscar(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ProveedorMock>> {
    const q = query.trim();
    // Mismo criterio que el resto de buscadores bajo demanda de la app: nunca un listado
    // completo sin al menos 2 caracteres.
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const idEmpresa = this.api.getEmpresaId();
    // BUG real encontrado en auditoría 2026-08-14: devolver aquí una página vacía (en vez de
    // lanzar) hacía que un problema real de sesión (token sin el claim EmpresaId, o
    // corrupto) se viera en el selector como "Sin resultados para...", ocultando que en
    // realidad no se llegó a buscar nada — inconsistente además con crearAdHoc(), que sí
    // deja que este mismo caso falle con el error real del backend.
    if (idEmpresa == null) {
      throw new Error('No se ha podido identificar la empresa de tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
    }

    const body = { idEmpresa, nombre: q, top: pageSize };
    const resultado = await this.api.post<ProveedorApi[]>(`${PROVEEDORES_BASE_PATH}/Enumerar`, body);
    const items = (resultado ?? []).map(mapearProveedor);

    // Enumerar no pagina de verdad (ni page ni skip, solo 'top') — 'total' aquí es lo que
    // ha devuelto esta llamada, no un recuento real de coincidencias en la base de datos.
    // Misma limitación conocida que ya tiene Facturas Recibidas, no es un bug de aquí.
    return { items, total: items.length, page, pageSize };
  }

  async crearAdHoc(data: Omit<ProveedorMock, 'id'>): Promise<ProveedorMock> {
    if (!data.nombre?.trim() || !data.nif?.trim()) {
      throw new Error('Nombre y NIF son obligatorios.');
    }
    // El backend exige también dirección/CP/población/provincia (400 si falta alguno) —
    // se comprueba aquí para dar un mensaje claro en vez de esperar al rechazo del backend.
    if (!data.direccion?.trim() || !data.cp?.trim() || !data.poblacion?.trim() || !data.provincia?.trim()) {
      throw new Error('Dirección, código postal, población y provincia son obligatorios.');
    }

    const body = {
      idEmpresa: this.api.getEmpresaId() ?? undefined,
      nombre: data.nombre.trim(),
      apellido1: APELLIDO1_PLACEHOLDER,
      nif: data.nif.trim(),
      direccion: data.direccion.trim(),
      codigoPostal: data.cp.trim(),
      poblacion: data.poblacion.trim(),
      provincia: data.provincia.trim(),
    };

    // Errores esperables del backend, ya con mensaje humano listo para mostrar tal cual:
    // 409 si el NIF ya existe para esta empresa, 400 si la provincia no coincide con
    // ninguna de las que tiene configuradas la empresa (comparación exacta, no parcial).
    const dto = await this.api.post<ProveedorApi>(`${PROVEEDORES_BASE_PATH}/Crear`, body);
    return mapearProveedor(dto);
  }
}
