# Auditoría de integración: Angular → WebAPIARTIBusiness → FacturaE → AEAT

Investigación de solo lectura sobre los tres proyectos (`ARTIBusiness-Facturacion`,
`ARTIBUSINESS GLOBAL 1208\ARTIBusiness` — incluye `WebAPIARTIBusiness`,
`ARTIBusinessWEB`, `ARTIBusinessDLL`, `ARTIBusinessCoreDLL` — y `FacturaE`). Ningún
código se ha modificado; esto es el informe previo a decidir qué construir.

Convención de clasificación: **YA EXISTE** / **EXISTE PARCIALMENTE** / **FALTA** /
**NECESITA CONFIRMACIÓN**.

---

## A. Arquitectura real encontrada

```
Angular/Ionic (ARTIBusiness-Facturacion)
  └── ApiService (fetch/CapacitorHttp, sin interceptor) + AuthService + TenantService
        │
        ▼
WebAPIARTIBusiness (.NET 9) — capa moderna, JWT HS256
  ├── EmployeesController  ← login REAL en uso (/api/Employees/authenticate)
  ├── UsersController      ← alternativo, implementado pero no usado
  ├── FacturaEmitidaController ← solo crear (1 línea, tipo "socio") + obtener por id
  ├── ClienteEmpresaController ← devuelve un CLIENTE, no la empresa propia
  ├── DocumentoController  ← OCR, YA CONECTADO (trabajo de esta misma sesión)
  └── (nada más de facturación: sin recibidas, sin pagos, sin cobros, sin FacturaE)
        │
        │   AUSENTE — no existe ningún puente aquí
        ▼
ARTIBusinessDLL (VB.NET legacy) — AQUÍ VIVE LA LÓGICA DE NEGOCIO REAL
  ├── artiFactura.vb          ← contabilizar/Registrar, abonar, totalizar (emitidas)
  ├── artiFacturaECore.vb     ← EL PUENTE REAL a FacturaE (Azure AD client_credentials)
  ├── artiFacturaRecibida.vb  ← CRUD + pagos de facturas recibidas, completo
  ├── artiCaja.vb             ← movimientos de pago/cobro (tabla agt_caja)
  ├── artiGestionCobros.vb    ← devengos de cobro (ag_gestion_cobros)
  └── artiFormaPago.vb        ← catálogo de formas/medios de pago
        │
        ▼
ARTIBusinessWEB (WebForms, VB.NET) — UI legacy, pero con la lógica de negocio
  completa en el code-behind (fFacturasEmitidasMnto.aspx.vb,
  fFacturasRecibidasMnto.aspx.vb, fDeudaPendiente.aspx, fPagosPendiente.aspx) —
  usar como referencia de las reglas exactas, no como algo a exponer tal cual.
        │
        ▼
FacturaE (.NET, servicio aparte) — YA FUNCIONA, YA PROBADO CONTRA AEAT-PRUEBAS
  Auth: Azure AD client_credentials (App Role "RequireFacturaeRole") — INCOMPATIBLE
  con el JWT HS256 de WebAPIARTIBusiness. Cualquier puente nuevo debe replicar el
  flujo client_credentials que ya usa artiFacturaECore.vb.
```

**Hallazgo estructural más importante**: la capa moderna (`WebAPIARTIBusiness`) es
un cascarón muy fino. Casi toda la lógica de negocio real (contabilizar, pagos,
cobros, facturas recibidas, el puente a FacturaE) vive en el código legacy VB.NET
(`ARTIBusinessDLL`/`ARTIBusinessWEB`), no en la API REST moderna. La app móvil no
puede consumir el legacy directamente — todo lo que necesitemos hay que
**construirlo en `WebAPIARTIBusiness` reutilizando las reglas exactas del legacy**,
no reinventarlas.

---

## B. Endpoints existentes

