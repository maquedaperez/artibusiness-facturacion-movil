# Contexto: ARTIBusiness Facturación (reciclaje de la app de Fichajes)

Este documento lo escribió una sesión de Claude Code trabajando directamente sobre el
repositorio del backend (`ARTIBusiness`, en `C:\Users\M3402\Desktop\ARTIBusiness`), tras
analizar en profundidad el módulo de facturación del sistema padre. Es la fuente de verdad
sobre el dominio de negocio — no inventes nombres de campos, endpoints ni estructura de datos
sin haber leído esto primero.

La comunicación entre esta sesión (móvil) y la sesión del backend es **manual, a través del
usuario**: si necesitas algo que no está aquí (un endpoint nuevo, aclarar un campo, confirmar
una regla de negocio), formúlalo como pregunta clara y el usuario la trasladará. No asumas que
puedes "consultar" nada en directo.

---

## 0. Estado real de este proyecto (verificado, no asumido)

Este repo es un scaffold de Angular 20 + Ionic 8 + Capacitor 8 (`arti-software-fichajes-movil`),
generado con `ionic generate page` para varias pantallas, pero **la lógica de negocio real
todavía no está construida**, solo el esqueleto:

- Páginas ya generadas (markup + clase + spec, nivel scaffold): `login`, `mfa`,
  `forgot-password`, `splash`, `tabs`, `registro`, `solicitudes`, `perfil`, `setup`, `fichaje`.
- `src/app/services/auth.ts` — **clase vacía**, sin lógica de autenticación implementada
  todavía. No asumas que el login/MFA "ya funciona" — hay que comprobar el estado real de cada
  página antes de decidir qué se reutiliza tal cual y qué hay que terminar de construir.
- `src/app/guards/auth.guard.ts` y `tenant.guard.ts` existen (revisar su contenido real antes
  de asumir qué hacen).
- Dependencias relevantes ya instaladas: `@aparajita/capacitor-biometric-auth` (biometría),
  `@capacitor/geolocation`, `@capacitor/preferences` (probablemente para guardar el token).
- No hay todavía ningún servicio HTTP genérico visible (interceptor de Bearer token, base URL
  de API, etc.) — hay que construirlo o confirmar si existe en otro sitio no explorado aún.

**Primer paso real de trabajo**: auditar página por página qué está hecho de verdad (UI vacía
vs UI con lógica) antes de planificar el resto — no dar por sentado el prompt inicial al pie de
la letra si la exploración dice otra cosa.

---

## 1. Qué es ARTIBusiness (contexto de negocio)

Plataforma de gestión empresarial multi-tenant para pymes españolas (contabilidad, RRHH, flota,
SEPA, facturación). El "padre" de esta app móvil es un módulo de facturación construido en
ASP.NET WebForms (VB.NET, DevExpress) + una API moderna en .NET 9 (`WebAPIARTIBusiness`) que
todavía está muy incompleta para este dominio.

Existe además un microservicio aparte, `FacturaE` (.NET 10), que implementa el cumplimiento
legal VERI\*FACTU/AEAT (registro, hash encadenado, envío SOAP, firma XAdES). Esa parte NO hay
que replicarla ni entenderla a fondo — la app móvil solo necesita mostrar su resultado (el
"Estado AEAT" de cada factura), nunca hablar con ese microservicio directamente.

---

## 2. Dominio de facturación — entidades y su relevancia para el MVP

| Entidad | Pantalla web original | Relevancia MVP |
|---|---|---|
| **Facturas Emitidas** (Borrador→Contabilizada→Firmada) | `fFacturasEmitidasMnto.aspx` | ✅ Core |
| **Numeradores/Series** (jerarquía Tipo→Numerador→Plantilla) | `fNumeradoresMnto.aspx` | ✅ Necesario (selector obligatorio) |
| **Facturas Recibidas** (proveedores) | `fFacturasRecibidasMnto.aspx` | ✅ Core (destino del OCR) |
| Gestión de Cobros (motor interno que genera facturas desde citas/consumos) | — | ⚠️ No es una pantalla; la app parte de facturas ya generadas, no debería hacer falta tocarlo |
| Caja/Cobros | — | Parcial, solo si se pide "pendiente de cobro" |
| Remesas SEPA | `fRemesasMnto.aspx` | ❌ Fuera de alcance |
| Formas/Medios de pago | catálogo | ✅ Catálogo de referencia (aparece en listados) |
| Analítica (imputación proyecto/grupo) | — | ❌ Fuera de alcance |
| Informes AEAT 340/347/resumen 110/300 | `faeat340.aspx`, `faeat347.aspx`, `fFacturasEmitidasResumen.aspx` | ❌ Fuera de alcance |
| Deuda/Pagos pendientes | `fDeudaPendiente.aspx`, `fPagosPendiente.aspx` | ⚠️ No pedido explícitamente, confirmar con el jefe |
| Moneda, Periodos, Ficha Proveedor | catálogos menores | ❌ Fuera de alcance del MVP |

