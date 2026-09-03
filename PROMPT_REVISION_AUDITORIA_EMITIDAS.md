# Revisión crítica de la auditoría de Facturas emitidas

## Encargo para Claude

Quiero que revises críticamente la auditoría incluida en este documento y la contrastes con el código actual del proyecto:

`C:\Users\M3402\Desktop\ARTIBusiness-Facturacion`

### Objetivo

Determinar qué hallazgos son bugs reales que debemos corregir, cuáles son mejoras opcionales, cuáles dependen del contexto y en cuáles se equivoca o exagera la auditoría por no conocer todas las decisiones del proyecto.

### Contexto obligatorio

- Estamos deliberadamente en un entorno demo conectado a servicios reales de Development/pruebas.
- La base de datos utilizada es de pruebas.
- Las operaciones fiscales y AEAT están configuradas para entornos de prueba, no para producción.
- Que un repositorio use HTTP real no es por sí mismo un bug.
- Sí sería un problema que alguna configuración pudiera alcanzar producción, que el entorno no fuese claramente identificable o que una demo pudiera realizar operaciones no previstas.
- La prioridad es conseguir una demo funcional, estable, usable, visualmente pulida y atractiva.
- No des por válidas las prioridades ni severidades de la auditoría sin comprobarlas.
- La auditoría se realizó sobre el commit `656d189737337cddbad4b67bd11f73370bba46c6`. Si el código actual está en otro commit, indica qué hallazgos han cambiado desde entonces.

### Restricciones obligatorias

- **SOLO REVISA.**
- **NO modifiques, crees, borres ni formatees ningún archivo.**
- No hagas commits, cherry-picks, merges, pushes ni cambios de rama.
- No llames a Azure, AEAT, FacturaE, Stripe, bases de datos ni otros servicios externos.
- No abras la aplicación de una forma que pueda ejecutar operaciones reales.
- Puedes inspeccionar código, configuración, historial y pruebas de forma local y de solo lectura.
- Antes de empezar, muestra rama, commit y `git status`.
- Si el worktree no está limpio o detectas otro proceso escribiendo en el proyecto, detente y avísame.
- No ejecutes build o tests si pueden generar archivos o hacer llamadas externas. En ese caso, indica qué ejecutarías y para qué.
- No instales dependencias.
- No implementes ninguna corrección.
- No muestres secretos, tokens, cadenas de conexión ni datos sensibles.

### Método de revisión

Revisa individualmente los hallazgos B01, G01–G05, M01–M08 y N01–N03.

Para cada uno indica:

1. **Veredicto:**
   - Confirmado.
   - Confirmado parcialmente.
   - Dependiente del contexto.
   - Riesgo probable no reproducido.
   - Incorrecto.
   - Ya corregido en el código actual.
2. **Evidencia exacta:** archivo, línea, comportamiento real y tests relacionados.
3. **Contexto que la auditoría no tuvo en cuenta.**
4. **Severidad que tú asignarías:** bloqueante, grave, media, menor, mejora opcional o no requiere cambio.
5. **Recomendación mínima**, sin implementarla.
6. **Prueba de regresión** que debería añadirse si se corrige.

### Comprobaciones especiales

- Confirma por configuración y código —sin realizar peticiones— que Development, la base de datos de pruebas y AEAT de pruebas no pueden confundirse con producción.
- Revisa especialmente G01: determina si un borrador local puede provocar realmente un `DELETE` HTTP y qué garantías existen frente a una colisión de identificadores.
- Revisa G02 y G03 teniendo en cuenta `IonicRouteStrategy`, la reutilización real de rutas y el ciclo de vida de Ionic/Angular.
- Distingue con claridad bugs confirmados, deducciones razonables y riesgos meramente teóricos.
- Si revisas los fallos de tests, contrasta primero si dependen del aislamiento artificial de red usado durante la auditoría.
- Comprueba los problemas responsive en ES, EN y UK por código y estilos. Señala qué requeriría un navegador o dispositivo real.
- Comprueba si la ausencia de paginación es una limitación contractual conocida del backend o un bug del frontend.
- Comprueba si el backend ya valida concepto, cantidades, precios y descuentos antes de decidir la prioridad de M05.
- Comprueba si “Subsanar” debe estar realmente prohibido para una factura simplificada F2 según el contrato actual.
- Ten en cuenta que el informe original decía por error “7 medios”, aunque enumera M01–M08. En este documento el resumen se ha corregido a **8 medios** sin alterar los hallazgos.

