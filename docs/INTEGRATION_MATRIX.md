# Matriz de integración — ARTIBusiness Facturación (móvil)

Estado a fecha 2026-08-11, commit `a7972e7`. Generado a partir de lectura directa del
código (no de suposiciones): `src/app/services/*`, `src/app/pages/*`, `src/app/modals/*`,
`CONTEXTO_FACTURACION.md`.

Leyenda de **Estado**:
- ✅ **confirmado** — endpoint real existe y este frontend ya lo consume.
- 🟡 **contrato incompleto** — el endpoint/modelo existe en el backend (confirmado por la
  sesión que audita el backend) pero no hay ruta HTTP construida, o el payload exacto no
  está confirmado.
- 🔴 **bloqueado** — no existe nada del lado backend todavía; solo hay una intención
  documentada en `CONTEXTO_FACTURACION.md`.
- ⚪ **solo demo** — no se espera integración cercana (o directamente fuera de alcance del
  frontend, como VeriFactu/FacturaE).

| Función | Pantalla(s) | Mock actual | Puerto requerido (propuesto) | Servicio/operación | Estado |
|---|---|---|---|---|---|
| Resolución de tenant (clave de empresa) | Setup | — (ya es HTTP real) | `TenantRepository` | `POST` dispatcher de configuración (Azure) | ✅ confirmado |
| Login | Login | — (ya es HTTP real) | `AuthRepository` | `POST /api/Employees/authenticate` | ✅ confirmado, pero **dominio dudoso** — ver gaps (se probó `/api/Users/authenticate`, falló, se revirtió) |
| Verificación MFA | MFA | — (ya es HTTP real, pero apunta a una ruta no confirmada para el dominio real) | `AuthRepository` | `POST /api/Employees/authenticatemfa` | 🟡 contrato incompleto — no se sabe si el dominio de Facturación (`Users`) tiene paso MFA |
| Olvidé mi contraseña | Forgot password | — (ya es HTTP real, misma duda de dominio) | `AuthRepository` | `POST /api/Employees/forgot` | 🟡 contrato incompleto |
| Listar facturas emitidas (Borrador/Contabilizada/Firmada) | Facturas Emitidas | `MockFacturasService.getFacturasEmitidas()` | `IssuedInvoicesRepository` | *no existe* | 🔴 bloqueado |
| Crear / editar borrador de factura emitida | Detalle factura emitida | `crearBorrador()`, `actualizarBorrador()` | `IssuedInvoicesRepository` | *no existe* — sí existe `POST /api/FacturaEmitida/crear` pero es de alta puntual, no sirve para este flujo (confirmado en `CONTEXTO_FACTURACION.md`) | 🔴 bloqueado |
| Líneas de factura emitida | Detalle factura emitida | Array en memoria dentro de `FacturaEmitida` | `IssuedInvoicesRepository` (o repo de líneas aparte) | Modelo EF `FacturacionFacturasEmitidasLineas` confirmado por backend; sin endpoint | 🔴 bloqueado |
| Contabilizar factura emitida | Emitidas (lista y detalle) | `MockFacturasService.contabilizar()` — solo cambia estado local | `IssuedInvoicesRepository` (comando) | *no existe* | 🔴 bloqueado |
| Firmar factura emitida | Emitidas (lista y detalle) | `MockFacturasService.firmar()` — solo cambia estado local | `IssuedInvoicesRepository` (comando) | *no existe* | 🔴 bloqueado |
| Estado AEAT / VeriFactu de una factura | Emitidas (lista y detalle) | Campo `estadoAeat` fijado localmente al contabilizar/firmar | `FiscalStatusRepository` | Servicio externo FacturaE (no forma parte de este repo) | ⚪ solo demo hasta que exista contrato — **nunca debe calcularse en el cliente** |
| Numeradores/series | Selector en Emitidas | Array fijo `[{Serie A 2026},{Serie B 2026}]` | `TenantRepository` o `IssuedInvoicesRepository` | `fNumeradoresMnto.aspx` existe en la web real; sin API | 🔴 bloqueado |
| Buscar/dar de alta cliente (destinatario) | Selector de cliente (modal) | `buscarClientes()`, `crearClienteAdHoc()` | `CustomersRepository` | `ClienteUsuarioController`: `findbyname`, `findbynif`, `findbyid`, `findbyhash`, `insert`, `insertmenor` — **confirmado que existen**, payload exacto no verificado | 🟡 contrato incompleto |
| Buscar/dar de alta proveedor | Selector de proveedor (modal) | `buscarProveedores()`, `crearProveedorAdHoc()` | `SuppliersRepository` | Ninguno — se redactó una petición al backend calcada de `ClienteUsuarioController` (`docs/SERVICE_CONTRACT_GAPS.md`), no construida todavía | 🔴 bloqueado |
| Listar / crear manual / editar / eliminar factura recibida | Facturas Recibidas | `MockFacturasService.getFacturasRecibidas()`, `crearManual()`, `actualizarRecibida()`, `eliminarRecibida()` | `ReceivedInvoicesRepository` | *no existe* | 🔴 bloqueado |
| Crear factura recibida desde OCR | Facturas Recibidas | `crearDesdeOcr()` — genera proveedor/importes aleatorios, sí guarda la imagen real como Data URL en memoria | `OcrRepository` | `POST /api/FacturaRecibida/desde-ocr` sugerido en `CONTEXTO_FACTURACION.md`, servicio OCR ya existe (equipo externo, Gemini+Flask) pero sin contrato confirmado hacia esta app | 🔴 bloqueado |
| Adjuntar/ver documento de factura recibida | Detalle factura recibida | `adjuntarDocumento()` — Data URL en memoria, se pierde al recargar | `BillingDocumentsRepository` | Ninguno | 🔴 bloqueado |
| Datos fiscales del emisor (autónomo/empresa, NIF, dirección, IBAN...) | Perfil → Datos fiscales | `getEmisor()`/`actualizarEmisor()` — objeto único en memoria | `TenantRepository` (o `EmisorRepository` dedicado) | Modelo EF `Empresa.cs` confirmado (`CifEmpresa`, `IdDireccion`, `RegistroMercantil`, `Cnae`, `Iban`, `Swift`) — **sin el campo autónomo/empresa**, sin endpoint GET/PUT | 🔴 bloqueado, y con una incoherencia de modelo sin resolver (ver gaps) |

## Selección de provider (mock vs HTTP)

Hoy **no existe ese mecanismo**. `MockFacturasService` se inyecta directamente en cada
página (`facturas-emitidas.page.ts`, `factura-detalle.page.ts`, `facturas-recibidas.page.ts`,
`factura-recibida-detalle.page.ts`, `perfil.page.ts`, `datos-emisor.page.ts`, los tres
modales) sin pasar por ninguna interfaz. Es el hallazgo central de la Fase 0: **no hay
todavía separación puerto/adapter que permita alternar mock↔HTTP por configuración** — hoy
alternar significaría reescribir cada página. Esto es exactamente lo que aborda la Fase 1
del plan.

`ApiService` (el transporte HTTP real) **solo lo usa `AuthService`** — ninguna otra parte de
la app lo toca. Esto es una buena noticia: el aislamiento entre "lo que ya es real" (auth +
tenant) y "lo que es mock" (todo lo de facturación) ya es limpio a nivel de módulo, aunque no
a nivel de interfaz.
