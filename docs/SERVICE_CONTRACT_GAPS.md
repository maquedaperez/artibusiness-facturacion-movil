# Huecos de contrato — preguntas para el equipo de backend/negocio

Formato por pregunta: **impacto**, **pantalla afectada**, **qué necesito exactamente**.
Agrupado como pide la Fase 0. Las marcadas ✅ **RESUELTO** se dejan documentadas por
trazabilidad, no requieren respuesta.

---

## Autenticación

1. **¿Por qué falló `POST /api/Users/authenticate`?** Se probó en producción (commit
   `1db2ef4`) y se revirtió a `/api/Employees/authenticate` porque el segundo sí funciona.
   Pero `Employees` es el dominio de Fichajes (empleados internos), no el de clientes de
   Facturación (`Users`), según lo que confirmó la sesión de backend. — **Impacto**: alto,
   es el único punto de entrada de toda la app. — **Pantalla**: Login. — **Qué necesito**:
   log del error real de `/api/Users/authenticate` (¿401? ¿400? ¿payload distinto?), o
   confirmación de que el usuario de prueba no está dado de alta como `User`.

2. **¿El dominio `Users` tiene paso de MFA?** El código actual llama a
   `/api/Employees/authenticatemfa` para verificar el código — nunca se ha confirmado un
   endpoint equivalente en `Users`. — **Impacto**: medio (MFA puede no dispararse nunca en
   este dominio, o dispararse y no tener a dónde verificar). — **Pantalla**: MFA. —
   **Qué necesito**: sí/no, y si es sí, ruta + payload exactos.

3. **Rutas exactas de recuperación de contraseña en `Users`.** El código llama a
   `/api/Employees/forgot`. Se mencionó que existe `UsersController` con `forgot`,
   `getUserCode`, `validateUserCode` — no se han confirmado las rutas literales ni el
   payload de cada una. — **Impacto**: medio. — **Pantalla**: Olvidé mi contraseña. —
   **Qué necesito**: las 3 rutas + payload + respuesta.

---

## ARTIBusiness (clientes, proveedores, empresa)

4. **Payload/respuesta exactos de `ClienteUsuarioController`.** Se confirmó que existen
   `findbyname`, `findbynif`, `findbyid`, `findbyhash`, `insert`, `insertmenor`, pero nunca
   se ha visto un ejemplo real de request/response. — **Impacto**: alto para conectar el
   selector de cliente real. — **Pantalla**: modal "Seleccionar cliente" (Emitidas). —
   **Qué necesito**: ejemplo de request y de response de `findbyname` e `insert`, y qué
   campos son obligatorios en el alta.

5. **Endpoints de Proveedor — no existen todavía.** Ya se redactó la petición formal
   (modelo `Proveedor` + `findbyname`/`findbynif`/`insert`, calcado de Cliente) y se pasó al
   usuario para trasladar al equipo de backend. — **Impacto**: alto para Recibidas. —
   **Pantalla**: modal "Seleccionar proveedor" (Recibidas). — **Qué necesito**: confirmación
   de que se van a construir, y contrato una vez existan.

6. **¿`Empresa.cs` soporta el toggle autónomo/empresa?** Confirmado que el modelo real solo
   tiene `CifEmpresa` (sin distinción persona física/jurídica) — pero el jefe pidió
   explícitamente ese toggle para la app. La UI ya lo tiene construido (mock), pendiente de
   saber cómo se mapea contra el backend real (¿campo nuevo? ¿se infiere del formato del
   NIF/CIF? ¿no aplica y el emisor siempre es una entidad con CIF?). — **Impacto**: medio,
   afecta al modelo de datos de "Datos fiscales de la empresa". — **Pantalla**: Perfil →
   Datos fiscales. — **Qué necesito**: decisión de negocio + si hace falta campo nuevo en
   `Empresa.cs`.

7. **API de Numeradores.** `fNumeradoresMnto.aspx` existe en la web, sin API confirmada. —
   **Impacto**: alto, es un selector obligatorio en Emitidas. — **Pantalla**: Facturas
   Emitidas (selector superior) y detalle. — **Qué necesito**: `GET /api/Numeradores` (o
   equivalente) — de solo lectura basta para el MVP, según se decidió con el jefe.