### Formato de respuesta requerido

1. Resumen ejecutivo.
2. Tabla de todos los hallazgos con veredicto y severidad revisada.
3. Bugs que sí corregirías antes de la demo, ordenados por prioridad.
4. Mejoras recomendables pero no imprescindibles.
5. Hallazgos incorrectos, exagerados o dependientes del contexto, con explicación.
6. Riesgos que requieren prueba manual o información adicional.
7. Propuesta de commits pequeños y separados, solo como planificación.
8. Confirmación de que no modificaste archivos y `git status` final.

No comiences a corregir nada al terminar el análisis. Espera mi confirmación y elegiremos expresamente qué cambios implementar.

---

# Auditoría que debes contrastar

## Conclusión ejecutiva original

**Resultado propuesto por la auditoría: NO APTO para una demo segura.**

La auditoría consideró como bloqueo principal que la aplicación se presenta como “Modo demo”, pero el módulo de Emitidas usa repositorios HTTP reales. Consultar, guardar, crear clientes, eliminar, contabilizar, firmar, anular o subsanar puede alcanzar Azure y, en determinadas acciones, FacturaE/AEAT.

Esta conclusión debe reevaluarse con el contexto indicado arriba: los servicios reales están conectados deliberadamente a entornos de Development y pruebas, incluida AEAT de pruebas.

Resumen de hallazgos, con el recuento editorial corregido:

- 1 bloqueante.
- 5 graves.
- 8 medios.
- 3 menores.
- TypeScript y build correctos en la revisión original.
- Suite completa inestable: 360/362 pruebas en la última ejecución aislada.
- Traducciones estructuralmente completas en ES/EN/UK.
- Responsive sin desbordamiento horizontal global, pero con problemas observados a 320 px.
- No se modificó ningún archivo fuente ni versionado durante la auditoría.
- `ng build` regeneró la salida ignorada habitual bajo `www/`.
- No se llamó a Azure, Stripe, AEAT ni a bases de datos: el navegador usado por la auditoría interceptó las peticiones localmente.

## Estado registrado durante la auditoría

| Comprobación | Resultado |
|---|---|
| Rama | `fix/estabilizacion-post-demo` |
| Commit | `656d189737337cddbad4b67bd11f73370bba46c6` |
| Mensaje | `fix(tests): DocumentoBancarioComponent esperaba la resolucion async de TranslocoPipe` |
| Worktree inicial | Limpio |
| Worktree final | Limpio |
| Proveedor de Emitidas | HTTP real |
| Backend configurado | Azure Development, también en `environment.prod.ts` |
| Alcance | Facturas emitidas, detalle, Ticket y subsanación |

---

## BLOQUEANTE — B01. “Modo demo” ejecuta operaciones reales

