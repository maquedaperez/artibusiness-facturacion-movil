import { Injectable, inject } from '@angular/core';
import { SuppliersRepository } from '../../ports/suppliers.repository';
import { ApiService } from '../../../services/api.service';
import { ProveedorMock } from '../../../services/mock-facturas.service';
import { PaginaResultado } from '../../../shared/types/pagination';

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
// obligatorio"). Como esta app trata cada proveedor como una única razón social sin nombre/
// apellidos de verdad, se parte por el último espacio: todo menos la última palabra va a
// Nombre, la última palabra va a Apellido1. El backend reconstruye nombreCompleto como
// "Nombre Apellido1 Apellido2" (RTRIM/Join con espacios), así que esto reproduce el texto
// original exacto sin ningún artefacto visible — no es un intento real de separar
// nombre/apellidos, solo una forma mecánica de rellenar los dos campos obligatorios.
function partirNombreApellido1(razonSocial: string): { nombre: string; apellido1: string } {
  const texto = razonSocial.trim();
  const ultimoEspacio = texto.lastIndexOf(' ');
  if (ultimoEspacio === -1) {
    // Razón social de una sola palabra (raro) — no hay nada que partir sin inventar un
    // apellido que no es tal, así que aquí sí hace falta un placeholder visible.
    return { nombre: texto, apellido1: '-' };
  }
  return {
    nombre: texto.slice(0, ultimoEspacio).trim(),
    apellido1: texto.slice(ultimoEspacio + 1).trim(),
  };
}

function mapearProveedor(dto: ProveedorApi): ProveedorMock {
  return {
    id: dto.idProveedor,
    nif: dto.dni?.trim() || '',
    nombre: dto.nombreCompleto?.trim() || dto.nombre?.trim() || 'Proveedor sin nombre',
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
 * separado en nombre/apellidos de verdad. Ver partirNombreApellido1(): se parte por el
 * último espacio (no se manda un espacio en blanco como apellido1 — el backend lo rechaza,
 * usa IsNullOrWhiteSpace, no IsNullOrEmpty, confirmado en pruebas reales 2026-08-14).
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
    if (idEmpresa == null) return { items: [], total: 0, page, pageSize };

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

    const { nombre, apellido1 } = partirNombreApellido1(data.nombre);
    const body = {
      idEmpresa: this.api.getEmpresaId() ?? undefined,
      nombre,
      apellido1,
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
