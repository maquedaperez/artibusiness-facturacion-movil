// Petición explícita del jefe (reunión 2026-08-14): al mostrar el nombre de un proveedor,
// si es una empresa debe verse solo la razón social, sin nada más. Esta app da de alta
// proveedores tipo empresa mandando 'apellido1' como un punto fijo ('.') — decisión también
// del jefe, ver suppliers.repository.http.ts — porque el backend exige ese campo no vacío.
// El backend reconstruye el nombre completo concatenando nombre+apellido1+apellido2 con
// espacios (tanto en ProveedorService.CrearAsync como en las consultas SQL de
// FacturaRecibidaService), así que ese punto queda pegado y visible al final: "Iberdrola
// Clientes, S.A.U. .". Aquí no siempre se tiene acceso a los campos por separado (el listado
// de Facturas Recibidas solo da el nombre ya concatenado), así que se limpia por patrón: un
// punto suelto al final, precedido de espacio, se quita. Un proveedor persona física real
// nunca debería llevar un apellido de un solo punto, así que este recorte no le afecta.
export function limpiarNombreProveedor(nombre: string): string {
  return nombre.replace(/\s+\.\s*$/, '').trim();
}