- **Archivos:** `src/app/core/providers/mock.providers.ts:41-63`, `src/main.ts:20`, `src/environments/environment.prod.ts:9`.
- **Evidencia:** `IssuedInvoicesRepository` se resuelve como `HttpIssuedInvoicesRepository`; los comentarios afirman que listar, guardar, eliminar, duplicar, contabilizar y firmar usan backend real. Clientes también usa HTTP y `crearAdHoc()` llama a `/api/Clientes/Crear`.
- **Reproducción empleada:** abrir `/app/emitidas?estado=borrador` con sesión simulada. La pantalla intentó llamar a `FacturaEmitida/Numeradores`, `FacturaEmitida/Enumerar` y `MediosPago/Enumerar`; las llamadas fueron interceptadas localmente.
- **Actual según la auditoría:** banner “Modo demo: entorno de pruebas”, con comportamiento HTTP real.
- **Esperado propuesto:** modo demo completamente simulado o aviso inequívoco con acciones fiscales/destructivas bloqueadas.
- **Impacto propuesto:** modificación de datos, reserva de números fiscales, creación de clientes y posibles envíos a FacturaE/AEAT.
- **Corrección propuesta:** proveedores separados por entorno y guard central para operaciones externas.
- **Regresión propuesta:** comprobar que ningún proveedor demo depende de `ApiService` y recorrer acciones con red bloqueada.
- **Contexto a contrastar:** el uso de Development, datos de prueba y AEAT de pruebas es deliberado. Debe decidirse si esto elimina el hallazgo, reduce su severidad o solo exige mejores salvaguardas frente a producción.

## GRAVE — G01. Eliminar un borrador local desde el detalle intenta primero un DELETE real

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.ts:668-686`, `src/app/core/adapters/http/issued-invoices.repository.http.ts:596-613`.
- **Evidencia:** el detalle llama a `invoicesRepo.eliminar(f.id)`. El adaptador ejecuta `DELETE /api/FacturaEmitida/{id}` y solo cae al almacén local si recibe 404. La lista distingue `esBorradorLocal` y usa `descartarLocal()`.
- **Reproducción propuesta:** crear un borrador local, abrir su detalle y pulsar Eliminar.
- **Actual:** se intenta borrar en backend un identificador generado localmente.
- **Esperado:** si `esBorradorLocal`, descartar únicamente en memoria.
- **Impacto propuesto:** petición destructiva innecesaria y posible colisión con un identificador real.
- **Corrección mínima propuesta:** replicar en el detalle la comprobación utilizada por la lista.
- **Regresión:** exigir `descartarLocal(id)` y verificar que `eliminar()` no se invoca.

## GRAVE — G02. Guardar una factura nueva deja la URL en `/nueva`

- **Archivo:** `src/app/pages/factura-detalle/factura-detalle.page.ts:372-401`.
- **Evidencia:** tras guardar se actualizan `working` y `facturaId`, pero no se reemplaza la ruta.
- **Reproducción propuesta:** crear una factura o Ticket, guardar y recargar el navegador.
- **Actual propuesto:** la vista tiene la factura guardada, pero la URL continúa como `/app/emitidas/nueva`; una recarga inicia otra creación.
- **Esperado:** reemplazar la URL por `/app/emitidas/{idReal}` después del primer guardado.
- **Impacto:** pérdida aparente de contexto, duplicados accidentales y URL incorrecta.
- **Corrección mínima:** navegación con `replaceUrl` tras el primer guardado exitoso.
- **Regresión:** verificar ID/URL y recargar.

## GRAVE — G03. Duplicar desde el detalle puede conservar la factura original bajo la URL de la copia

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.ts:115-129`, `src/app/pages/factura-detalle/factura-detalle.page.ts:582-590`, `src/main.ts:16`.
- **Evidencia:** el ID se lee una vez desde `route.snapshot` en `ngOnInit`. Duplicar navega a otra URL con la misma configuración `emitidas/:id`; la app usa `IonicRouteStrategy`.
- **Estado del hallazgo:** riesgo probable, no reproducción concluyente en la auditoría.
- **Actual probable:** la URL cambia a la copia, mientras `working` todavía contiene el original.
- **Esperado:** cargar la copia o actualizar el estado local de forma atómica.
- **Impacto propuesto:** editar o actuar sobre una factura distinta de la indicada en la URL.
- **Corrección propuesta:** observar `paramMap` o asignar la copia antes de reemplazar la ruta.
- **Regresión:** duplicar sobre un componente reutilizado y comprobar ID, número y contenido.

