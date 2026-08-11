// Forma compartida por todas las búsquedas paginadas bajo demanda (clientes,
// proveedores y, más adelante, catálogo/suscripciones) — mismo contrato para
// el adapter mock y para el futuro adapter HTTP. Vive fuera de core/ y services/
// porque ambas capas la necesitan (services la produce, ports la expone) y no
// pertenece exclusivamente a ninguna de las dos.
export type PaginaResultado<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
