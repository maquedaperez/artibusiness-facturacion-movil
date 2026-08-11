# Plan de remediación — ARTIBusiness Facturación (móvil)

Basado en el baseline y la matriz de integración de la Fase 0 (2026-08-11, commit
`a7972e7`). No incluye tareas de VeriFactu/FacturaE en sí (responsabilidad del servicio
externo) — solo cómo este frontend debe consumirlo cuando el contrato exista.

## Completado

| Tarea | Commit |
|---|---|
| `npm audit fix` (sin `--force`) para las 8 vulnerabilidades altas de `@angular/*` | `e75f019` |
| Test runner headless (`test:ci` con `ChromeHeadless`) | `446b1f9` |
| Fijar versión de Node (`.nvmrc` + `engines`) coherente con `netlify.toml` | `43af9e5` |
| Corregir los 57 errores de lint (`@angular-eslint/prefer-inject`) | `fdfbe38` |
| Definir puertos tipados (`EmisorRepository`, `CustomersRepository`, `SuppliersRepository`, `IssuedInvoicesRepository`, `ReceivedInvoicesRepository`) y mover `MockFacturasService` detrás de ellos — ninguna página/modal importa `MockFacturasService` directamente | `f7fd371` |
| Badge "Modo demo — datos simulados" único y consistente (antes cada pantalla tenía su propio texto suelto) | `251eea2` |
| Avisos de Contabilizar/Firmar corregidos para dejar explícito que son simulados, no un envío real a Verifactu/AEAT | `251eea2` |
| Bloqueo de doble envío en Guardar borrador / Guardar (factura recibida) | `251eea2` |
| `crearDesdeOcr` ya no usa `Math.random()` — datos de ejemplo deterministas | `251eea2` |
| Corregir 7 specs que fallaban por falta de `ActivatedRoute`/`ModalController` en el TestBed | `0feeec5` |

## P0 — crítico, no bloqueado por contratos externos

| Tarea | Por qué es P0 | Depende de | Criterio de aceptación |
|---|---|---|---|
| Retirar `saved_password` de Capacitor Preferences | Contraseña en claro persistida en disco del dispositivo — hallazgo de seguridad real, no hipotético. Alternativas ya documentadas en `docs/SESSION_SECURITY_ALTERNATIVES.md`, pendiente de decidir cuál aplicar sin romper login/biometría/MFA | Nada | Ninguna clave de Preferences/localStorage contiene la contraseña; el reenvío de MFA deja de depender de ella (bloquea gap #2 hasta tener endpoint propio) o se sustituye por un flujo que no la necesite |

## P1 — arquitectura e integración real (algunos bloqueados por gaps de contrato)

| Tarea | Por qué es P1 | Depende de | Criterio de aceptación |
|---|---|---|---|
| Selección de provider por configuración de build (mock vs HTTP) + test que falla si producción usa mock | Requisito explícito: producción no debe poder arrancar con mocks | Que exista al menos un `HttpXxxRepository` real que ofrecer como alternativa | Existe una prueba automatizada que falla si `environment.production === true` y el provider activo es el mock |
| `ApiClient` con timeout, cancelación, errores tipados, tratamiento global 401/403, correlation ID | `ApiService` actual no tiene ninguna de estas capacidades — hoy solo lo usa `AuthService`, pero cualquier repo HTTP nuevo las necesitará | Nada | Cualquier llamada que exceda el timeout se cancela y produce un error tipado, no una promesa colgada |
| `SessionStore` — retirar token de `localStorage` plano | Confirmado: token y usuario en `localStorage`, sin estrategia documentada de expiración/revocación del lado servidor | **Bloqueado parcialmente** por gaps #1–3 (no se sabe si el backend soporta cookie HttpOnly o si el contrato Bearer es el único disponible) | Estrategia de sesión documentada en un ADR y aplicada; ningún dato de sesión sobrevive a un logout |
| Implementar `HttpRepository` real por función según se confirmen contratos | Es el objetivo final de todo el plan | Gaps #4, #5, #7, #9, #10, #11, #13, #21 (uno por función) — ver `docs/SERVICE_CONTRACT_GAPS.md` | Cada repo HTTP tiene contract tests contra fixtures del contrato aprobado, no contra suposiciones |
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