| Función | Endpoint | Existe | Controller | DTO | Observaciones |
|---|---|---|---|---|---|
| Login | `POST /api/Employees/authenticate` | ✅ YA EXISTE, en uso | `EmployeesController.cs:46` | `LoginModel` → `{token, expiration, employeeId, ...}` | Resuelve `BusinessUnit` en servidor. Es el correcto, no tocar. |
| Login alternativo | `POST /api/Users/authenticate` | ⚠️ EXISTE, sin usar | `UsersController.cs:39` | `LoginModel` | Exige `BusinessUnit` explícito válido — por eso falló en producción cuando se probó antes. |
| MFA | `POST /api/Employees/authenticatemfa` | ✅ YA EXISTE | `EmployeesController.cs:118` | — | Ya consumido por Angular. |
| Perfil / datos fiscales de la empresa | — | ❌ FALTA | — | — | No hay `EmpresaController` ni endpoint. El modelo `Empresa` sí existe en EF. |
| Cliente por id | `GET /api/ClienteEmpresa/{idCliente}` | ⚠️ EXISTE PARCIALMENTE | `ClienteEmpresaController.cs:21` | `ClienteEmpresaDetalleModel` | El nombre engaña: devuelve un *cliente* de la empresa, no los datos fiscales de la empresa propia. Sin dirección postal en el DTO. |
| Proveedores | — | ❌ FALTA | — | — | Sin modelo EF ni controller en la capa moderna. |
| Facturas recibidas — listar/detalle | — | ❌ FALTA POR COMPLETO | — | — | Ni controller, ni service, ni entidad EF Core. Modelo real solo en legacy VB + tabla SQL `Facturacion$FacturasRecibidas`. |
| Facturas emitidas — crear | `POST /api/FacturaEmitida/crear` | ⚠️ EXISTE PARCIALMENTE | `FacturaEmitidaController.cs:31` | `FacturaEmitidaModel` | Pensado para factura de socio de 1 línea (`NumeroSocio`, `RelacionCentro`, `Perfil`), no para factura genérica multi-línea con destinatario/líneas como necesita el móvil. |
| Facturas emitidas — detalle | `GET /api/FacturaEmitida/{id}` | ✅ YA EXISTE | `FacturaEmitidaController.cs:61` | `FacturaEmitidaDetalleModel` | Completo, incluye líneas. |
| Facturas emitidas — listar | — | ❌ FALTA | — | — | Sin filtros, sin paginación, en ningún sitio del proyecto. |
| Contabilizar | — | ❌ FALTA en capa moderna | — | — | El puente a `FacturaE/generate` solo existe en `artiFacturaECore.vb` (legacy). |
| Firmar | — | ❌ FALTA en capa moderna | — | — | Igual, solo legacy (`artiFacturaECore.vb`, y `FirmaFactura2.aspx`/`FirmaFacturaExterna.aspx` en WebForms). |
| Pagos de facturas recibidas | — | ❌ FALTA la API / ✅ modelo real ya existe | — | — | Modelo real y completo en `agt_caja` + `artiFacturaRecibida.vb`. Reutilizable tal cual. |
| Cobros de facturas emitidas | — | ❌ FALTA la API / ✅ modelo real ya existe | — | — | Mismo modelo `agt_caja`, importe positivo. |
| Métodos de pago (catálogo) | — | ❌ FALTA la API / ✅ entidad EF ya existe | — | `AgMediosPago.cs` | Entidad EF Core lista para usar, solo falta el controller. |
| FacturaE — generar | `POST /api/Facturae/generate` | ✅ YA EXISTE, probado en AEAT-Pruebas | `FacturaEController.cs:33` (proyecto **FacturaE**, no confundir con WebAPIARTIBusiness) | `FacturaeRequestDto` | Ver sección F para el mapping completo. |
| FacturaE — firmar | `POST /api/Firma/firmar` | ✅ YA EXISTE | `FirmaController.cs:56` (FacturaE) | `{EmpresaId, RegistroId}` | Nunca recibe XML ni certificado. |
| FacturaE — anular/subsanar | `POST /api/Facturae/anular` / `subsanar` | ✅ YA EXISTE | `FacturaEController.cs:209,323` (FacturaE) | `AnularFacturaRequestDto` / `SubsanarFacturaRequestDto` | Disponible si se decide meterlo en alcance del móvil (no es imprescindible para el MVP). |

---

## C. Endpoints que faltan (mínimo imprescindible para el MVP)

Ordenados por lo que bloquean:

1. **`GET /api/Empresa/{id}` (o resuelto por el JWT)** — datos fiscales de solo
   lectura para el Perfil de la app y para poder construir `SellerParty` en el
   futuro puente a FacturaE.
2. **`POST /api/FacturaEmitida/{id}/contabilizar`** — internamente llama a
   `FacturaE POST /Facturae/generate`, mapeando desde el modelo real (ver
   sección F).
3. **`POST /api/FacturaEmitida/{id}/firmar`** — internamente llama a
   `FacturaE POST /Firma/firmar`.
4. **`GET /api/FacturaEmitida`** (listar, con filtros — hoy no existe ningún
   listado).