## GRAVE — G04. Los cambios sin guardar se pierden sin confirmación

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.ts:724-727`, `src/app/pages/factura-detalle/factura-detalle.page.html:4`.
- **Evidencia:** `volver()` navega directamente. No se encontró `CanDeactivate`, comparación con snapshot guardado ni `beforeunload`.
- **Reproducción:** editar concepto o líneas y usar Volver, tabs o atrás del navegador.
- **Actual:** descarte silencioso de los cambios locales.
- **Esperado propuesto:** alerta “Salir sin guardar” o persistencia explícita.
- **Impacto:** pérdida de trabajo del usuario.
- **Corrección propuesta:** estado `dirty` y protección uniforme de navegación.
- **Regresión:** navegación con y sin cambios, incluida la navegación del navegador o dispositivo.

## GRAVE — G05. Una URL directa permite intentar subsanar un Ticket F2

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.ts:537-574`, `src/app/pages/factura-subsanar/factura-subsanar.page.ts:60-98`.
- **Evidencia:** el detalle oculta Subsanar cuando `esSimplificada`; la página de subsanación solo comprueba que no sea borrador ni esté anulada.
- **Reproducción propuesta:** navegar directamente a `/app/emitidas/{idTicketContabilizado}/subsanar`.
- **Actual propuesto:** se carga la previsualización y la acción puede llegar a habilitarse.
- **Esperado propuesto:** rechazo local y retorno al detalle.
- **Impacto:** flujo fiscal no soportado y petición evitable al backend.
- **Corrección propuesta:** compartir una única política `puedeSubsanar` que contemple `!esSimplificada`.
- **Regresión:** acceso mediante botón y URL directa para factura completa y F2.
- **Contexto a contrastar:** confirmar primero el contrato fiscal y de backend vigente para F2.

## MEDIO — M01. Una carga fallida conserva datos anteriores bajo la pestaña nueva

- **Archivo:** `src/app/pages/facturas-emitidas/facturas-emitidas.page.ts:127-143`.
- **Evidencia:** existe protección frente a respuestas fuera de orden; en el `catch` se muestra un toast, pero no se vacía ni marca como obsoleta la lista anterior.
- **Reproducción propuesta:** cargar Borradores correctamente y provocar un fallo al cambiar a Contabilizadas.
- **Actual:** podrían verse borradores bajo la pestaña Contabilizadas.
- **Esperado:** estado de error propio, sin resultados de otro filtro, y opción Reintentar.
- **Corrección propuesta:** asociar resultados al filtro o limpiar la lista al iniciar/capturar el error.
- **Regresión:** éxito, cambio de pestaña, error y carrera entre cargas.

## MEDIO — M02. El listado se limita silenciosamente a 50 facturas

- **Archivo:** `src/app/core/adapters/http/issued-invoices.repository.http.ts:453-467`.
- **Evidencia:** se envía `top: 50` y se aplica `slice(0, 50)`. Búsqueda y fechas filtran ese conjunto ya limitado.
- **Actual:** no hay paginación, carga incremental ni aviso de truncado.
- **Esperado propuesto:** paginación real o indicación de resultados parciales.
- **Impacto:** facturas posteriores podrían parecer inexistentes.
- **Corrección propuesta:** paginación/cursor; mientras no exista, mostrar el límite.
- **Regresión:** conjunto de 51 facturas y búsqueda de la número 51.
- **Contexto a contrastar:** revisar si el endpoint soporta paginación y el volumen previsto de la demo.