### Dos advertencias del análisis del backend

1. Existe una integración legacy (`artiFacturaE.vb`, distinta de `artiFacturaECore.vb`) anterior
   a Verifactu — es código en desuso, no sirve de referencia para nada.
2. Existen subclases de negocio específicas de clientes concretos tipo clínica (Cranioclinic,
   Crosecon, CFI) — son personalizaciones verticales de nicho, no generalizar nada de ahí.

---

## 3. Backend — qué existe hoy y qué falta

`WebAPIARTIBusiness` (la API moderna en .NET 9) **ya tiene el modelo de datos EF Core mapeado**
a las tablas reales de facturación (ej. `FacturacionFacturasEmitidasCabecera.cs`,
`FacturacionNumeradores.cs`), pero **solo existe un endpoint construido**:
`POST /api/FacturaEmitida/crear` — muy específico (alta puntual ligada a un socio/cliente y un
importe), no sirve para listar/contabilizar/firmar.

**Endpoints que hacen falta pedir al equipo de backend** (no existen todavía, no los inventes
como si ya estuvieran):

| Endpoint sugerido | Verbo | Para qué |
|---|---|---|
| `GET /api/FacturaEmitida?estado={borrador\|contabilizada\|firmada}` | GET | Listar (3 pestañas) |
| `GET /api/FacturaEmitida/{id}` | GET | Detalle/edición de borrador |
| `PUT /api/FacturaEmitida/{id}` | PUT | Editar borrador |
| `POST /api/FacturaEmitida/{id}/contabilizar` | POST | Acción Contabilizar |
| `POST /api/FacturaEmitida/{id}/firmar` | POST | Acción Firmar |
| `GET /api/Numeradores` | GET | Selector de numeradores/series |
| `GET /api/FacturaRecibida?...` | GET | Listado de Recibidas |
| `POST /api/FacturaRecibida/desde-ocr` | POST | Crea borrador de recibida a partir del JSON del OCR |

### Campos reales de una Factura Emitida (de `FacturacionFacturasEmitidasCabecera.cs`)

`NumFactura`, `RazonSocialDenominacion` (cliente), `TotalBase`, `IvaBase`, `SuplidosBase`,
`IrpfBase`, `TotalFactura`, `Estado` (byte: Borrador/Contabilizada/Firmada), `NumFacturaRegistrada`,
`Hash`, `UrlPdf`, `UrlXmlFirmado` (estos últimos cuatro son del lado Verifactu, para mostrar el
Estado AEAT: `Correcto` / `AceptadoConErrores` / `RechazadoAeat` / `PendienteEnvio` /
`RequiereRevisionManual`).

---

## 4. Alcance del MVP (obligatorio, decidido con el jefe)

**3 pantallas obligatorias** sobre Facturas emitidas:
1. Listar facturas (3 vistas: Borradores editable / Contabilizadas con Estado AEAT / Firmadas),
   con selector de numerador/serie arriba.
2. Contabilizar factura (acción con confirmación).
3. Firmar factura (acción con confirmación).

**Más:**
- Facturas de venta — vista de solo consulta.
- Recibidas (proveedores) — con **escaneo OCR como acción principal**. El servicio OCR ya está
  desarrollado por otro equipo externo (Gemini + Flask por debajo) — la app móvil solo lo
  **consume** vía su API, no hay que construir el OCR.

**Explícitamente fuera de alcance**: Remesas, Analítica, Modelos AEAT 340/347/303/110.

---

## 5. Referencia de la competencia (investigado, útil para UX)

Apps españolas de facturación (Holded, Billin/TS Facturas) usan el escaneo OCR como **acción
principal y más visible**, no secundaria — cópialo para la sección Recibidas: botón de cámara
grande, no escondido en un menú.

---

## 6. Despliegue

MVP en **Netlify** (build web de Ionic, no el empaquetado nativo todavía) para que el jefe
pueda revisar cada avance por URL sin necesidad de compilar nada localmente.
