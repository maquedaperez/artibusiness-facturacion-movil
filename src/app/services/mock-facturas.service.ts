import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { PaginaResultado } from '../shared/types/pagination';

export type EstadoFactura = 'borrador' | 'contabilizada' | 'firmada';
export type EstadoAeat = 'PendienteEnvio' | 'Correcto' | 'AceptadoConErrores' | 'RechazadoAeat' | 'RequiereRevisionManual';

export type Numerador = {
  id: number;
  nombre: string;
};

// Forma alineada con Clientes/ClienteUsuario del backend real (findbynif/findbyname/insert).
export type ClienteMock = {
  id: number;
  nif: string;
  nombre: string;
  esEmpresa: boolean;
  direccion?: string;
  poblacion?: string;
  cp?: string;
  provincia?: string;
};

export type Destinatario = Omit<ClienteMock, 'id'>;

// Selector ligero de proveedor (buscar + alta rápida), igual que ClienteMock pero
// para el lado de Facturas Recibidas. No es una ficha de proveedor completa
// (eso incluiría mucho más en la web real) — solo lo mínimo para no escribir a
// mano el proveedor y su NIF en cada factura recibida.
export type ProveedorMock = {
  id: number;
  nif: string;
  nombre: string;
  direccion?: string;
  poblacion?: string;
  cp?: string;
  provincia?: string;
};

// Datos fiscales del emisor (nuestra empresa/tenant). Alineado con el modelo real
// Empresa.cs (CifEmpresa, IdDireccion, RegistroMercantil/Hoja/Folio/Tomo, Cnae, Iban, Swift),
// más el toggle autónomo/empresa que pidió el jefe — pendiente de confirmar si el backend
// real lo soporta (Empresa.cs de ARTI Software no lo tenía, pero puede variar por cliente).
// Solo lectura en su totalidad: identidad fiscal, dirección y datos adicionales
// llegan de alta/backend (Empresa + Direccion en ARTIBusiness — ver
// docs/AUDITORIA_INTEGRACION_BACKEND.md sección E). Ningún campo se edita desde la
// app móvil — decisión explícita, no una limitación temporal del MVP.
export type EmisorFiscal = {
  esEmpresa: boolean;
  nombre: string;
  nif: string;
  direccion: string;
  poblacion: string;
  cp: string;
  provincia: string;
  telefono: string;
  registroMercantil: string;
  cnae: string;
  iban: string;
  swift: string;
};

export type OrigenLinea = 'catalogo' | 'suscripcion' | 'manual';

// Referencia al producto/suscripción de origen — solo para trazabilidad (saber de
// dónde salió la línea). Los datos de la línea en sí (descripcion/precio/iva) son
// una copia congelada en el momento de añadirla: si el producto cambia de precio
// después, las facturas ya guardadas no se enteran.
export type OrigenLineaRef = { tipo: 'catalogo' | 'suscripcion'; id: number };

// Forma alineada con FacturacionFacturasEmitidasLineas del backend real.
// ivaPct sustituye a IdImpuesto (catálogo de impuestos) mientras no exista el endpoint.
export type LineaFactura = {
  id: number;
  origen: OrigenLinea;
  origenRef?: OrigenLineaRef;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  ivaPct: number;
  // Solo Facturas Recibidas: id real de la línea en Facturacion$FacturasRecibidasLineas,
  // presente cuando la línea viene de leer una factura real del backend. Al volver a
  // guardar, se manda de vuelta para que el backend actualice esa línea en vez de
  // borrarla y crear una nueva (GuardarAsync ya soporta esto por id_facturaRecibidaLinea).
  idLineaBackend?: number;
};

// Producto/servicio del catálogo de la empresa — buscado bajo demanda, nunca
// cargado entero (ver CatalogRepository).
export type ProductoCatalogo = {
  id: number;
  nombre: string;
  descripcion?: string;
  precioUnitario: number;
  ivaPct: number;
  referencia?: string;
};

// Servicio recurrente/suscripción definido por la empresa — igual que el catálogo,
// pero para líneas de facturación periódica. En este lote solo se usa como origen
// de una línea puntual; no se generan renovaciones ni cobros automáticos.
export type Suscripcion = {
  id: number;
  nombre: string;
  periodicidad: string;
  precio: number;
  ivaPct: number;
  estado: 'activa' | 'pausada' | 'cancelada';
};

export type FacturaEmitida = {
  id: number;
  numFactura: string;
  numeradorId: number;
  fecha: string;
  vencimiento: string;
  // Obligatorio para el registro fiscal — el servidor FacturaE rechaza la factura
  // con error AEAT 4102 si va vacío. Confirmado contra un caso real de producción.
  concepto: string;
  // Obligatorio en el modelo real (IdMedioPago, no admite nulo) — 'medioPago' es la etiqueta
  // para mostrar, 'idMedioPago' (Fase 4, 2026-08-20) es el id real del catálogo de la empresa
  // que de verdad exige Guardar. Mismo criterio que FacturaRecibida.idMedioPago.
  medioPago: string;
  idMedioPago?: number;
  destinatario: Destinatario;
  lineas: LineaFactura[];
  estado: EstadoFactura;
  estadoAeat?: EstadoAeat;
  // Campo técnico, no se muestra al usuario: se genera al crear el borrador (no al
  // contabilizar) porque el servidor real lo exige en la petición y lo rechaza sin él.
  operacionId: string;
  // Fase 2 del plan de integración (2026-08-20), igual que esBorradorLocal/totalesReales en
  // FacturaRecibida: id real del cliente en el backend (Facturacion$FacturasEmitidasCabecera.
  // id_cliente) — solo lo rellena HttpIssuedInvoicesRepository al leer una factura real.
  idCliente?: number;
  // true mientras la factura solo existe en el almacén local de esta sesión (recién creada
  // con crearBorrador, todavía sin guardar de verdad, o datos de ejemplo del modo mock puro)
  // — mismo criterio que FacturaRecibida.esBorradorLocal. Ver listar() en
  // issued-invoices.repository.http.ts.
  esBorradorLocal?: boolean;
  // Totales oficiales tal cual los devuelve el backend real (Facturacion$FacturasEmitidasCabecera:
  // total/iva/suplidos/irpf ya calculados) — solo lo rellena HttpIssuedInvoicesRepository.
  totalesReales?: TotalesFactura;
  // Blindaje Fase 7 (2026-08-21): motivo real que da la AEAT cuando estadoAeat no es 'Correcto'
  // (código + descripción de FacturaE, ya combinados en un texto listo para mostrar) — solo lo
  // rellena HttpIssuedInvoicesRepository; sin esto, un rechazo real no daba ninguna pista de
  // qué corregir.
  avisoAeat?: string;
  // Fase 7 (Anular, 2026-08-22): presente solo si la factura se ha anulado de verdad contra
  // FacturaE/VERI*FACTU — el Alta original sigue intacta, esto es un registro nuevo aparte.
  anulada?: boolean;
  fechaAnulacion?: string;
  // Fase 7 (Subsanar, 2026-08-24): presente solo si se ha subsanado — estadoSubsanacion es el
  // valor crudo de FacturaE (Correcto/AceptadoConErrores/Incorrecto/PendienteEnvio) para la
  // subsanación, no confundir con estadoAeat (el del Alta original, que no cambia al subsanar).
  subsanada?: boolean;
  fechaSubsanacion?: string;
  estadoSubsanacion?: string;
  motivoSubsanacion?: string;
};