## MEDIO — M03. Carrera al iniciar un Ticket antes de cargar la serie FS real

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.ts:115-124`, `src/app/pages/factura-detalle/factura-detalle.page.ts:159-197`, `src/app/pages/factura-detalle/factura-detalle.page.ts:315-328`.
- **Evidencia:** se preselecciona el primer numerador disponible antes de esperar el catálogo HTTP; el bloqueo `serieSimplificadaNoConfigurada` se calcula después.
- **Reproducción propuesta:** abrir Nuevo Ticket con catálogo lento y continuar inmediatamente.
- **Actual propuesto:** podría nacer un Ticket usando temporalmente un numerador que no sea FS.
- **Esperado:** bloquear el paso inicial hasta resolver la serie FS.
- **Impacto:** error posterior o numeración incorrecta.
- **Corrección propuesta:** estado `cargandoCatalogos` y ausencia de fallback de numerador para F2.
- **Regresión:** catálogo lento, catálogo sin FS, catálogo con FS y fallo de catálogo.

## MEDIO — M04. Estados asíncronos y bloqueo de doble acción incompletos

- **Archivos:** `src/app/pages/facturas-emitidas/facturas-emitidas.page.ts:257-377`, `src/app/pages/factura-detalle/factura-detalle.page.ts:63-80`, `src/app/pages/factura-detalle/factura-detalle.page.html:244-309`.
- **Evidencia:** duplicar, descargar, compartir y eliminar no tienen bandera propia. `algoEnCurso` no incluye guardar, enviar correo ni acciones secundarias. En la lista, contabilizar/firmar cambia el texto, pero no muestra un spinner real.
- **Actual propuesto:** se pueden abrir diálogos repetidos o solapar operaciones no cubiertas por la misma exclusión mutua.
- **Esperado:** bloqueo por factura y spinner exacto de cada acción.
- **Impacto:** llamadas repetidas, toasts superpuestos o navegación tardía.
- **Corrección propuesta:** estado de operación discriminado y `try/finally` para acciones asíncronas relevantes.
- **Regresión:** doble clic y acciones cruzadas con promesas controladas.

## MEDIO — M05. Validación insuficiente de concepto e importes

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.html:145`, `src/app/shared/lineas-editor/lineas-editor.component.html:16-25`, `src/app/shared/lineas-editor/lineas-editor.component.ts:143-150`, `src/app/core/adapters/http/issued-invoices.repository.http.ts:520-550`.
- **Evidencia:** concepto sin `required`; cantidad, precio y descuento sin límites HTML visibles. El cálculo acepta valores numéricos negativos o descuentos superiores al 100 %. El adaptador valida cliente, forma de pago y presencia de líneas.
- **Actual propuesto:** se puede guardar un borrador incoherente y descubrir el rechazo más tarde.
- **Esperado:** validación inmediata junto a cada campo.
- **Corrección propuesta:** concepto obligatorio, cantidad positiva, precio no negativo y descuento 0–100.
- **Regresión:** límites, decimales, cero, negativos y Ticket de 400/400,01 €.
- **Contexto a contrastar:** confirmar las validaciones reales del backend y si guardar borradores incompletos es una decisión deliberada.