8. ✅ **RESUELTO** — "Facturas de venta" y "Facturas emitidas" son el mismo menú/misma
   pantalla; la etiqueta cambia solo entre vista de escritorio y responsive.

---

## Facturación (Emitidas / Recibidas)

9. **Endpoints completos de Facturas Emitidas.** Ya listados en `CONTEXTO_FACTURACION.md`
   sección 3 (listar por estado, detalle, editar, contabilizar, firmar). Solo existe
   `POST /api/FacturaEmitida/crear` (alta puntual, no sirve para este flujo). —
   **Impacto**: crítico, es el core de la app. — **Pantallas**: Facturas Emitidas (lista +
   detalle). — **Qué necesito**: los 5 endpoints de esa tabla, contrato completo.

10. **Endpoint de líneas de factura emitida.** Confirmado el modelo EF
    (`FacturacionFacturasEmitidasLineas`: `Descripcion`, `Cantidad`, `PrecioUnitario`,
    `Descuento`, `IdImpuesto`, `EsSuplido`), sin endpoint. — **Impacto**: crítico. —
    **Pantalla**: detalle de factura emitida (editor de líneas). — **Qué necesito**: si
    viaja dentro del mismo payload de la cabecera o como sub-recurso aparte, y el catálogo
    real de `IdImpuesto` (hoy se usa `ivaPct` numérico directo como sustituto).

11. **Catálogo real de medios de pago (`IdMedioPago`).** Confirmado que es un campo
    obligatorio (no admite nulo) en `FacturacionFacturasEmitidasCabecera`, pero no se conoce
    el catálogo de valores válidos — la UI usa ahora mismo una lista provisional
    (Transferencia/Domiciliación/Tarjeta/Efectivo/Cheque). — **Impacto**: medio, bloqueará
    "Contabilizar" en real si el valor enviado no coincide con el catálogo. — **Pantalla**:
    detalle de factura emitida. — **Qué necesito**: `GET` del catálogo o lista fija
    documentada con sus IDs.

12. **Regla fiscal del IRPF.** ¿Depende de si emitimos como autónomo o como empresa? Sin
    confirmar — es una decisión de negocio/fiscal, no de código. — **Impacto**: medio,
    afecta a si el campo debe mostrarse/ser editable siempre o solo condicionalmente. —
    **Pantalla**: detalle de factura emitida. — **Qué necesito**: respuesta del
    jefe/asesoría.

13. **Endpoints completos de Facturas Recibidas.** `POST /api/FacturaRecibida/desde-ocr`
    sugerido en `CONTEXTO_FACTURACION.md`, sin construir. Tampoco existen
    listar/crear-manual/editar/eliminar. — **Impacto**: crítico. — **Pantallas**: Facturas
    Recibidas (lista + detalle). — **Qué necesito**: contrato completo, análogo al de
    Emitidas.

14. **¿Columnas E (Enviada) y C (Cobrada) hacen falta en el móvil?** Confirmado que existen
    en el modelo real de Emitidas; se decidió (recomendación propia, no del jefe) dejarlas
    fuera del MVP. — **Impacto**: bajo, es una decisión de alcance, no un bloqueo técnico. —
    **Pantalla**: Facturas Emitidas. — **Qué necesito**: confirmación del jefe de si se
    quedan fuera definitivamente o se añaden en una siguiente fase.

---

## FacturaE / VeriFactu (servicio externo — el frontend NUNCA debe implementar esto)

15. **¿Qué servicio orquesta la llamada desde esta app?** ¿Es la propia
    `WebAPIARTIBusiness` la que internamente llama a FacturaE al recibir "Contabilizar", o
    la app móvil tiene que llamar a FacturaE directamente? — **Impacto**: crítico para el
    diseño del `FiscalStatusRepository`. — **Pantalla**: Facturas Emitidas (acción
    Contabilizar/Firmar). — **Qué necesito**: diagrama de quién llama a quién.