export type DesgloseIva = { pct: number; baseGravada: number; cuota: number };

// La retención (IRPF, alquiler, etc.) no es un dato de la factura ni de una línea —
// la decide la configuración fiscal del emisor/actividad y se calcula al vuelo sobre
// la base imponible ya calculada, nunca la elige el usuario en el formulario.
export type ConfiguracionRetencion = {
  aplicable: boolean;
  // Código interno para identificar la regla (uso interno/futuro, no se muestra).
  tipoCodigo: string;
  // Texto que sí ve el usuario — "IRPF", "Retención alquiler", etc., según lo que
  // devuelva el backend real.
  etiqueta: string;
  porcentaje: number;
  motivoNoAplica?: string;
};

export type RetencionAplicada = {
  aplicable: boolean;
  etiqueta: string;
  porcentaje: number;
  // Base sobre la que se calcula — todos los conceptos satisfechos, excluido el IVA.
  base: number;
  importe: number;
  motivoNoAplica?: string;
};

export type TotalesFactura = {
  base: number;
  desgloseIva: DesgloseIva[];
  ivaTotal: number;
  retencion: RetencionAplicada;
  total: number;
};

// Regla general de retenciones por alquiler/subarrendamiento de inmuebles urbanos
// sujeto (AEAT, Reglamento IRPF art. 100): 19% sobre todos los conceptos satisfechos
// al arrendador, excluido el IVA. Existen excepciones (vivienda de empleados, renta
// anual ≤ 900€ sin IVA, arrendadores exonerados por epígrafe IAE, reglas territoriales
// y de no residentes) que solo el backend puede resolver caso a caso — por eso esta
// configuración NO se aplica a las facturas del MVP en vivo, solo a tests y fixtures
// aisladas que demuestran que el cálculo/formato son correctos cuando sí aplica.
export const CONFIGURACION_RETENCION_ALQUILER_DEMO: ConfiguracionRetencion = {
  aplicable: true,
  tipoCodigo: 'alquiler_urbano',
  etiqueta: 'Retención alquiler',
  porcentaje: 19,
};

function redondearCentimos(v: number): number {
  return Math.round(v * 100) / 100;
}

export function aplicarRetencion(baseImponible: number, cfg: ConfiguracionRetencion): RetencionAplicada {
  const importe = cfg.aplicable ? redondearCentimos(baseImponible * cfg.porcentaje / 100) : 0;
  return {
    aplicable: cfg.aplicable,
    etiqueta: cfg.etiqueta,
    porcentaje: cfg.porcentaje,
    base: baseImponible,
    importe,
    motivoNoAplica: cfg.aplicable ? undefined : (cfg.motivoNoAplica ?? 'No aplica retención para este emisor.'),
  };
}

// Cálculo puro compartido por Emitidas y Recibidas — misma fórmula, mismo redondeo,
// para no mantener dos versiones del mismo cálculo en dos sitios distintos.
export function calcularTotalesLineas(lineas: LineaFactura[], cfgRetencion: ConfiguracionRetencion): TotalesFactura {
  let baseSinRedondear = 0;
  const grupos = new Map<number, number>();

  for (const l of lineas) {
    // Number(...) por seguridad: ion-input puede entregar el valor como texto.
    const cantidad = Number(l.cantidad) || 0;
    const precioUnitario = Number(l.precioUnitario) || 0;
    const descuentoPct = Number(l.descuentoPct) || 0;
    const importe = cantidad * precioUnitario * (1 - descuentoPct / 100);
    baseSinRedondear += importe;
    grupos.set(l.ivaPct, (grupos.get(l.ivaPct) ?? 0) + importe);
  }
  const base = redondearCentimos(baseSinRedondear);

  const desgloseIva: DesgloseIva[] = Array.from(grupos.entries())
    .map(([pct, baseGravada]) => ({
      pct,
      baseGravada: redondearCentimos(baseGravada),
      cuota: redondearCentimos(baseGravada * pct / 100),
    }))
    .sort((a, b) => b.pct - a.pct);

  const ivaTotal = redondearCentimos(desgloseIva.reduce((s, d) => s + d.cuota, 0));
  // Suma sin redondear de la cuota de cada tipo de IVA — solo para el total final (ver
  // más abajo). ivaTotal (arriba) sigue siendo la suma de las cuotas YA redondeadas, es
  // el valor que se muestra en pantalla desglosado por tipo, no cambia.
  const ivaTotalSinRedondear = Array.from(grupos.entries())
    .reduce((s, [pct, baseGravada]) => s + (baseGravada * pct) / 100, 0);

  // La retención se calcula sobre la misma base imponible que el IVA, nunca sobre el
  // total con IVA incluido.
  const retencion = aplicarRetencion(baseSinRedondear, cfgRetencion);
  // El total se calcula sobre base e IVA SIN redondear, redondeando solo el resultado
  // final — igual que hace la factura original (confirmado contra una factura real de
  // Movistar con líneas a 4 decimales). Sumar base e ivaTotal ya redondeados por
  // separado puede desviar el total en 1 céntimo respecto al de la factura de origen.
  const total = redondearCentimos(baseSinRedondear + ivaTotalSinRedondear - retencion.importe);

  return { base, desgloseIva, ivaTotal, retencion, total };
}

