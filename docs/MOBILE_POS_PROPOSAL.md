# Propuesta futura: cobro móvil / TPV integrado

**Estado: propuesta, no autorizada.** Este documento describe cómo se podría abordar el
cobro de facturas desde la propia app móvil si en el futuro se decide construirlo. No
implica ninguna decisión de producto, proveedor ni presupuesto — es la base para tomar
esa decisión con criterio técnico. **No hay ningún botón de "Cobrar" activo en la app
como consecuencia de este documento**; como mucho, un lugar marcado con un feature flag
apagado donde encajaría el día que se autorice.

---

## 1. Casos de uso

| Caso | Descripción |
|---|---|
| Cobrar una factura | Cobro completo del importe total de una factura emitida y contabilizada, con tarjeta física/contactless o link de pago. |
| Pago parcial | Cobro de un importe menor al total pendiente (anticipos, pagos a plazos). Requiere que la factura soporte múltiples cobros parciales y sepa cuánto queda pendiente. |
| Propina | Solo si el negocio del cliente lo requiere (hostelería, servicios). No es un caso general de facturación B2B — habría que confirmar si aplica al perfil de cliente de ARTIBusiness antes de construirlo. |
| Devolución | Reembolso total o parcial de un cobro ya realizado, asociado al pago original (nunca un cobro negativo suelto sin trazabilidad). |
| Conciliación | Cruce entre lo cobrado por el TPV/PSP y lo registrado como "pagada" en la factura — debe detectar y señalar discrepancias, no asumir que siempre cuadran. |

## 2. Proveedor de pagos (PSP) y terminal/SDK

- Se necesita un PSP (proveedor de servicios de pago) con SDK/API compatible con
  Capacitor/iOS/Android — no se elige proveedor en este documento.
- Dos modelos de terminal a evaluar, no decidir aquí:
  - **Tap to Pay en el propio móvil** (sin hardware adicional, requiere soporte del PSP
    y del sistema operativo — disponible en iOS y en Android de forma limitada por
    fabricante/país).
  - **Terminal física Bluetooth/USB** conectada al móvil vía el SDK del PSP.
- Cualquiera de las dos opciones exige certificación del PSP y, en el caso de Tap to
  Pay, cumplir los requisitos específicos de Apple/Google para esa función.

## 3. Payment Intent (u operación equivalente) creada por backend

- El cobro **nunca se inicia ni se confirma solo desde el móvil** — el backend de
  ARTIBusiness debe crear la operación de pago (Payment Intent o equivalente del PSP
  elegido) con el importe, la moneda y la factura asociada, y devolver a la app un
  identificador de operación y un client secret/token de un solo uso.
- La app solo usa ese token para completar el cobro con el SDK del PSP — no construye
  ni firma la operación de pago por su cuenta.

## 4. Idempotencia y asociación pago ↔ factura

- Cada intento de cobro necesita una clave de idempotencia (podría reutilizar el mismo
  patrón que `OperacionId` ya usa esta app para Facturas Emitidas) para que un reintento
  de red no duplique el cargo.
- El backend debe mantener la relación factura → pago(s) como una lista, no un campo
  único, para soportar pagos parciales y devoluciones sin perder el historial.

## 5. Estados, cancelaciones y reconciliación

Estados mínimos a modelar (a confirmar contra el catálogo real del PSP elegido):
`iniciado`, `requiere_confirmación`, `procesando`, `completado`, `fallido`,
`cancelado`, `reembolsado_total`, `reembolsado_parcial`. Un estado no reconocido debe
tratarse igual que en el resto de la app: de forma conservadora, nunca como éxito por
defecto (mismo criterio que ya se aplica a `EstadoAeat`).

## 6. Recibo y auditoría

- Cada cobro genera un recibo (independiente de la factura) descargable/compartible con
  el mismo mecanismo ya construido para documentos (`compartirBlob`/`descargarBlob`,
  ver `src/app/shared/utils/compartir-documento.ts`).
- Auditoría: quién cobró, desde qué dispositivo, cuándo, y el resultado — necesario para
  poder investigar una disputa o un contracargo.

## 7. Seguridad y alcance PCI DSS

- **Principio obligatorio, no negociable**: la aplicación y el backend de ARTIBusiness
  **no almacenan ni registran el PAN (número de tarjeta) ni el CVV** en ningún momento,
  ni siquiera de forma transitoria en logs. Toda la captura de datos de tarjeta ocurre
  dentro del SDK del PSP (que corre en un contexto aislado/tokenizado), nunca en código
  propio de esta app.
- Este principio reduce el alcance de cumplimiento PCI DSS de ARTIBusiness al mínimo
  (SAQ-A o equivalente, según el modelo de integración elegido) — pero solo si se
  respeta estrictamente: cualquier integración que exponga el PAN a código propio
  (aunque sea para "solo mostrarlo") amplía ese alcance y debe rechazarse.

## 8. Opciones de integración a evaluar (sin elegir proveedor)

Ejemplos de la categoría de solución a evaluar cuando llegue el momento — no es una
recomendación ni una preselección:
- SDKs de Tap to Pay nativos de PSPs con presencia en España/UE.
- Terminales Bluetooth certificadas de PSPs con plugin o SDK compatible con Capacitor.
- Links de pago (sin hardware) como alternativa de menor fricción para cobro remoto,
  con sus propias limitaciones (no sirve para cobro presencial inmediato).

## 9. Preguntas de negocio pendientes (no técnicas)

- ¿En qué países/monedas necesita operar el cobro? (afecta directamente a qué PSPs son
  siquiera candidatos).
- ¿Coste aceptable por transacción (comisión del PSP) y coste de hardware si se opta
  por terminal física?
- ¿Se necesita para la primera versión, o es una fase posterior tras validar el resto
  del MVP?
- ¿Aplica a todos los clientes de ARTIBusiness o solo a un segmento (p. ej. quienes
  cobran en el momento frente a quienes solo facturan a 30/60 días)?
- Requisitos de tienda móvil: Tap to Pay en iOS exige cumplir el programa de Apple para
  esa función (aprobación previa); Android varía por fabricante y país — hay que
  confirmar cobertura real antes de comprometerse con esta vía.

---

## Fuera de alcance de este documento

- No se ha evaluado ni contactado a ningún PSP concreto.
- No se ha estimado coste ni calendario.
- No hay ningún cambio de código asociado a esta propuesta — es puramente de diseño.