5. **`GET /api/FacturaRecibida` + `GET /api/FacturaRecibida/{id}`** — mínimo
   listar y ver detalle, reutilizando el modelo legacy (`Facturacion$FacturasRecibidas`
   + sus líneas) sin reinventar nada.
6. **`GET /api/MedioPago`** — trivial, la entidad EF (`AgMediosPago`) ya existe,
   solo falta exponerla.
7. **Pagos/Cobros** — `POST /api/FacturaRecibida/{id}/pagos` y
   `POST /api/FacturaEmitida/{id}/cobros` (o un único endpoint genérico de
   movimientos), reutilizando `agt_caja` tal cual (ver sección D).

**No imprescindibles para el MVP, pero bloqueantes si no se arreglan primero**:

8. **CORS roto** (`Startup.cs:241`) — bloquea cualquier prueba desde `ng serve`
   o la PWA de Netlify, aunque no afecta al build nativo.
9. **Multi-tenancy roto** — las claves de connection string no coinciden con lo
   que busca el resolvedor; hoy todas las empresas caen a la misma BD.

---

## D. Modelo de pagos/cobros — cómo funciona hoy y cómo reutilizarlo

**No hay que inventar un modelo nuevo — ya existe uno real, completo y
consistente entre pagos y cobros.** Vive en una única tabla legacy sin entidad
EF Core todavía: `agt_caja`.

### El modelo

Una factura (recibida o emitida) puede tener **N filas en `agt_caja`**, cada una
con:

| Campo | Uso |
|---|---|
| `id_caja` | PK |
| `importe` | money — **positivo = cobro** (factura emitida), **negativo = pago** (factura recibida) |
| `id_medio_pago` | FK a `ag_medios_pago` — el método de pago del movimiento |
| `id_facturaRecibida` / `id_facturaEmitida` | FK nullable, uno de los dos según el caso |
| `fechaCreacion`, `usuarioCreacion` | |

### Las fórmulas exactas (ya probadas en producción, solo hay que copiarlas)

**Facturas recibidas** (`artiFacturaRecibida.vb:101-114,312-316`):
```
totalConIVA = total + iva − suplidos − irpf
restoPorPagar = totalConIVA + SUM(agt_caja.importe WHERE id_facturaRecibida = X)
                              (suma porque los pagos ya son negativos)
pagada = (totalConIVA == −1 * SUM(agt_caja.importe))
```

**Facturas emitidas** (`fFacturasEmitidasMnto.aspx.vb:710-723`, `fDeudaPendiente.aspx:298`):
```
totalConIVA = total + iva + suplidos − irpf
pendiente = totalConIVA − SUM(agt_caja.importe WHERE id_facturaEmitida = X)
cobrada = (totalConIVA == SUM(agt_caja.importe))
```

⚠️ **Inconsistencia real detectada en el propio legacy**: el signo de
`suplidos` varía entre `totalConIVA` de recibidas (resta) y la query de
`fPagosPendiente.aspx:97` (suma). Antes de reproducir la fórmula, confirmar
cuál es la correcta con el jefe/negocio — no asumir.

El estado "parcialmente pagada/cobrada" **no se persiste** en ningún sitio — se
deriva siempre comparando `pendiente` con `0` y con el total. Encaja
exactamente con lo que pide tu guion (pendiente / parcial / pagada como estado
calculado, no almacenado).

### Catálogo de métodos de pago (YA EXISTE, listo para usar)

Tres niveles, todos con entidad EF Core real:
- **`ag_medios_pago`** (`AgMediosPago.cs`) — lo que referencian directamente las
  facturas y los movimientos. No tiene columna de descripción propia.
- **`ag_forma_pago`** (`AgFormaPago.cs`) — sí tiene `DescFormaPago` (la etiqueta
  legible), y es **multi-tenant por empresa** (`IdEmpresa`).
- **`ag_cuentas`** — completa la etiqueta (`desc_forma_pago + ' ' + descripcion`,
  patrón usado en toda la UI legacy).

### Qué falta construir (capa de exposición únicamente, no lógica nueva)

- Entidades EF Core para `agt_caja`, `Facturacion$FacturasRecibidas` y
  `ag_gestion_cobros` (hoy solo accesibles por SQL directo).
- Controllers que expongan lo anterior + las fórmulas de arriba.
- **No hay que tocar ni rediseñar la lógica de negocio** — ya está validada en
  producción.

---

## E. Datos fiscales — mapping `SellerParty` (FacturaE) ↔ ARTIBusiness