export type FacturaRecibida = {
  id: number;
  proveedor: string;
  proveedorNif?: string;
  // Id real del proveedor en el backend (Facturacion$proveedores / tabla 'proveedores') —
  // solo se rellena cuando el usuario lo elige del buscador real (ProveedorSelectorComponent
  // ya conectado a POST /api/Proveedores/Enumerar) o, más adelante, cuando el flujo de
  // Guardar lo resuelva automáticamente por NIF. Sin esto, 'proveedor'/'proveedorNif' son
  // solo texto (del OCR o escritos a mano) y no sirven para guardar contra el backend real
  // — Guardar exige el id, no el nombre.
  idProveedor?: number;
  // Dirección del proveedor tal como la extrajo el OCR (disponible en el esquema de la API
  // desde siempre, solo no se leía porque no hacía falta) — se guarda para poder
  // pre-rellenar la pantalla de alta de proveedor en cuanto exista Proveedores/Crear en el
  // backend. Nunca se usa para nada más mientras tanto.
  proveedorDireccion?: string;
  proveedorPoblacion?: string;
  proveedorCp?: string;
  proveedorProvincia?: string;
  numFactura: string;
  fecha: string;
  vencimiento?: string;
  concepto?: string;
  // 'formaPago' es solo texto libre (lo que extrae el OCR de payment.payment_method, o lo
  // que se escriba a mano) — no viaja a Guardar, es informativo. 'idMedioPago' es el id
  // real del catálogo de la empresa (POST /api/MediosPago/Enumerar), el que de verdad se
  // manda al backend; se rellena al elegir una opción del desplegable real.
  formaPago?: string;
  idMedioPago?: number;
  lineas: LineaFactura[];
  // % de retención que declara la propia factura del proveedor — a diferencia del
  // IRPF de las emitidas (que sale de la configuración fiscal de nuestra empresa),
  // este es un dato del documento recibido: lo indica el proveedor, no lo decidimos
  // nosotros. Se muestra igualmente solo en el bloque de totales, nunca por línea.
  retencionPct: number;
  pagada: boolean;
  // Corrección 2026-08-14: el código numérico 132 corresponde a "Contabilizada" en
  // ag_estado, no a un simple repaso interno — el nombre 'revisada' se queda por no tocar
  // el resto del código que ya lo usa, pero SÍ implica bloqueo contable real (por eso
  // accountingLocked se deriva de este estado en received-invoices.repository.http.ts).
  // 131=Borrador es el único estado libremente editable; cualquier otro código (132,
  // 133/'firmada' si algún día aplicara, o uno no reconocido) cae en 'revisada' por
  // defecto — conservador a propósito, ver estadoDesdeApi().
  estado: 'borrador' | 'revisada';
  origenOcr: boolean;
  documentoUrl?: string;
  documentoNombre?: string;
  // Solo Facturas Recibidas: true mientras la factura solo existe en el almacén local de
  // esta sesión (recién escaneada/creada a mano/duplicada, todavía sin guardar de verdad, o
  // datos de ejemplo del modo mock puro) — nunca inferido a partir del id. Antes se usaba
  // "id >= 100" para distinguirlo, pero un id real del backend puede perfectamente ser >=
  // 100 en cualquier empresa con más de un puñado de facturas — ese criterio podía
  // colisionar. Ver listar() en received-invoices.repository.http.ts.
  esBorradorLocal?: boolean;
  // Bloqueo contable real — lo deriva HttpReceivedInvoicesRepository a partir del estado
  // (132/'revisada' = contabilizada = bloqueada) para toda factura leída del backend real.
  // Mientras nadie lo marque (modo mock puro), la factura sigue siendo editable.
  accountingLocked?: boolean;
  accountingLockReason?: string;
  accountingPeriodClosed?: boolean;
  // Avisos capturados al escanear (origenOcr=true): tanto los "warnings" que la propia
  // API de OCR devuelve sobre su extracción, como los que generamos nosotros al detectar
  // que nuestro total calculado no coincide con el declarado en el documento original.
  // Se calculan UNA vez al crear el borrador, no se recalculan al editar — sirven como
  // registro de "esto merecía revisión cuando se escaneó", no como validación en vivo.
  avisosOcr?: string[];
  // Totales oficiales tal cual los devuelve el backend real (POST /api/FacturasRecibidas),
  // ya calculados con las tasas de impuesto reales de la BD. Solo lo rellena
  // HttpReceivedInvoicesRepository: como id_impuesto es una FK sin catálogo expuesto
  // todavía, no podemos reconstruir el % de IVA por línea con garantías, así que en vez
  // de recalcular (y arriesgarnos a mostrar un IVA/total inventado) se usa este valor
  // directamente cuando está presente. Ver AUDITORIA_INTEGRACION_BACKEND.md.
  totalesReales?: TotalesFactura;
};

// Claves de traducción (namespace verifactu.estados/verifactu.subsanacion, ver
// src/assets/i18n/*.json) — el valor crudo de EstadoAeat es el código que devuelve el
// backend/AEAT y NUNCA se traduce ni se altera; solo la ETIQUETA visible que lo explica
// al usuario pasa por Transloco.
const ESTADO_AEAT_LABEL_KEYS: Record<EstadoAeat, string> = {
  PendienteEnvio: 'verifactu.estados.pendienteEnvio',
  Correcto: 'verifactu.estados.correcto',
  AceptadoConErrores: 'verifactu.estados.aceptadoConErrores',
  RechazadoAeat: 'verifactu.estados.rechazadoAeat',
  RequiereRevisionManual: 'verifactu.estados.requiereRevisionManual',
};

// Política única y centralizada de acciones — ninguna pantalla decide por su cuenta
// si se puede editar/eliminar/copiar/descargar. Cuando el backend real ofrezca
// `allowedActions`, esta función deja de calcular y pasa a mapear directamente esa
// respuesta (ver docs/SERVICE_CONTRACT_GAPS.md).
export type AccionesPermitidas = {
  editar: boolean;
  eliminar: boolean;
  copiar: boolean;
  descargar: boolean;
  compartir: boolean;
};