16. **Esquema de idempotencia y consulta tras timeout.** Si "Contabilizar" no confirma a
    tiempo, ¿cómo se re-consulta el resultado sin duplicar el envío a AEAT? — **Impacto**:
    crítico, riesgo real de doble contabilización/doble envío fiscal. — **Pantalla**:
    Facturas Emitidas. — **Qué necesito**: contrato de idempotencia (¿se reutiliza
    `OperacionId`, que ya genera esta app al crear el borrador?).

17. **Catálogo completo de estados/códigos de error VeriFactu.** Hoy el mock usa
    `PendienteEnvio | Correcto | AceptadoConErrores | RechazadoAeat | RequiereRevisionManual`
    — son nombres razonables pero **no confirmados** contra el catálogo real. —
    **Impacto**: alto, si no coincide el mapeo de estados mostrará información incorrecta al
    usuario. — **Pantalla**: Facturas Emitidas. — **Qué necesito**: lista oficial de
    estados/códigos con su significado.

18. **Flujo de alta/anulación/rectificación/subsanación.** Solo se ha construido
    "Contabilizar" y "Firmar" en este frontend — no se sabe si hace falta soportar
    anulaciones o rectificativas desde el móvil. — **Impacto**: medio, depende de si el
    jefe lo pide. — **Pantalla**: Facturas Emitidas. — **Qué necesito**: ¿está en alcance
    del móvil, o es exclusivo del escritorio?

19. **Disponibilidad y caducidad de PDF/XML firmado/QR.** No se sabe si estos artefactos se
    sirven vía URL temporal, endpoint autenticado, o no están disponibles para el móvil. —
    **Impacto**: medio. — **Pantalla**: detalle de factura emitida (firmada). —
    **Qué necesito**: contrato de descarga.

20. **Entorno sandbox/pruebas.** ¿Existe un entorno de pruebas de FacturaE/VeriFactu donde
    se pueda contabilizar/firmar sin efectos fiscales reales, para probar esta app antes de
    producción? — **Impacto**: alto para poder probar la integración real sin arriesgar
    datos fiscales verdaderos. — **Qué necesito**: credenciales/URL de sandbox si existe.

---

## OCR

21. **Contrato exacto de `POST /api/FacturaRecibida/desde-ocr`.** Sugerido en
    `CONTEXTO_FACTURACION.md`, nunca confirmado. El servicio OCR en sí (Gemini+Flask) lo
    tiene otro equipo — no se sabe si este endpoint ya envuelve esa llamada o si la app
    debe hablar directamente con el servicio OCR. — **Impacto**: crítico para Recibidas. —
    **Pantalla**: Facturas Recibidas (botón Escanear/subir). — **Qué necesito**: contrato
    completo (multipart, tamaño máximo, formatos soportados, tiempo de respuesta esperado,
    forma de la respuesta con los campos extraídos).

---

## Documentos

22. **Almacenamiento de documentos adjuntos (recibidas).** Hoy la imagen se guarda como
    Data URL en memoria (se pierde al recargar). No se sabe si el backend ofrece subida y
    almacenamiento propio, o si se apoya en el mismo servicio OCR. — **Impacto**: medio. —
    **Pantalla**: detalle de factura recibida. — **Qué necesito**: endpoint de subida +
    política de retención/cifrado (responsabilidad del servicio, no de esta app, pero hace
    falta saber el contrato de subida/descarga).

---

## Autenticación (añadido tras documentar `docs/SESSION_SECURITY_ALTERNATIVES.md`)

23. **¿Puede el backend emitir un refresh token independiente del token de sesión?** Hoy
    `saved_password` (contraseña en Preferences, sin cifrar) es lo único que permite el login
    biométrico — un refresh token revocable en Keychain/Keystore lo sustituiría sin guardar
    la contraseña. — **Impacto**: alto, es un hallazgo de seguridad real pendiente. —
    **Pantalla**: Login. — **Qué necesito**: sí/no, y si es sí, contrato del refresh token
    (expiración, revocación, rotación).

24. **¿Existe o se puede construir un endpoint de reenvío de MFA basado en `challengeId`?**
    Hoy `resendMfaCode()` reutiliza la contraseña guardada porque no hay alternativa. —
    **Impacto**: alto, mismo motivo que el punto anterior. — **Pantalla**: MFA. —
    **Qué necesito**: `POST` que acepte `challengeId` sin pedir credenciales de nuevo.