Contrato real de FacturaE (`FacturaE/Models/DTOs/FacturaeRequestDto.cs`), y de
dónde saldría cada dato en ARTIBusiness:

| Campo `SellerParty` | Origen en ARTIBusiness | ¿Existe? | Observación |
|---|---|---|---|
| `TaxIdentification.PersonTypeCode` (F/J) | `Empresa.Naturaleza` | ✅ SÍ | |
| `TaxIdentification.ResidenceTypeCode` | — | ❌ No es un dato, se fija siempre `"R"` | Aceptable como constante (así lo hace ya el legacy). |
| `TaxIdentification.TaxIdentificationNumber` | `Empresa.CifEmpresa` | ✅ SÍ | |
| `LegalEntity.CorporateName` | `Empresa.DescEmpresa` | ✅ SÍ | |
| `LegalEntity.AddressInSpain.Address` | `Direccion.direccion` (vía `Empresa.IdDireccion`) | ✅ SÍ, indirecto | Requiere JOIN a tabla `Direccion`. |
| `LegalEntity.AddressInSpain.PostCode` | `Direccion.codigoPostal` | ✅ SÍ, indirecto | |
| `LegalEntity.AddressInSpain.Town` | `Direccion.poblacion` | ✅ SÍ, indirecto | |
| `LegalEntity.AddressInSpain.Province` | `Direccion.provincia.ProvinciaDescripcion` | ✅ SÍ, 2 JOINs | |
| `LegalEntity.AddressInSpain.CountryCode` | — | ❌ Constante `"ESP"` | Igual que ResidenceTypeCode. |

**Huecos reales, no cosméticos:**

1. **Si `Empresa.Naturaleza = "F"` (autónomo/persona física), no hay mapeo.**
   `artiFacturaECore.vb:405-406` tiene la rama `Individual` **comentada** — con
   una empresa configurada como persona física se generaría un XML sin
   `LegalEntity` ni `Individual`, inválido contra el XSD. Riesgo real si algún
   emisor es autónomo.
2. La dirección requiere 3 tablas encadenadas (`Empresa` → `Direccion` →
   provincia) — no hay ningún endpoint que ya haga ese JOIN.
3. **Ninguna validación de formato de NIF** en todo `FacturaE` — solo se
   comprueba que no esté vacío.
4. No hay validación de que `Naturaleza`, `CifEmpresa` o `IdDireccion` sean
   no-nulos en ningún punto del código actual.