// Política de EMITIDAS únicamente — depende del estado fiscal real (borrador vs.
// contabilizada/firmada), porque estas facturas sí se remiten a Verifactu/AEAT.
// estadoReconocido en false cubre tanto un estado que no reconocemos como uno que,
// aun siendo válido, no es ni "borrador" ni el resto de estados de una factura
// definitiva conocidos — se resuelve siempre del lado conservador (lectura sí, nada
// que mute la factura, salvo copiar/descargar que no alteran el original).
function accionesEmitidaPorEstado(esBorrador: boolean, estadoReconocido: boolean): AccionesPermitidas {
  if (!estadoReconocido) {
    return { editar: false, eliminar: false, copiar: false, descargar: true, compartir: true };
  }
  if (esBorrador) {
    return { editar: true, eliminar: true, copiar: true, descargar: true, compartir: true };
  }
  // Contabilizada/firmada — definitiva: ya no se edita ni se borra desde aquí (borrar
  // una factura contabilizada requeriría una operación de anulación autorizada
  // distinta, que no existe todavía — ver gap correspondiente).
  return { editar: false, eliminar: false, copiar: true, descargar: true, compartir: true };
}

export function accionesFacturaEmitida(f: FacturaEmitida): AccionesPermitidas {
  const reconocido = f.estado === 'borrador' || f.estado === 'contabilizada' || f.estado === 'firmada';
  return accionesEmitidaPorEstado(f.estado === 'borrador', reconocido);
}

// Política de RECIBIDAS — deliberadamente independiente de la de Emitidas. Esta app
// Regla confirmada por el jefe (reunión 2026-08-17), igual que ya hace accionesFacturaEmitida
// para 'contabilizada'/'firmada': Borrador permite las 4 acciones (copiar/descargar/
// compartir/eliminar). Contabilizada (estado 132, accountingLocked=true) bloquea editar Y
// eliminar — solo quedan copiar/descargar/compartir. 'pagada' bloquea eliminar aparte,
// independientemente del estado (protección conservadora en el front: el backend
// (EliminarAsync) todavía no impide borrar una factura pagada, pero no tiene sentido
// dejarlo desde la app sin ningún movimiento contable real detrás — fuera de alcance,
// pagos vía agt_caja).
//
// BUG real corregido 2026-08-17: antes 'eliminar' solo miraba 'pagada', nunca
// accountingLocked — una factura ya contabilizada (no pagada) se podía seguir borrando
// desde la app sin ningún aviso.
export function accionesFacturaRecibida(f: FacturaRecibida): AccionesPermitidas {
  const bloqueada = !!f.accountingLocked;
  return {
    editar: !bloqueada,
    eliminar: !f.pagada && !bloqueada,
    copiar: true,
    descargar: true,
    compartir: true,
  };
}

export const IVA_RATES = [0, 4, 10, 21];
export const IRPF_RATES = [0, 1, 7, 15, 19];
// Placeholder mientras no exista el catálogo real de medios de pago (IdMedioPago).
export const MEDIO_PAGO_OPTIONS = ['Transferencia', 'Domiciliación', 'Tarjeta', 'Efectivo', 'Cheque'];

let nextEmitidaId = 100;
let nextLineaId = 1000;
let nextClienteId = 100;
let nextRecibidaId = 100;
let nextProveedorId = 100;

@Injectable({ providedIn: 'root' })
export class MockFacturasService {
  private transloco = inject(TranslocoService);

  private emisor: EmisorFiscal = {
    esEmpresa: true,
    nombre: 'Mi Empresa de Ejemplo S.L.',
    nif: 'B00000000',
    direccion: 'Calle de Ejemplo 1',
    poblacion: 'Madrid',
    cp: '28001',
    provincia: 'Madrid',
    telefono: '',
    registroMercantil: '',
    cnae: '',
    iban: '',
    swift: '',
  };

  // Configuración por defecto del MVP: sin retención. La fixture de alquiler urbano
  // (CONFIGURACION_RETENCION_ALQUILER_DEMO) es solo para tests, no se aplica aquí.
  private configuracionRetencion: ConfiguracionRetencion = {
    aplicable: false,
    tipoCodigo: 'ninguna',
    etiqueta: 'Retención',
    porcentaje: 0,
  };

  private numeradores: Numerador[] = [
    { id: 1, nombre: 'Serie A 2026' },
    { id: 2, nombre: 'Serie B 2026' },
  ];

  private clientes: ClienteMock[] = [
    {
      id: 1, nif: 'B12345678', nombre: 'Clínica Dental Sonrisas SL', esEmpresa: true,
      direccion: 'Calle Mayor 12', poblacion: 'Madrid', cp: '28013', provincia: 'Madrid',
    },
    {
      id: 2, nif: 'A87654321', nombre: 'Transportes Ibáñez SA', esEmpresa: true,
      direccion: 'Polígono Industrial Norte, Nave 4', poblacion: 'Getafe', cp: '28905', provincia: 'Madrid',
    },
    {
      id: 3, nif: '12345678Z', nombre: 'María Fernández López', esEmpresa: false,
      direccion: 'Avenida de la Constitución 5', poblacion: 'Alcorcón', cp: '28921', provincia: 'Madrid',
    },
    {
      id: 4, nif: 'B99887766', nombre: 'Asesoría Martín & Ruiz SL', esEmpresa: true,
      direccion: 'Calle Alcalá 200', poblacion: 'Madrid', cp: '28028', provincia: 'Madrid',
    },
  ];

  private proveedores: ProveedorMock[] = [
    {
      id: 1, nif: 'B11223344', nombre: 'Suministros Oficina Norte SL',
      direccion: 'Calle del Almacén 8', poblacion: 'Madrid', cp: '28022', provincia: 'Madrid',
    },
    {
      id: 2, nif: '44556677Q', nombre: 'Electricidad Vidal e Hijos',
      direccion: 'Polígono Industrial Sur, Nave 12', poblacion: 'Alcobendas', cp: '28108', provincia: 'Madrid',
    },
  ];

