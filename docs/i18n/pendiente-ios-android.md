# Android e iOS — estado y pendientes de este barrido de i18n

## Android — revisado, sin cambios necesarios

Único fichero de recursos nativos encontrado: `android/app/src/main/res/values/strings.xml`.
Contenido completo revisado:

```xml
<string name="app_name">ARTIBusiness Facturación</string>
<string name="title_activity_main">ARTIBusiness Facturación</string>
<string name="package_name">com.artisoftware.artibusinessfacturacion</string>
<string name="custom_url_scheme">com.artisoftware.artibusinessfacturacion</string>
```

- `app_name` / `title_activity_main`: nombre de marca — se muestra en el launcher y en el
  selector de apps recientes de Android. Un nombre de marca no se traduce (mismo criterio que
  el resto de la app: "no traduzcas nombres"), así que se mantiene igual en `values-en/` y
  `values-uk/` si algún día se crean — no hace falta crearlos solo por esto.
- `package_name` / `custom_url_scheme`: identificadores técnicos (id de paquete, esquema de
  URL personalizado) — nunca se localizan, en ningún idioma.
- No hay ningún otro string nativo (no hay diálogos de permisos personalizados, ni
  `AndroidManifest.xml` con `android:label`/`android:description` en texto libre más allá de
  estas referencias, ni ningún otro `res/values*/strings.xml` en el proyecto).

**Conclusión**: no se han creado `values-en/strings.xml` ni `values-uk/strings.xml` porque no
hay ningún string nativo real que traducir — hacerlo habría significado duplicar el nombre de
marca sin necesidad o inventar contenido que no existe, en contra de lo pedido explícitamente
("no inventes permisos ni textos inexistentes"). Si en el futuro se añade un string nativo
real (por ejemplo, un texto de notificación push generado fuera de Angular, o una razón de
permiso runtime personalizada vía un plugin nativo), es entonces cuando corresponde crear las
carpetas `values-en/` y `values-uk/`.

## iOS — no existe todavía en este repositorio

Confirmado (igual que en la auditoría de Fase 1): no existe carpeta `ios/` en este proyecto —
`npx cap add ios` no se ha ejecutado nunca aquí. No se ha generado en este barrido, conforme a
lo pedido explícitamente.

### Qué habrá que localizar en cuanto se añada `ios/`

1. **`ios/App/App/Info.plist`**:
   - `CFBundleDisplayName` (nombre mostrado bajo el icono) — igual que en Android, es el
     nombre de marca "ARTIBusiness Facturación": no se traduce, pero sí puede necesitar
     `InfoPlist.strings` por locale si Apple exige el mismo nombre en las tres fichas de
     tienda pero se decide dar variantes — a confirmar con negocio, no es una decisión técnica.
   - Cualquier `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` que Capacitor añada
     automáticamente al generar el proyecto (la app ya usa cámara/adjuntar documento en
     Facturas Recibidas — ver `facturas-recibidas.page.ts`, `triggerCamera()`/
     `triggerUpload()`) — estos SÍ son textos que el usuario ve en el diálogo de permiso
     nativo de iOS, y si existen habrá que traducirlos a en/uk mediante
     `ios/App/App/es.lproj/InfoPlist.strings`, `en.lproj/InfoPlist.strings`,
     `uk.lproj/InfoPlist.strings`. No se puede escribir el texto exacto ahora porque no existe
     el proyecto iOS todavía — lo generará Capacitor al ejecutar `npx cap add ios`, y en ese
     momento habrá que auditar qué claves de uso de permisos aparecen realmente (dependen de
     los plugins instalados: cámara para adjuntar documentos, y `@aparajita/capacitor-biometric-auth`
     para Face ID, que en iOS requiere `NSFaceIDUsageDescription`).
   - `CFBundleLocalizations` — declarar `es`, `en`, `uk` como idiomas soportados.

2. **`ios/App/App/es.lproj/`, `en.lproj/`, `uk.lproj/`**: carpetas de recursos localizados que
   Xcode espera — no existen todavía porque no existe `ios/`.

3. **`PrivacyInfo.xcprivacy`** (manifiesto de privacidad, obligatorio por Apple desde 2024 para
   cualquier app que use ciertas "required reason APIs" y para declarar el uso de datos):
   - **Por qué aplica aquí**: `@capacitor/preferences` (usado por `LanguageService` para
     guardar el idioma elegido, y ya usado antes por `auth.service.ts` para
     `manual_logout`/credenciales guardadas) internamente usa `UserDefaults` en iOS, que es
     una de las APIs "de razón requerida" de Apple — cualquier app que lo use debe declarar en
     `PrivacyInfo.xcprivacy` el motivo de uso (`NSPrivacyAccessedAPICategoryUserDefaults` con
     el código de razón correspondiente, típicamente `CA92.1` para preferencias/ajustes propios
     de la app, no compartidos entre apps).
   - **Esto NO es un texto traducible** — `PrivacyInfo.xcprivacy` es un plist de
     declaraciones estructuradas (categorías de API, razones, tipos de datos recopilados), no
     contiene cadenas de idioma para el usuario final. Se documenta aquí porque es un
     entregable pendiente directamente ligado a por qué existe `LanguageService`
     (Preferences), no porque haya que traducirlo.
   - **Acción pendiente cuando se cree `ios/`**: añadir `ios/App/App/PrivacyInfo.xcprivacy`
     declarando como mínimo el uso de `UserDefaults` (por `@capacitor/preferences`) — y revisar
     si el resto de plugins ya instalados (`@aparajita/capacitor-biometric-auth`,
     `@capacitor/filesystem`, `@capacitor/share`) exigen declaraciones adicionales propias,
     cosa que corresponde auditar en el momento de generar el proyecto iOS, no ahora sin el
     proyecto delante.

### Resumen de la decisión tomada en este barrido

No se ha generado `ios/` ni se ha inventado el contenido de `Info.plist`/`PrivacyInfo.xcprivacy`
por adelantado — habría sido contenido especulativo no verificable. Este documento dejará
constancia de qué localizar y por qué en cuanto `npx cap add ios` se ejecute de verdad.

## Mensajes en español del backend que conviene convertir en códigos estables

Detectados durante el barrido — el frontend hoy identifica ciertos casos comparando el TEXTO
literal en español que devuelve el backend (frágil: si el backend cambia una coma o una
palabra, el frontend deja de reconocer el caso). Documentado aquí, no modificado (fuera de
alcance: "no modifiques el backend" en esta tarea):

- `facturas-recibidas.page.ts`, método `motivoBorradorLocal()`: usa expresiones regulares
  contra el mensaje de error real del backend para distinguir 3 causas de rechazo de OCR:
  - `/no existe ningún proveedor con nif/i`
  - `/no trae un nif de proveedor legible/i`
  - `/no trae un número de factura legible/i`

  Si el backend expusiera un código de error estable (p. ej. `SUPPLIER_NOT_FOUND`,
  `NIF_UNREADABLE`, `INVOICE_NUMBER_UNREADABLE`) en vez de solo el texto en español, el
  frontend podría dejar de depender de que el texto exacto no cambie nunca, y además ese
  código sería la base real para traducir el mensaje sin adivinar por regex.

Estos 3 mensajes de backend en sí NO se han tocado ni traducido (siguen viajando en español
desde el backend, tal cual los genera) — la app solo traduce el texto ALREDEDOR de ellos
(ver `ocr.supplierNotFoundDraft`/`nifUnreadableDraft`/`numberUnreadableDraft` en
`src/assets/i18n/*.json`), nunca el mensaje técnico original, conforme a lo pedido.