**Mapping de referencia ya probado** (no hay que inventarlo, solo portarlo a
C#): `ARTIBusinessDLL/facturacion/artiFacturaECore.vb`, métodos `SellerParty()`
(L394), `LegalEntity()` (L413), `Address()` (L450).

---

## F. Mapping Factura Emitida: Angular → WebAPIARTIBusiness → FacturaE

```
Angular (FacturaEmitida)          WebAPIARTIBusiness (nuevo)         FacturaE (ya existe)
─────────────────────────         ──────────────────────────        ─────────────────────
operacionId (string, YA EXISTE    → Invoices[0].OperacionId          idempotencia ya soportada
 en el modelo, generado al crear)                                    por FacturaE (RegistroId
                                                                      estable si se repite)
numeradorId → numFactura          → InvoiceHeader.InvoiceNumber      —
destinatario.{nombre,nif,...}     → Parties.BuyerParty               —
lineas[] (descripcion,cantidad,   → Invoices[0].Items[] +            —
 precioUnitario,descuentoPct,       TaxesOutputs[] (agrupado por
 ivaPct)                            tipo, igual que ya hace
                                     calcularTotalesLineas())
(no existe todavía: IRPF)         → (no existe todavía en cabecera   FacturaE sí soporta
                                     WebAPIARTIBusiness — ver abajo)  retenciones en Items[]
totales (calculados en Angular,   → InvoiceTotals (recalculados      —
 mismo motor ya blindado con        en backend, nunca confiar en
 avisosOcr para Recibidas)          los del cliente)
—                                 → Parties.SellerParty              requiere el mapping de
                                     (desde Empresa, ver sección E)   la sección E
—                                 EmpresaId (del claim JWT, NUNCA     obligatorio en el body
                                    del body que manda el cliente)
```

**Puntos de fricción confirmados:**

- **IRPF en Emitidas no existe en NINGÚN lado del stack Angular hoy** (ni
  campo en el tipo `FacturaEmitida`, confirmado). En el backend, el % de IRPF
  **no se persiste por factura** — se recalcula en cada `TotalizarFactura()`
  leyendo la configuración de empresa (`ag_impuesto` tipo `"IRPF"`) en el
  momento. Esto significa que si cambia la config de la empresa y alguien
  vuelve a tocar una línea de una factura antigua, **el IRPF de esa factura
  cambiaría** — contradice directamente la regla que pediste ("el IRPF no debe
  cambiar una vez emitida la factura"). Recomendación: persistir también el
  **porcentaje** aplicado en el momento de contabilizar, no solo el importe.
- **Estados**: el backend usa bytes mágicos sin enum (`131`=Borrador,
  `132`=Contabilizada, `133`=Firmada, confirmados por código, no por
  documentación). El mock de Angular ya usa nombres (`borrador`/`contabilizada`/
  `firmada`) — hay que mapear 131↔borrador, 132↔contabilizada, 133↔firmada al
  construir el DTO de respuesta en el nuevo endpoint.
- **`EstadoAeat`**: en el legacy es un string libre que se guarda tal cual
  devuelve FacturaE (`"Correcto"|"AceptadoConErrores"|"Incorrecto"`, más
  `null`). El catálogo que ya usa el mock de Angular
  (`PendienteEnvio|Correcto|AceptadoConErrores|RechazadoAeat|RequiereRevisionManual`)
  **no coincide exactamente** — `RechazadoAeat` debería ser `Incorrecto`.

---

## G. Filtros — conjunto propuesto

Backend, no cliente — confirmado que hoy no existe ningún filtro ni paginación
en ningún listado real (ni siquiera hay un endpoint de listado todavía).

**Facturas recibidas** — obligatorios (según tu guion) + valorados:
`proveedor`, `estado` (derivado: pendiente/parcial/pagada — no una columna),
`fechaDesde`, `fechaHasta`, `año`, `mes`, y de los opcionales: `numeroFactura`
(ya es un campo real, `numFacRec`), `importeMin`/`importeMax` (fácil, ya está
`totalConIVA` calculado). Descartaría "pagada/no pagada" como filtro aparte del
`estado` derivado, para no duplicar el mismo concepto de dos formas.

**Facturas emitidas** — obligatorios + valorados: `cliente`, `estado`
(131/132/133), `fechaDesde`, `fechaHasta`, `año`, `mes`, `serie`
(`id_numerador`, ya es como filtra el propio legacy), y de los opcionales:
`numFactura` (ya existe), `estadoAeat` (ya existe como columna real),
`contabilizada`/`firmada` (redundante con `estado`, no añadir aparte),
`cobrada`/parcial/pendiente (`Cobrada` es un flag real en cabecera, aunque
derivado — usable como filtro directo sin JOIN a `agt_caja` para listados
rápidos).

---

## H. Cambios necesarios en Angular (lista de archivos — NO tocar todavía)

- `src/app/core/ports/issued-invoices.repository.ts` — añadir métodos
  `listar(filtros)`, y decidir si `contabilizar`/`firmar` pasan de `void` a
  `Promise<...>` (ya lo serán, al ser HTTP real).
- `src/app/services/mock-facturas.service.ts` — tipo `FacturaEmitida`: añadir
  campo IRPF si se decide exponerlo; revisar catálogo `EstadoAeat` para
  alinear `RechazadoAeat`→`Incorrecto`.
- Nuevo: `src/app/core/adapters/http/issued-invoices.repository.http.ts` —
  mismo patrón exacto que `received-invoices.repository.http.ts` (ya
  construido para OCR): adaptador híbrido, solo `contabilizar`/`firmar`/`listar`
  reales, el resto delegado al mock hasta que existan más endpoints.
- Nuevo: `src/app/core/ports/received-invoices.repository.ts` — ya existe el
  puerto, solo hace falta el adaptador HTTP real de listar/detalle (hoy el
  híbrido de OCR ya delega en mock para eso).
- `src/app/pages/perfil/*` — nueva card de Datos fiscales (solo lectura).
- `src/app/core/providers/mock.providers.ts` — único punto de activación,
  como siempre.

## I. Cambios necesarios en WebAPIARTIBusiness (lista de archivos — NO tocar todavía)

- `Startup.cs` — arreglar CORS (`WithOrigins("AllowAnyOrigin")` no es válido) y
  las claves de connection string multi-tenant (`Company_{id}` vs
  `ARTIBusiness_{id}`).
- Nuevo `Controllers/EmpresaController.cs` + `Services/EmpresaService.cs` +
  `Entities/EmpresaDetalleModel.cs` — datos fiscales de solo lectura.
- Nuevo `Services/FacturaeClientService.cs` (o similar) — el puente HTTP hacia
  FacturaE, portando la lógica de `artiFacturaECore.vb` (auth Azure AD
  client_credentials + llamadas a `/Facturae/generate` y `/Firma/firmar`) a
  C#/.NET 9.
- `Controllers/FacturaEmitidaController.cs` + `Services/FacturaEmitidaService.cs`
  — añadir `listar` (con filtros), `contabilizar`, `firmar`.
- Nuevo `Controllers/FacturaRecibidaController.cs` + `Services/` + entidad EF
  Core para `Facturacion$FacturasRecibidas` (+ líneas).
- Nueva entidad EF Core para `agt_caja` + `Controllers/PagosController.cs` (o
  integrado en los controllers de factura).
- Nuevo `Controllers/MedioPagoController.cs` — trivial, la entidad ya existe.
- `appsettings.json` — sección `ApiKeys` (falta, aunque el handler ya la lee).

## J. Riesgos o incógnitas

- **`EmpresaId`**: es el mismo concepto (`Empresa.IdEmpresa` = claim JWT
  `EmpresaId` = sufijo de las connection strings), **pero el cableado está
  roto** (`ConnectionStringResolver` busca `Company_{id}`, appsettings define
  `ARTIBusiness_{id}` — hoy todas las empresas caen silenciosamente a la BD
  0004). Y **`EmpresaId=9`** (la única configurada en FacturaE, con
  certificado de firma) **no tiene connection string en absoluto** en
  WebAPIARTIBusiness — necesita confirmación de si 9 es una empresa real que
  falta dar de alta, o un id de pruebas aparte.
- **CORS roto** (`Startup.cs:241`) — bloquea cualquier prueba desde web/PWA,
  no desde nativo.
- **Autenticación**: el claim `EmpresaId` del JWT es literalmente lo que el
  cliente mandó en el login (`login.Company`), sin verificar contra la BD —
  no hay comprobación de que ese usuario pertenezca de verdad a esa empresa.
- **Swagger público sin autenticación**, en todos los entornos, en `/swagger`.
- **JWT dura 1 día, sin refresh token ni revocación** — la app deberá forzar
  re-login diario.
- **Secretos committeados en claro** en `appsettings.json` (JWT secret,
  connection strings con credenciales).
- **Persistencia real de factura**: `FacturaEmitidaController.crear` no está
  pensado para factura genérica — habrá que decidir si se reforma o se crea un
  endpoint paralelo.
- **Métodos de pago**: catálogo real y multi-tenant, pero sin controller —
  bajo riesgo, solo falta exponerlo.
- **Campos fiscales sin correspondencia**: `ResidenceTypeCode`/`CountryCode`
  (constantes, aceptable) y el caso `Naturaleza="F"` (autónomo) sin mapeo
  funcional — riesgo real si alguna empresa emisora es persona física.
- **IRPF**: importe persistido por factura, porcentaje NO — ver sección F.

## K. Orden de implementación propuesto (máximo 8 pasos)

1. **Arreglar CORS y la clave de connection string multi-tenant** en
   `Startup.cs`/`ConnectionStringResolver.cs` — desbloquea poder probar
   cualquier cosa desde web, y confirma qué empresa es realmente cuál.
2. **`GET /api/Empresa/{id}`** (datos fiscales de solo lectura) — pequeño,
   aislado, y desbloquea la card de Perfil en Angular sin depender de nada más.
3. **Puente `WebAPIARTIBusiness` → `FacturaE`** para una única empresa de
   prueba (probablemente la 9, ya configurada) — portar `SellerParty()` de
   `artiFacturaECore.vb`, cableado de Azure AD client_credentials.
4. **`POST /api/FacturaEmitida/{id}/contabilizar`** + **`/firmar`** — con el
   mapping de la sección F, probado contra AEAT-Pruebas con una factura real.
5. **`GET /api/FacturaEmitida`** (listar con filtros) — desbloquea la pantalla
   de lista real en Angular.
6. **`GET /api/FacturaRecibida` + detalle** — reutilizando el modelo legacy tal
   cual, sin pagos todavía.
7. **Pagos/cobros** (`agt_caja` + `GET /api/MedioPago`) — una vez que
   facturas recibidas/emitidas ya funcionan de verdad.
8. **Conectar Angular** — mismos adaptadores HTTP híbridos ya usados para OCR,
   activados uno a uno en `mock.providers.ts` a medida que cada endpoint de
   arriba esté probado.