  private catalogo: ProductoCatalogo[] = [
    { id: 1, nombre: 'Revisión anual de instalación', precioUnitario: 1200, ivaPct: 21, referencia: 'SRV-001' },
    { id: 2, nombre: 'Servicio de transporte (trayecto)', precioUnitario: 85, ivaPct: 21, referencia: 'SRV-002' },
    { id: 3, nombre: 'Asesoría fiscal (hora)', precioUnitario: 60, ivaPct: 21, referencia: 'SRV-003' },
    { id: 4, nombre: 'Material fungible (lote)', precioUnitario: 340, ivaPct: 21, referencia: 'PRD-001' },
    { id: 5, nombre: 'Consultoría de proceso (hora)', precioUnitario: 50, ivaPct: 21, referencia: 'SRV-004' },
  ];

  private suscripciones: Suscripcion[] = [
    { id: 1, nombre: 'Mantenimiento mensual básico', periodicidad: 'Mensual', precio: 90, ivaPct: 21, estado: 'activa' },
    { id: 2, nombre: 'Soporte premium', periodicidad: 'Mensual', precio: 150, ivaPct: 21, estado: 'activa' },
    { id: 3, nombre: 'Licencia anual de gestoría', periodicidad: 'Anual', precio: 600, ivaPct: 21, estado: 'pausada' },
  ];

