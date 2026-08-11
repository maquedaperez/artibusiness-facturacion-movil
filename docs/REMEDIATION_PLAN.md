# Plan de remediación — ARTIBusiness Facturación (móvil)

Basado en el baseline y la matriz de integración de la Fase 0 (2026-08-11, commit
`a7972e7`). No incluye tareas de VeriFactu/FacturaE en sí (responsabilidad del servicio
externo) — solo cómo este frontend debe consumirlo cuando el contrato exista.

## P0 — crítico, no bloqueado por contratos externos

| Tarea | Por qué es P0 | Depende de | Criterio de aceptación |
|---|---|---|---|
| Retirar `saved_password` de Capacitor Preferences | Contraseña en claro persistida en disco del dispositivo — hallazgo de seguridad real, no hipotético | Nada | Ninguna clave de Preferences/localStorage contiene la contraseña; el reenvío de MFA deja de depender de ella (bloquea gap #2 hasta tener endpoint propio) o se sustituye por un flujo que no la necesite |
| `npm audit fix` (sin `--force`) para las 8 vulnerabilidades altas de `@angular/*` | Son parches dentro del rango `^20.0.0` ya declarado en `package.json` (`@angular/core` 20.3.16 → 20.3.27 disponible) — no es un major | Nada | `npm audit --omit=dev` sin altas/críticas; build + lint + páginas probadas manualmente sin regresión visible |
| Test runner headless (`test:ci` con `ChromeHeadless`) | Hoy `ng test` usa `browsers: ['Chrome']` (no headless) — no se puede verificar en CI ni en este entorno; confirmado que se cuelga más de 30s | Nada | `npm run test:ci` termina y reporta resultado en un pipeline sin GUI |
| Badge "MODO DEMO — DATOS SIMULADOS" visible cuando el provider es mock | Ahora mismo cada pantalla mock tiene su propio `ion-chip` de aviso repetido con texto distinto — funciona, pero no es una garantía estructural, es texto suelto por pantalla | Nada | Un único mecanismo (interceptor/servicio) decide si mostrar el aviso, no cada página por separado |
| Fijar versión de Node (`.nvmrc` o `engines` en `package.json`) coherente con `netlify.toml` (`NODE_VERSION=20`) | Local corre Node 24; Netlify build usa 20 — riesgo de drift no detectado | Nada | Mismo major de Node declarado en los 3 sitios (dev, CI si existe, Netlify) |

## P1 — arquitectura e integración real (algunos bloqueados por gaps de contrato)

| Tarea | Por qué es P1 | Depende de | Criterio de aceptación |
|---|---|---|---|
| Definir puertos por capacidad (`IssuedInvoicesRepository`, `ReceivedInvoicesRepository`, `CustomersRepository`, `SuppliersRepository`, `TenantRepository`, `FiscalStatusRepository`, `OcrRepository`, `BillingDocumentsRepository`) y mover `MockFacturasService` detrás de ellos | Hoy las páginas inyectan `MockFacturasService` directamente — imposible alternar mock↔HTTP sin tocar cada pantalla | Nada (es refactor interno, no necesita contratos nuevos) | Ninguna página/modal importa `MockFacturasService` directamente; todas pasan por una interfaz de puerto |
| Selección de provider por configuración de build (mock vs HTTP) + test que falla si producción usa mock | Requisito explícito: producción no debe poder arrancar con mocks | El punto anterior | Existe una prueba automatizada que falla si `environment.production === true` y el provider activo es el mock |
| `ApiClient` con timeout, cancelación, errores tipados, tratamiento global 401/403, correlation ID | `ApiService` actual no tiene ninguna de estas capacidades — hoy solo lo usa `AuthService`, pero cualquier repo HTTP nuevo las necesitará | Nada | Cualquier llamada que exceda el timeout se cancela y produce un error tipado, no una promesa colgada |
| Corregir los 57 errores de lint (`@angular-eslint/prefer-inject`) | Mecánico y de bajo riesgo (schematic oficial `ng generate @angular/core:inject`), pero repetido en 18 archivos | Nada | `npm run lint` sin errores; build sin cambios de comportamiento |
| `SessionStore` — retirar token de `localStorage` plano | Confirmado: token y usuario en `localStorage`, sin estrategia documentada de expiración/revocación del lado servidor | **Bloqueado parcialmente** por gaps #1–3 (no se sabe si el backend soporta cookie HttpOnly o si el contrato Bearer es el único disponible) | Estrategia de sesión documentada en un ADR y aplicada; ningún dato de sesión sobrevive a un logout |
| Implementar `HttpRepository` real por función según se confirmen contratos | Es el objetivo final de todo el plan | Gaps #4, #5, #7, #9, #10, #11, #13, #21 (uno por función) | Cada repo HTTP tiene contract tests contra fixtures del contrato aprobado, no contra suposiciones |
| Corregir 7 specs que fallan (`FacturasEmitidasPage`, `FacturaRecibidaDetallePage`, `MfaPage` y otros — falta `ActivatedRoute`/`ModalController` en el TestBed) | **Hallazgo nuevo** (2026-08-11): invisible hasta ahora porque `ng test` nunca terminaba (ver P0, `test:ci`). Al arreglar el runner headless, aparecieron 7 de 13 tests en rojo | Nada | `npm run test:ci` en verde, sin relajar ninguna aserción |
| Mapeo explícito de estados VeriFactu (externo → UI), con "estado no reconocido" para valores desconocidos | Hoy los 5 estados del mock (`PendienteEnvio`, `Correcto`, etc.) son inventados, razonables pero no confirmados | Gap #17 | Un estado del backend no presente en el mapping se muestra como "no reconocido", nunca como éxito por defecto |

## P2 — calidad y despliegue (no bloqueante para el MVP actual)

| Tarea | Por qué es P2 |
|---|---|
| Documentar ADRs (selección de providers, autenticación, transporte, idempotencia, dinero, mapping de estados) | Útil para quien retome el proyecto, no bloquea funcionalidad |
| Cabeceras de seguridad web en Netlify (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) | El sitio ya es público (aunque privado de facto por requerir login real); no hay incidente conocido, es endurecimiento preventivo |
| Revisión de identidad Android/iOS (rastros de "RRHH"/Fichajes en `android/`, permisos no usados, `cleartext`, `FileProvider`, WebView debugging) | Explícitamente pospuesto — el proyecto decidió no tocar empaquetado nativo todavía (fase posterior confirmada varias veces en este chat) |
| `docs/ENVIRONMENT_CONFIGURATION.md` con matriz dev/CI/producción | Se puede escribir en paralelo a P0/P1 sin bloquear nada |

---

## Nota sobre alcance de negocio (no técnico)

Remesas SEPA, Analítica y los Modelos AEAT 303/110/340/347 **no aparecen en este plan**:
están descartados explícitamente por decisión de producto (confirmado con el jefe), no por
limitación técnica. Si en algún momento entran en alcance, es una ampliación nueva, no una
tarea pendiente de este plan.