## MEDIO — M06. Cargas de detalle y subsanación sin indicador visible

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.ts:63`, `src/app/pages/factura-detalle/factura-detalle.page.html:12-20`, `src/app/pages/factura-subsanar/factura-subsanar.page.ts:44-92`, `src/app/pages/factura-subsanar/factura-subsanar.page.html:12-18`.
- **Evidencia:** existe `cargando`, pero no se renderiza spinner o skeleton general. En Subsanar, el botón de confirmación cambia de texto, pero no usa `ion-spinner`.
- **Actual:** contenido vacío o incompleto mientras espera.
- **Esperado:** estados loading/error/content claros y reintento ante error.
- **Impacto:** percepción de bloqueo y repetición de acciones.
- **Corrección propuesta:** presentación mutuamente exclusiva de loading, error y contenido.
- **Regresión:** promesa pendiente, error y reintento exitoso.

## MEDIO — M07. Estados internos poco claros en la lista

- **Archivos:** `src/app/pages/facturas-emitidas/facturas-emitidas.page.ts:221-230`, `src/app/pages/facturas-emitidas/facturas-emitidas.page.html:76-86`.
- **Evidencia:** Borradores muestra “Borrador”, pero Contabilizadas y Firmadas muestran el estado AEAT en la misma posición en vez del estado interno.
- **Actual:** una factura firmada puede mostrar únicamente “Correcto”, “Pendiente de envío” o `—`.
- **Esperado propuesto:** badge interno y badge AEAT independientes.
- **Impacto:** dificultad para distinguir la fase funcional de la situación fiscal.
- **Corrección propuesta:** dos indicadores separados.
- **Regresión:** combinaciones de estado interno y estado AEAT.

## MEDIO — M08. Problemas responsive observados a 320 px

- **Archivos:** `src/app/pages/facturas-emitidas/facturas-emitidas.page.html:19-29`, `src/app/pages/facturas-emitidas/facturas-emitidas.page.scss:103-150`, `src/app/pages/factura-detalle/factura-detalle.page.scss:99-106`.
- **Evidencia visual de la auditoría:** en español se observaron pestañas como `BORRA… / CONTA… / FIRMA…`; en ucraniano las tres quedaron truncadas. El placeholder de búsqueda también se cortó. En 320×568 el footer del detalle ocupó una parte considerable de la altura. En algunas capturas EN/UK, footer y navegación inferior aparecieron recortados o solapados.
- **Condiciones:** Chrome headless, fixtures locales y peticiones interceptadas. No fue una prueba en dispositivo nativo.
- **Actual:** no se observó overflow horizontal global, pero sí pérdida de texto y espacio vertical.
- **Esperado:** etiquetas comprensibles y footer compacto en pantallas pequeñas.
- **Corrección propuesta:** tabs adaptables/desplazables, footer más compacto y safe area explícita.
- **Regresión:** snapshots ES/EN/UK en 320×568 y comprobación geométrica de footer/tab bar.

## MENOR — N01. Botones de volver sin nombre accesible explícito

- **Archivos:** `src/app/pages/factura-detalle/factura-detalle.page.html:4-6`, `src/app/pages/factura-subsanar/factura-subsanar.page.html:4-6`.
- **Evidencia:** botones con icono `arrow-back-outline` sin `aria-label` explícito.
- **Corrección propuesta:** etiqueta traducida “Volver”.
- **Regresión:** consultar el nombre accesible resultante, teniendo en cuenta el comportamiento propio de Ionic.
- **Nota positiva:** las acciones secundarias incluyen etiquetas ARIA y áreas táctiles de 44×44 px.

## MENOR — N02. Fallbacks españoles fuera de i18n

- **Archivo:** `src/app/core/adapters/http/issued-invoices.repository.http.ts:251-260`, `src/app/core/adapters/http/issued-invoices.repository.http.ts:339-407`.
- **Evidencia:** fallbacks como `Medio de pago {id}` y `Cliente no disponible` están escritos en español dentro del adaptador.
- **Impacto:** mezcla de idiomas cuando faltan datos o catálogos.
- **Corrección propuesta:** devolver un valor neutro/código y traducir en presentación.
- **Regresión:** datos incompletos con idioma EN y UK.

## MENOR — N03. Los tests de la lista no aíslan explícitamente el repositorio HTTP

- **Archivo:** `src/app/pages/facturas-emitidas/facturas-emitidas.page.spec.ts:24-31`, `src/app/pages/facturas-emitidas/facturas-emitidas.page.spec.ts:91-124`.
- **Evidencia:** el spec incluye `MOCK_REPOSITORY_PROVIDERS`, que actualmente resuelve Emitidas mediante el adaptador HTTP. Los handlers de eliminación llaman después a `refresh()`.
- **Resultado observado durante la auditoría:** los tests de eliminación agotaron el timeout en algunas ejecuciones conjuntas, aunque el spec aislado terminó 10/10.
- **Corrección propuesta:** proporcionar un spy explícito de `IssuedInvoicesRepository` y traducciones completas del componente.
- **Regresión:** ejecutar el spec con red deshabilitada.
- **Contexto a contrastar:** reproducir con el runner normal antes de atribuir el timeout al test; el aislamiento artificial de red de la auditoría pudo afectar al resultado.

---

# Matriz funcional observada

| Flujo | Resultado de la auditoría |
|---|---|
| Lista Borradores / Contabilizadas / Firmadas | Funciona estructuralmente; respuestas antiguas protegidas |
| Buscar por cliente/concepto | Funciona sobre los datos cargados; límite de 50 |
| Filtro de serie y fechas | Funciona; búsqueda/serie/fechas no se codifican completamente en URL |
| Estado vacío | Presente y traducido |
| Error de carga | Toast presente; posible conservación de resultados obsoletos |
| Actualización manual/pull-to-refresh | Ausente |
| Nueva factura completa | Selección, búsqueda y creación de cliente implementadas; creación conectada a Development |
| Nuevo Ticket F2 | Cliente genérico sin NIF ficticio y límite visual de 400 € |
| Convertir Ticket local a completa | Si se cancela el selector, revisar si el cambio parcial se revierte |
| Guardar borrador | Spinner y bloqueo propios; revisar URL tras primer guardado |
| Marcar cobrado | Mensaje “Pagado — pendiente de contabilizar” correcto |
| Marcar cobrado antes de guardar | El botón puede aparecer antes de persistir el borrador |
| Contabilizar | Confirmación, spinner y `finally`; operación real contra pruebas |
| Firmar factura completa | Disponible tras contabilizar; operación real contra pruebas |
| Firmar Ticket F2 | Oculto |
| Subsanar factura completa | Pantalla dedicada |
| Subsanar Ticket F2 | Oculto en detalle; revisar acceso directo |
| Anular | Disponible tras contabilizar/firmar, incluido F2 según UI |
| Duplicar | Correcto desde lista; riesgo de reutilización de ruta desde detalle |
| Descargar/compartir | Política por estado; sin bandera propia contra doble clic |
| Eliminar borrador pagado | Oculto por política |
| Stripe Connect | No aparece “Cobrar con tarjeta”; `TARJETA` es un medio manual |
| Volver sin guardar | Sin confirmación observada |
| Reiniciar app | Los borradores puramente locales viven en memoria |

---

# Estados asíncronos observados

| Acción | Spinner | Protección observada | `finally` | Mensajes |
|---|---:|---|---:|---|
| Cargar lista | Sí | Descarta respuesta antigua | Sí | Error por toast |
| Cargar detalle | No visible | N/A | Sí | Error inline |
| Cargar subsanación | No visible | N/A | Sí | Error inline |
| Guardar | Sí | Misma acción | Sí | Éxito/error |
| Contabilizar detalle | Sí | Acciones fiscales | Sí | Éxito/error |
| Firmar detalle | Sí | Acciones fiscales | Sí | Éxito/error |
| Cobrar | Sí | Acciones fiscales | Sí | Éxito/error |
| Anular | Sí | Acciones fiscales | Sí | Éxito/error |
| Enviar correo | Sí | Solo correo | Sí | Éxito/error |
| Subsanar | Cambia texto | Misma acción | Sí | Éxito/error |
| Contabilizar/firmar lista | Sin spinner real | Por ID | Sí | Éxito/error |
| Duplicar | No | No específica | No aplica | Éxito/error |
| Descargar/compartir | No | No específica | No aplica | Descarga con toast; compartir solo error |
| Eliminar | No | No específica | No aplica | Confirmación y resultado |

El guardado automático anterior a contabilizar suprime deliberadamente el toast intermedio, lo que la auditoría consideró correcto.

---

# Validaciones técnicas registradas

| Comando o comprobación | Resultado original |
|---|---|
| `npx.cmd tsc --noEmit -p tsconfig.app.json` | Correcto |
| `npm.cmd run build` | Correcto |
| `npm.cmd run lint -- --no-fix` | 1 error |
| Pruebas seleccionadas de Emitidas | 77/78 juntas; spec de lista aislado 10/10 |
| Suite completa con red bloqueada | 360/362; otra ejecución 359/362 |
| Paridad i18n | Correcta |
| Git final | Limpio |

Error de lint detectado, fuera del alcance de Emitidas:

- `src/app/modals/documento-bancario/documento-bancario.component.ts:161`: uso de `!=` donde la regla exige `!==`.
- Los dos fallos conocidos de `DocumentoBancarioComponent` mencionados en el encargo original no se reprodujeron sobre el commit auditado.
- El error de lint es distinto de aquellos dos fallos.

Pruebas seleccionadas contabilizadas:

- Lista Emitidas: 10.
- Detalle: 30.
- Adaptador HTTP: 23.
- Editor de líneas: 9.
- Compartir documento: 6.
- Total: 78.

Cobertura que la auditoría consideró ausente:

- No se encontró spec para `factura-subsanar`.
- No se encontró prueba de URL después del primer guardado.
- No se encontró prueba de duplicación con reutilización de ruta.
- No se encontró prueba de salida con cambios sin guardar.
- No se encontró prueba responsive automatizada.
- No se encontró prueba que defina expresamente qué conexiones puede realizar el modo demo.

El build avisó de que `facturas-emitidas.page.scss` superaba el presupuesto SCSS en 154 bytes.

---

# Responsive e i18n registrados

La auditoría usó fixtures deterministas y peticiones interceptadas:

| Tamaño | Resultado observado |
|---|---|
| 320×568 | Tabs ES/UK truncadas, búsqueda cortada y footer muy voluminoso; posible colisión con tab bar |
| 360×800 | Sin overflow global; footer todavía voluminoso |
| 390×844 | Sin overflow global; contenido legible |
| 768×1024 | Funcional, sin adaptación específica a tablet |
| 1366×768 | Funcional; contenido muy extendido sin ancho máximo |

Auditoría de claves registrada:

- `es.json`: 519 claves.
- `en.json`: 519 claves.
- `uk.json`: 519 claves.
- 0 claves ausentes entre idiomas.
- 0 claves adicionales.
- 0 valores vacíos.
- Interpolaciones equivalentes en Emitidas/VERI*FACTU.
- Claves dinámicas de medios de cobro presentes en los tres idiomas.
- `<html lang>` actualizado a `en` y `uk` en las pruebas visuales.

Pendiente de dispositivo nativo real:

- Safe area inferior de iOS.
- Botón físico Atrás en Android.
- Share sheet nativa.
- Descarga y permisos de archivos.
- Persistencia tras matar y reabrir la aplicación.

---

# Propuesta original de separación en commits

Esta lista es únicamente una propuesta de planificación. No ejecutes ninguno:

1. `fix(demo): reforzar separación y avisos de los entornos de prueba`
2. `fix(emitidas): descartar borradores locales sin DELETE HTTP`
3. `fix(emitidas): reemplazar URL tras guardar y recargar cambios de id`
4. `fix(emitidas): proteger salida con cambios sin guardar`
5. `fix(verifactu): aplicar una política única de subsanación F2`
6. `fix(emitidas): unificar estado async y bloqueo de acciones`
7. `fix(emitidas): mejorar estados de error, reintento y límite del listado`
8. `fix(emitidas): validar concepto e importes de líneas`
9. `fix(ui): adaptar tabs y footer a 320px en ES EN UK`
10. `test(emitidas): aislar repositorios HTTP y cubrir navegación`
11. `fix(a11y-i18n): etiquetas de volver y fallbacks traducibles`

Claude debe revisar y repriorizar esta lista; no debe asumir que el primer commit ni el aislamiento completo del backend sean necesarios dado el contexto de Development/pruebas.
