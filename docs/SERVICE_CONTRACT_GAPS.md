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

---

## Reunión de cambios funcionales — bloques A/B/C (2026-08-11)

25. **Endpoint de lectura de datos fiscales + PATCH limitado a contacto.** La app ya no
    permite editar razón social/NIF/CIF/tipo (autónomo o empresa) desde el formulario —
    solo dirección, población, código postal, provincia y teléfono (campo nuevo,
    `EmisorFiscal.telefono`, no confirmado si existe en `Empresa.cs`). — **Impacto**: alto,
    bloquea conectar `HttpEmisorRepository` real. — **Pantalla**: Perfil → Datos fiscales. —
    **Qué necesito**: (a) `GET` de datos fiscales completo (para mostrar los campos
    inmutables), (b) `PATCH`/`PUT` que acepte *solo* `{ direccion, poblacion, cp, provincia,
    telefono }` — si el endpoint real exige mandar razón social/NIF igualmente, decirlo para
    que el frontend los reenvíe sin permitir cambiarlos (nunca los deja editar, solo los
    reenviaría intactos). Relacionado con el gap #6 (toggle autónomo/empresa).

26. **Búsqueda paginada de clientes (`CustomersRepository.buscar`).** El selector de cliente
    ya no carga el listado completo al abrirse — busca bajo demanda (mínimo 2 caracteres,
    debounce ~350ms) y espera una respuesta paginada. — **Impacto**: alto, bloquea conectar
    `HttpCustomersRepository` real. — **Pantalla**: modal "Seleccionar cliente". —
    **Qué necesito**: confirmar si `findbyname`/`findbynif` (gap #4) soportan paginación
    (`page`/`pageSize` o `skip`/`take`) y devuelven un total, o si hay que paginar en el
    cliente sobre una respuesta ya limitada por el propio backend.

27. **Búsqueda paginada de proveedores (`SuppliersRepository.buscar`).** Mismo cambio que el
    punto anterior, aplicado a proveedores. — **Impacto**: alto, bloquea
    `HttpSuppliersRepository`. — **Pantalla**: modal "Seleccionar proveedor". —
    **Qué necesito**: lo mismo que el gap #26, una vez exista el endpoint de Proveedor
    (gap #5).

28. **Contrato de configuración de retención/withholding (extiende el gap #12).** El IRPF
    dejó de ser un campo que el usuario elige por factura — ahora se calcula a partir de la
    configuración fiscal del emisor/actividad y se muestra solo en el bloque de totales,
    igual que el IVA. La UI mock ya está preparada para consumir exactamente esta forma
    (`RetencionAplicada` en `mock-facturas.service.ts`), pero el mock usa una configuración
    fija (`aplicable=false`) — nunca infiere el tipo de retención leyendo el concepto ni deja
    elegir el % al usuario. — **Impacto**: alto, es una decisión fiscal real (ver la regla de
    alquiler urbano al 19% y sus excepciones — vivienda de empleados, renta anual ≤ 900€ sin
    IVA, exoneración por epígrafe IAE, reglas territoriales y de no residentes — que solo
    el backend puede resolver caso a caso). — **Pantalla**: detalle de factura emitida
    (bloque Totales). — **Qué necesito**: que `totales()` (o el endpoint que lo sustituya)
    devuelva, por factura: `withholdingApplicable` (bool), tipo/código de retención,
    `etiqueta` (el texto exacto a mostrar — "IRPF", "Retención alquiler", etc.),
    `porcentaje`, `base` sujeta, `importe` calculado, y `motivoNoAplica` cuando no aplique.
    Fuentes usadas para modelar la fixture de prueba (alquiler urbano, 19%, no aplicada a
    ninguna factura del MVP en vivo): AEAT (retenciones por arrendamiento de inmuebles) y
    Reglamento IRPF art. 100.

---

## Bloque D — líneas con origen y facturas recibidas con líneas (2026-08-11)

29. **Búsqueda paginada de catálogo (`CatalogRepository.buscar`).** Nuevo selector "línea
    de catálogo" al añadir una línea a una factura — busca bajo demanda (mínimo 2
    caracteres, debounce ~350ms), igual que clientes/proveedores. No existe backend
    real: el mock usa 5 productos/servicios de ejemplo fijos. — **Impacto**: alto,
    bloquea conectar `HttpCatalogRepository`. — **Pantalla**: selector de línea en
    Factura Detalle (Emitidas). — **Qué necesito**: (a) confirmación de que existe (o
    va a existir) un catálogo de productos/servicios propio de la empresa en el
    backend, distinto del catálogo de impuestos (`IdImpuesto`, gap #10); (b) endpoint
    de búsqueda paginada por nombre/referencia con los campos que hoy tiene
    `ProductoCatalogo` (nombre, descripción, precioUnitario, ivaPct, referencia) o el
    contrato real si difiere.

30. **Búsqueda paginada de suscripciones (`SubscriptionsRepository.buscar`).** Mismo
    patrón que el gap #29, para servicios recurrentes. En este lote **no** se generan
    renovaciones ni cobros automáticos — la suscripción solo se usa como origen de una
    línea puntual (se copia un snapshot, no queda vinculada a un ciclo de facturación).
    — **Impacto**: alto, bloquea `HttpSubscriptionsRepository`. — **Pantalla**: selector
    de línea en Factura Detalle. — **Qué necesito**: (a) confirmación de que existe (o
    va a existir) un catálogo de suscripciones/servicios recurrentes propio de la
    empresa; (b) endpoint de búsqueda paginada con los campos de `Suscripcion` (nombre,
    periodicidad, precio, ivaPct, estado) o el contrato real; (c) si en el futuro se
    quiere generar la renovación/cobro automático desde esta app, es una ampliación de
    alcance nueva, no algo que este lote haya dejado a medias — no hay lógica de
    recurrencia en el frontend.

31. **Endpoints completos de líneas y totales de Facturas Recibidas.** Hasta ahora
    Recibidas solo tenía un importe suelto (base/IVA/IRPF a nivel de cabecera). Ahora
    tiene líneas (mismo modelo `LineaFactura` que Emitidas, sin catálogo/suscripción
    como origen — solo manual, porque una recibida transcribe la factura de un
    proveedor externo) y un `retencionPct` editable a nivel de documento (a diferencia
    de Emitidas, en Recibidas la retención la declara la propia factura del proveedor,
    no la decide nuestra configuración fiscal). — **Impacto**: crítico, es la
    estructura de datos de toda la pantalla. — **Pantalla**: Factura Recibida Detalle.
    — **Qué necesito**: confirmar si el backend real de Recibidas (gap #13, todavía sin
    construir) va a modelar líneas igual que Emitidas
    (`FacturacionFacturasEmitidasLineas`, gap #10) o si Recibidas tiene su propia tabla
    de líneas con otro nombre/forma; y si el campo de retención declarado por el
    proveedor tiene alguna validación especial en backend (p. ej. contra su NIF/epígrafe).

---

## Bloque E — acciones mínimas y permisos por estado (2026-08-11)

32. **`allowedActions` por factura, en vez de calcularlo en el frontend.** Hoy
    `accionesFacturaEmitida`/`accionesFacturaRecibida` (mock-facturas.service.ts)
    calculan editar/eliminar/copiar/descargar/compartir en el cliente — son **dos
    políticas deliberadamente distintas**, no una compartida:
    - **Emitidas**: depende del `estado` fiscal real (borrador vs. contabilizada/
      firmada), porque estas facturas sí se remiten a Verifactu/AEAT desde el backend.
    - **Recibidas**: esta app **nunca** remite las recibidas a Verifactu/AEAT, así que
      su `estado` (`borrador`/`revisada`) es solo un repaso interno sin peso fiscal y
      **no** decide nada por sí solo — tampoco `pagada`. El único bloqueo real es
      `accountingLocked` (ver gap #36), que hoy no marca nadie en el mock, por lo que
      una recibida "revisada" sigue siendo totalmente editable/eliminable/copiable.

    Ninguna de las dos está confirmada contra el backend real — en particular, no
    contemplan permisos por rol de usuario ni excepciones de negocio (p. ej. un
    supervisor que sí pueda anular una factura contabilizada). — **Impacto**: alto, es
    la política que decide qué botones se ven en todas las facturas. — **Pantallas**:
    listado y detalle de Emitidas y Recibidas. — **Qué necesito**: si el backend real
    puede devolver `allowedActions` explícito por factura (recomendado, ver la nota del
    propio prompt de la reunión), este frontend pasa a **mapear** esa respuesta en vez
    de calcularla — cambio acotado a `accionesFacturaEmitida`/`accionesFacturaRecibida`,
    sin tocar ninguna pantalla.

33. **Operación de anulación/baja autorizada para una factura contabilizada.** Hoy
    "Eliminar" solo está permitido en estado borrador — una factura contabilizada nunca
    se borra desde esta app. El propio prompt de la reunión prevé que pueda existir "una
    operación autorizada distinta" para ese caso (anulación/rectificativa), que no
    existe todavía. — **Impacto**: medio, hoy simplemente no se ofrece la acción. —
    **Pantallas**: listado y detalle de Emitidas y Recibidas. — **Qué necesito**: si
    existe (o se va a construir) un endpoint de anulación/baja para facturas ya
    contabilizadas, y sus reglas (quién puede, con qué justificación, efecto sobre
    Verifactu/AEAT si ya se envió).

34. **Documento/PDF real de una factura emitida.** `generarDocumento()` genera hoy un
    HTML de demostración marcado "SIMULACIÓN — NO VÁLIDO FISCALMENTE" con los datos de
    la factura — no hay PDF real ni backend que lo sirva. — **Impacto**: alto para que
    "Descargar/Compartir documento" en Emitidas deje de ser una simulación. —
    **Pantallas**: listado y detalle de Facturas Emitidas. — **Qué necesito**: el
    endpoint o servicio de documentos real (¿lo sirve `WebAPIARTIBusiness`? ¿el propio
    servicio de FacturaE que genera el XML/PDF firmado, gap #19?), formato de
    respuesta (URL temporal vs. binario autenticado) y si aplica igual a un borrador
    (sin firmar) que a una factura ya firmada.

35. **Endpoint de duplicar/copiar factura.** `duplicar()` construye hoy el borrador
    limpio enteramente en el cliente (mock) — copia cliente/proveedor, concepto y
    líneas, y descarta id/serie/estado fiscal/OperacionId/documento adjunto anteriores.
    — **Impacto**: medio, es una operación de escritura que probablemente deba
    resolverse en backend para mantener consistencia (numeración, OperacionId nuevo
    generado server-side, etc.), no solo en el cliente. — **Pantallas**: listado y
    detalle de Emitidas y Recibidas. — **Qué necesito**: confirmar si "copiar" debe ser
    una llamada a un endpoint específico (`POST .../duplicar`) en vez de que el cliente
    arme el nuevo borrador con los datos que ya tiene descargados.

36. **Bloqueo contable real de una factura recibida (`accountingLocked`).** Corrección
    del 2026-08-11: la primera versión de este bloque hacía que una recibida "revisada"
    se bloqueara igual que una emitida contabilizada — **incorrecto**, porque esta app
    no remite las recibidas a Verifactu/AEAT, así que "revisada" es solo un repaso
    interno sin ningún peso fiscal ni contable. Se corrigió para que `estado`
    (`borrador`/`revisada`) y `pagada` **nunca** decidan si se puede editar/eliminar/
    cambiar el pago — el mock ahora solo respeta un campo `accountingLocked` explícito
    (hoy nadie lo marca, por eso todo sigue editable). — **Impacto**: alto, es la única
    fuente de verdad de bloqueo para Recibidas de aquí en adelante. — **Pantallas**:
    listado y detalle de Facturas Recibidas. — **Qué necesito exactamente**, en orden de
    preferencia: (a) `allowedActions` explícito por factura recibida (igual que el gap
    #32, ideal); si no es viable a corto plazo, entonces al menos (b) un indicador
    booleano explícito equivalente a `accountingLocked`; (c) el motivo del bloqueo
    (`accountingLockReason`) para poder mostrarlo al usuario en vez de solo deshabilitar
    botones sin explicación; (d) si existe el concepto de periodo contable cerrado
    (`accountingPeriodClosed`) como causa distinta a un bloqueo manual factura por
    factura. El frontend ya tiene los tres campos modelados en `FacturaRecibida`
    (`accountingLocked`, `accountingLockReason`, `accountingPeriodClosed`) listos para
    recibir estos valores del backend real sin cambios adicionales de tipo.