  private emitidas: FacturaEmitida[] = [
    {
      id: 1, numFactura: 'A-2026-014', numeradorId: 1, fecha: '2026-08-05', vencimiento: '2026-09-04',
      concepto: 'Revisión anual de instalación', medioPago: 'Transferencia',
      destinatario: this.clientes[0],
      lineas: [
        { id: 1, origen: 'manual', descripcion: 'Revisión anual instalación', cantidad: 1, precioUnitario: 1200, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'borrador', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 2, numFactura: 'A-2026-015', numeradorId: 1, fecha: '2026-08-07', vencimiento: '2026-09-06',
      concepto: 'Servicio de transporte mensual', medioPago: 'Domiciliación',
      destinatario: this.clientes[1],
      lineas: [
        { id: 2, origen: 'manual', descripcion: 'Servicio de transporte mensual', cantidad: 1, precioUnitario: 850, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'borrador', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 3, numFactura: 'A-2026-011', numeradorId: 1, fecha: '2026-07-28', vencimiento: '2026-08-27',
      concepto: 'Asesoría fiscal — julio 2026', medioPago: 'Transferencia',
      destinatario: this.clientes[3],
      lineas: [
        { id: 3, origen: 'manual', descripcion: 'Asesoría fiscal julio', cantidad: 1, precioUnitario: 600, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'contabilizada', estadoAeat: 'PendienteEnvio', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 4, numFactura: 'B-2026-003', numeradorId: 2, fecha: '2026-07-30', vencimiento: '2026-08-29',
      concepto: 'Reparación de flota y gestoría asociada', medioPago: 'Transferencia',
      destinatario: this.clientes[1],
      lineas: [
        { id: 4, origen: 'manual', descripcion: 'Reparación flota', cantidad: 1, precioUnitario: 2100, descuentoPct: 0, ivaPct: 21 },
        { id: 5, origen: 'manual', descripcion: 'Tasas de gestoría', cantidad: 1, precioUnitario: 35, descuentoPct: 0, ivaPct: 0 },
      ],
      estado: 'contabilizada', estadoAeat: 'RequiereRevisionManual', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 5, numFactura: 'A-2026-009', numeradorId: 1, fecha: '2026-07-15', vencimiento: '2026-08-14',
      concepto: 'Suministro de material fungible', medioPago: 'Tarjeta',
      destinatario: this.clientes[0],
      lineas: [
        { id: 6, origen: 'manual', descripcion: 'Material fungible', cantidad: 1, precioUnitario: 340, descuentoPct: 0, ivaPct: 21 },
      ],
      estado: 'firmada', estadoAeat: 'Correcto', operacionId: this.nuevoOperacionId(),
    },
    {
      id: 6, numFactura: 'A-2026-008', numeradorId: 2, fecha: '2026-07-10', vencimiento: '2026-08-09',
      concepto: 'Consultoría de proceso y mantenimiento', medioPago: 'Transferencia',
      destinatario: this.clientes[3],
      lineas: [
        { id: 7, origen: 'manual', descripcion: 'Consultoría de proceso A', cantidad: 2, precioUnitario: 50, descuentoPct: 0, ivaPct: 21 },
        { id: 8, origen: 'manual', descripcion: 'Mantenimiento B', cantidad: 3, precioUnitario: 20, descuentoPct: 8.33, ivaPct: 10 },
      ],
      estado: 'firmada', estadoAeat: 'AceptadoConErrores', operacionId: this.nuevoOperacionId(),
    },
  ];

  private recibidas: FacturaRecibida[] = [
    {
      id: 1, proveedor: 'Suministros Oficina Norte SL', proveedorNif: 'B11223344',
      numFactura: 'F-4521', fecha: '2026-08-04', vencimiento: '2026-08-18',
      concepto: 'Material de oficina', formaPago: 'Domiciliación',
      lineas: [
        { id: 901, origen: 'manual', descripcion: 'Material de oficina', cantidad: 1, precioUnitario: 154.81, descuentoPct: 0, ivaPct: 21 },
      ],
      retencionPct: 0,
      pagada: true, estado: 'revisada', origenOcr: false,
    },
    {
      id: 2, proveedor: 'Electricidad Vidal e Hijos', proveedorNif: '44556677Q',
      numFactura: 'FV-2026-0912', fecha: '2026-08-06', vencimiento: '2026-08-20',
      concepto: 'Suministro eléctrico', formaPago: 'Domiciliación',
      lineas: [
        { id: 902, origen: 'manual', descripcion: 'Suministro eléctrico', cantidad: 1, precioUnitario: 448.02, descuentoPct: 0, ivaPct: 21 },
      ],
      retencionPct: 0,
      pagada: false, estado: 'borrador', origenOcr: true,
    },
  ];

  // ---------- Emisor (datos fiscales de la empresa) ----------

  getEmisor(): EmisorFiscal {
    return { ...this.emisor };
  }

  // ---------- Numeradores ----------

  getNumeradores(): Numerador[] {
    return [...this.numeradores];
  }

  numeradorNombre(id: number): string {
    return this.numeradores.find(n => n.id === id)?.nombre ?? '—';
  }

  // ---------- Clientes ----------

  // Búsqueda bajo demanda: con menos de 2 caracteres no devuelve nada (nunca "todos
  // los clientes") — el mismo mínimo que exige el selector en el componente, pero
  // reforzado aquí para que la regla no dependa solo de la UI.
  async buscarClientesPaginado(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ClienteMock>> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const todos = this.clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q)
    );
    const inicio = (page - 1) * pageSize;
    return { items: todos.slice(inicio, inicio + pageSize), total: todos.length, page, pageSize };
  }

  // idMedioPago no se modela en ClienteMock (solo lo necesita el backend real, ver
  // ClienteService.CrearAsync) — se acepta aquí solo para mantener la misma firma que el
  // puerto/adaptador HTTP.
  crearClienteAdHoc(data: Destinatario, _idMedioPago: number): ClienteMock {
    const nuevo: ClienteMock = { id: nextClienteId++, ...data };
    this.clientes.push(nuevo);
    return nuevo;
  }

  // ---------- Proveedores ----------

  async buscarProveedoresPaginado(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ProveedorMock>> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const todos = this.proveedores.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.nif.toLowerCase().includes(q)
    );
    const inicio = (page - 1) * pageSize;
    return { items: todos.slice(inicio, inicio + pageSize), total: todos.length, page, pageSize };
  }

  crearProveedorAdHoc(data: Omit<ProveedorMock, 'id'>): ProveedorMock {
    const nuevo: ProveedorMock = { id: nextProveedorId++, ...data };
    this.proveedores.push(nuevo);
    return nuevo;
  }

  // ---------- Facturas emitidas ----------

  estadoAeatLabel(estado?: EstadoAeat): string {
    return estado ? this.transloco.translate(ESTADO_AEAT_LABEL_KEYS[estado]) : this.transloco.translate('verifactu.estados.sinDatos');
  }

  // Fase 7 (Subsanar, 2026-08-24): traduce el valor crudo que guarda el backend (mismo criterio
  // que estadoAeatLabel) a las etiquetas que pidió el negocio para distinguir un desenlace de
  // subsanación de un desenlace de Alta normal. El código crudo (`estado`) es el que devuelve
  // el backend/AEAT y nunca se traduce; solo aparece interpolado dentro de la frase genérica
  // del caso por defecto, nunca sustituido por texto traducido.
  estadoSubsanacionLabel(estado?: string): string {
    switch (estado) {
      case 'Correcto': return this.transloco.translate('verifactu.subsanacion.aceptada');
      case 'AceptadoConErrores': return this.transloco.translate('verifactu.subsanacion.aceptadaConErrores');
      case 'Incorrecto': return this.transloco.translate('verifactu.subsanacion.rechazada');
      case 'PendienteEnvio':
      case 'PendienteReenvioTecnico':
        return this.transloco.translate('verifactu.subsanacion.pendienteEnvio');
      default: return estado ? this.transloco.translate('verifactu.subsanacion.prefijoGenerico', { estado }) : this.transloco.translate('verifactu.estados.sinDatos');
    }
  }

  getFacturasEmitidas(estado: EstadoFactura, numeradorId: number | null = null): FacturaEmitida[] {
    return this.emitidas
      .filter(f => f.estado === estado)
      .filter(f => numeradorId == null || f.numeradorId === numeradorId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  getFacturaById(id: number): FacturaEmitida | undefined {
    return this.emitidas.find(f => f.id === id);
  }

  // Genera un GUID por factura. El servidor real rechaza la petición si no viaja un
  // OperacionId — y tiene que existir ya desde el borrador, no generarse al contabilizar.
  private nuevoOperacionId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  crearBorrador(numeradorId: number, destinatario: Destinatario): FacturaEmitida {
    const id = nextEmitidaId++;
    const nueva: FacturaEmitida = {
      id,
      numFactura: `${this.numeradorNombre(numeradorId).split(' ')[1] ?? 'X'}-BORRADOR-${id}`,
      numeradorId,
      fecha: new Date().toISOString().slice(0, 10),
      vencimiento: '',
      concepto: '',
      medioPago: '',
      destinatario,
      lineas: [],
      estado: 'borrador',
      operacionId: this.nuevoOperacionId(),
      esBorradorLocal: true,
    };
    this.emitidas.unshift(nueva);
    return nueva;
  }

  actualizarBorrador(id: number, cambios: Partial<Pick<FacturaEmitida, 'fecha' | 'vencimiento' | 'concepto' | 'medioPago' | 'destinatario' | 'lineas' | 'numeradorId'>>): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f || f.estado !== 'borrador') return;
    Object.assign(f, cambios);
  }

  nuevoIdLinea(): number {
    return nextLineaId++;
  }

  contabilizar(id: number): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) return;
    f.estado = 'contabilizada';
    f.estadoAeat = 'PendienteEnvio';
  }

  firmar(id: number): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) return;
    f.estado = 'firmada';
    f.estadoAeat = 'Correcto';
  }

  // Fase 7 (Anular, 2026-08-22): simulación equivalente a contabilizar/firmar — el estado
  // fiscal (estado/estadoAeat) no cambia, igual que en el backend real, solo se marca 'anulada'.
  anular(id: number): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) return;
    if (f.estado === 'borrador') throw new Error(this.transloco.translate('verifactu.errors.anularBorrador'));
    if (f.anulada) throw new Error(this.transloco.translate('verifactu.errors.yaAnulada'));
    f.anulada = true;
    f.fechaAnulacion = new Date().toISOString().slice(0, 10);
  }

  // Fase 7 (Subsanar, 2026-08-24): simulación equivalente — no toca cliente/líneas/importes,
  // solo deja constancia de la subsanación, igual que hace el backend real.
  subsanar(id: number, motivo: string): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) return;
    if (f.estado === 'borrador') throw new Error(this.transloco.translate('verifactu.errors.subsanarBorrador'));
    if (f.anulada) throw new Error(this.transloco.translate('verifactu.errors.subsanarAnulada'));
    if (!motivo?.trim()) throw new Error(this.transloco.translate('verifactu.errors.motivoObligatorio'));
    // Blindaje 2026-08-24 (simulación): mismo criterio que el backend real — sin ningún cambio
    // fiscal real desde la última corrección, no hay nada que subsanar.
    if (f.subsanada) throw new Error(this.transloco.translate('verifactu.errors.sinCambiosFiscales'));
    f.subsanada = true;
    f.fechaSubsanacion = new Date().toISOString().slice(0, 10);
    f.estadoSubsanacion = 'Correcto';
    f.motivoSubsanacion = motivo.trim();
  }

  // Solo borra borradores — coherente con AccionesPermitidas.eliminar, que nunca es
  // true para una factura contabilizada/firmada. No simula un borrado fiscal real.
  eliminarEmitida(id: number): void {
    const f = this.emitidas.find(e => e.id === id);
    if (!f || f.estado !== 'borrador') return;
    this.emitidas = this.emitidas.filter(e => e.id !== id);
  }

  // Copiar SIEMPRE crea un borrador nuevo y limpio: sin id/serie definitiva, sin
  // estado fiscal, sin fecha de emisión definitiva ni OperacionId anterior. Conserva
  // cliente, concepto y líneas (con ids de línea nuevos, no compartidos con el
  // original) como punto de partida.
  duplicarEmitida(id: number): FacturaEmitida | undefined {
    const original = this.emitidas.find(e => e.id === id);
    if (!original) return undefined;

    const nuevoId = nextEmitidaId++;
    const copia: FacturaEmitida = {
      id: nuevoId,
      numFactura: `${this.numeradorNombre(original.numeradorId).split(' ')[1] ?? 'X'}-BORRADOR-${nuevoId}`,
      numeradorId: original.numeradorId,
      fecha: new Date().toISOString().slice(0, 10),
      vencimiento: '',
      concepto: original.concepto,
      medioPago: original.medioPago,
      destinatario: { ...original.destinatario },
      lineas: original.lineas.map(l => ({ ...l, id: nextLineaId++ })),
      estado: 'borrador',
      operacionId: this.nuevoOperacionId(),
    };
    this.emitidas.unshift(copia);
    return copia;
  }

  // Documento simulado (no fiscal) para descargar/compartir en modo demo — nunca se
  // presenta como el PDF/XML real de VeriFactu/FacturaE. En real, esto lo sirve el
  // backend/servicio de documentos (ver docs/SERVICE_CONTRACT_GAPS.md).
  async generarDocumentoEmitida(id: number): Promise<{ blob: Blob; nombre: string }> {
    const f = this.emitidas.find(e => e.id === id);
    if (!f) throw new Error('Factura no encontrada.');

    const totales = this.totalesFactura(f);
    const filas = f.lineas.map(l =>
      `<tr><td>${l.descripcion}</td><td>${l.cantidad}</td><td>${this.redondear(l.precioUnitario)} €</td><td>${l.ivaPct}%</td></tr>`
    ).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${f.numFactura}</title></head><body>
<h1 style="color:#b30000">SIMULACIÓN — NO VÁLIDO FISCALMENTE</h1>
<p>Documento de demostración generado en modo mock. No representa una factura real ni ha sido enviado a Verifactu/AEAT.</p>
<h2>${f.numFactura}</h2>
<p>Cliente: ${f.destinatario.nombre} (${f.destinatario.nif})</p>
<p>Concepto: ${f.concepto || '—'}</p>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>IVA</th></tr>
${filas}
</table>
<p>Base imponible: ${totales.base} €</p>
<p>IVA: ${totales.ivaTotal} €</p>
<p>Total: ${totales.total} €</p>
</body></html>`;

    return {
      blob: new Blob([html], { type: 'text/html' }),
      nombre: `${f.numFactura}-simulado.html`,
    };
  }

  private redondear(v: number): number {
    return Math.round(v * 100) / 100;
  }

  totalesFactura(f: FacturaEmitida): TotalesFactura {
    return calcularTotalesLineas(f.lineas, this.configuracionRetencion);
  }

  // ---------- Facturas recibidas ----------

  getFacturasRecibidas(): FacturaRecibida[] {
    return [...this.recibidas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  getFacturaRecibidaById(id: number): FacturaRecibida | undefined {
    return this.recibidas.find(f => f.id === id);
  }

  private leerComoDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Recibe el File real (no solo el nombre) para que la integración real solo tenga que
  // cambiar el cuerpo de este método por una subida multipart a POST /api/FacturaRecibida/desde-ocr.
  //
  // Sin Math.random(): los importes simulados salen de una lista fija recorrida por el
  // contador de id, para que la demo sea reproducible (mismo id → mismo importe) en vez
  // de generar cifras distintas en cada recarga.
  async crearDesdeOcr(file: File): Promise<FacturaRecibida> {
    const [, documentoUrl] = await Promise.all([
      new Promise(resolve => setTimeout(resolve, 1200)),
      this.leerComoDataUrl(file),
    ]);

    const id = nextRecibidaId++;
    const basesEjemplo = [128.5, 276.4, 92.15, 340.0, 187.65, 214.9];
    const base = basesEjemplo[id % basesEjemplo.length];

    const nueva: FacturaRecibida = {
      id,
      proveedor: `Proveedor detectado (${file.name})`,
      numFactura: `OCR-${1000 + id}`,
      fecha: new Date().toISOString().slice(0, 10),
      concepto: 'Pendiente de revisar',
      lineas: [
        { id: nextLineaId++, origen: 'manual', descripcion: 'Pendiente de revisar', cantidad: 1, precioUnitario: base, descuentoPct: 0, ivaPct: 21 },
      ],
      retencionPct: 0,
      pagada: false,
      estado: 'borrador',
      origenOcr: true,
      documentoUrl: documentoUrl as string,
      documentoNombre: file.name,
    };

    this.recibidas.unshift(nueva);
    return nueva;
  }

  async adjuntarDocumento(file: File): Promise<{ documentoUrl: string; documentoNombre: string }> {
    const documentoUrl = await this.leerComoDataUrl(file);
    return { documentoUrl, documentoNombre: file.name };
  }

  crearManual(data: Omit<FacturaRecibida, 'id' | 'origenOcr'>): FacturaRecibida {
    // esBorradorLocal siempre true al final, después de ...data — si 'data' viniera de
    // duplicar una factura real (que no lo lleva marcado), no debe heredar ese "vacío".
    const nueva: FacturaRecibida = { id: nextRecibidaId++, origenOcr: false, ...data, esBorradorLocal: true };
    this.recibidas.unshift(nueva);
    return nueva;
  }

  // Como crearManual, pero deja fijar origenOcr explícito. Lo usa el adaptador HTTP real
  // de OCR (docs/OCR_BACKEND_INTEGRATION.md) para guardar en este mismo almacén en
  // memoria una factura ya extraída por el backend real — el resto de endpoints de
  // Recibidas (listar/editar/eliminar) sigue sin existir (gap #13), así que de momento
  // siguen apoyándose en este mismo mock aunque la extracción ya sea real.
  registrarRecibidaExtraida(data: Omit<FacturaRecibida, 'id'>): FacturaRecibida {
    const nueva: FacturaRecibida = { id: nextRecibidaId++, ...data, esBorradorLocal: true };
    this.recibidas.unshift(nueva);
    return nueva;
  }

  // Bloqueado solo por accountingLocked — nunca por 'estado'/'pagada'. Mismo criterio
  // que eliminarRecibida/accionesFacturaRecibida. Devuelve la factura ya actualizada (o
  // undefined si no existía/estaba bloqueada) — HttpReceivedInvoicesRepository.actualizar
  // ya no delega aquí para el guardado real (ver received-invoices.repository.http.ts),
  // pero MockReceivedInvoicesRepository sigue necesitando esta devolución para cumplir el
  // contrato del puerto tal cual.
  actualizarRecibida(id: number, cambios: Partial<Omit<FacturaRecibida, 'id' | 'origenOcr'>>): FacturaRecibida | undefined {
    const f = this.recibidas.find(r => r.id === id);
    if (!f || f.accountingLocked) return undefined;
    Object.assign(f, cambios);
    return f;
  }

  // Igual regla que accionesFacturaRecibida (reunión 2026-08-17): bloqueada por
  // accountingLocked, no solo por pagada.
  eliminarRecibida(id: number): void {
    const f = this.recibidas.find(r => r.id === id);
    if (!f || f.accountingLocked) return;
    this.recibidas = this.recibidas.filter(r => r.id !== id);
  }

  // Copiar crea un borrador nuevo: sin id/documento adjunto/estado "pagada" del
  // original — el usuario adjunta su propio documento a la copia si corresponde.
  // numFacturaNueva llega ya resuelta desde fuera (se pide al usuario ANTES de duplicar,
  // ver factura-recibida-detalle.page.ts/facturas-recibidas.page.ts): decisión 2026-08-17,
  // "Copiar" ahora guarda de inmediato en el backend real (HttpReceivedInvoicesRepository.
  // duplicar), y Guardar exige un número de factura no vacío — dejarlo en '' como antes
  // haría fallar ese guardado automático nada más copiar.
  duplicarRecibida(original: FacturaRecibida, numFacturaNueva: string): FacturaRecibida {
    const copia: FacturaRecibida = {
      id: nextRecibidaId++,
      proveedor: original.proveedor,
      proveedorNif: original.proveedorNif,
      // El proveedor en sí no cambia por duplicar la factura — si el original ya tenía un
      // id/dirección resueltos (de una búsqueda real o de una factura real del backend),
      // la copia los conserva; solo se resetean los datos propios de ESTA factura (número,
      // fecha, pagada, adjunto...).
      idProveedor: original.idProveedor,
      proveedorDireccion: original.proveedorDireccion,
      proveedorPoblacion: original.proveedorPoblacion,
      proveedorCp: original.proveedorCp,
      proveedorProvincia: original.proveedorProvincia,
      numFactura: numFacturaNueva,
      fecha: new Date().toISOString().slice(0, 10),
      vencimiento: '',
      concepto: original.concepto,
      formaPago: original.formaPago,
      // idLineaBackend se descarta a propósito: la copia son líneas NUEVAS, no ediciones de
      // las líneas del original — mandar el id real de otra factura en el guardado
      // confundiría al backend (intentaría actualizar la línea equivocada).
      lineas: original.lineas.map(({ idLineaBackend, ...resto }) => ({ ...resto, id: nextLineaId++ })),
      retencionPct: original.retencionPct,
      pagada: false,
      estado: 'borrador',
      origenOcr: false,
      esBorradorLocal: true,
      // El ivaPct de las líneas SÍ es fiable aunque el original venga del backend real (se
      // reconstruye desde idImpuesto al leerlo, ver mapearLinea en
      // received-invoices.repository.http.ts) — ya no hace falta avisar de nada aquí.
      avisosOcr: undefined,
    };
    this.recibidas.unshift(copia);
    return copia;
  }

  // Misma fórmula que Emitidas (calcularTotalesLineas) — la retención aquí sale del
  // propio documento recibido (retencionPct), nunca de la config fiscal de nuestra
  // empresa, que es la que gobierna las facturas que emitimos.
  totalesFacturaRecibida(f: FacturaRecibida): TotalesFactura {
    const cfg: ConfiguracionRetencion = {
      aplicable: f.retencionPct > 0,
      tipoCodigo: 'recibida',
      etiqueta: this.transloco.translate('common.withholdingLabel'),
      porcentaje: f.retencionPct,
    };
    return calcularTotalesLineas(f.lineas, cfg);
  }

  nuevoIdLineaRecibida(): number {
    return nextLineaId++;
  }

  // ---------- Catálogo ----------

  async buscarCatalogoPaginado(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<ProductoCatalogo>> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const todos = this.catalogo.filter(p => p.nombre.toLowerCase().includes(q) || p.referencia?.toLowerCase().includes(q));
    const inicio = (page - 1) * pageSize;
    return { items: todos.slice(inicio, inicio + pageSize), total: todos.length, page, pageSize };
  }

  // ---------- Suscripciones ----------

  async buscarSuscripcionesPaginado(query: string, page = 1, pageSize = 20): Promise<PaginaResultado<Suscripcion>> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], total: 0, page, pageSize };

    const todos = this.suscripciones.filter(s => s.nombre.toLowerCase().includes(q));
    const inicio = (page - 1) * pageSize;
    return { items: todos.slice(inicio, inicio + pageSize), total: todos.length, page, pageSize };
  }
}
