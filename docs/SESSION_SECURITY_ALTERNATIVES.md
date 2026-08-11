# Alternativas seguras a `saved_password` — solo documentación, sin cambios de código

Este documento no modifica comportamiento. Registra el problema real, dónde vive en el
código hoy, y las alternativas seguras a evaluar antes de tocarlo — porque hoy alimenta dos
funciones ya construidas y en uso (login biométrico y reenvío de MFA), y retirarlo sin
sustituto rompe ambas.

## El problema, con ubicación exacta

`src/app/pages/login/login.page.ts`:
- Al hacer login correctamente, guarda usuario y **contraseña en texto plano** en Capacitor
  Preferences (`SAVED_USERNAME_KEY`, `SAVED_PASSWORD_KEY`) — líneas 146-147 (`doLogin()`).
- Al arrancar la pantalla (`ngOnInit`), si hay biometría disponible, recupera esa contraseña
  guardada y la reenvía automáticamente contra `/api/Employees/authenticate` para "iniciar
  sesión con Face ID" (`loginWithBiometrics()`, línea 96) — en realidad no hay verificación
  biométrica del lado del servidor, es solo un gate local (Face ID) delante de un login
  automático con la contraseña guardada.

`src/app/services/auth.service.ts`:
- `resendMfaCode()` (línea ~217) recupera esa misma contraseña guardada de Preferences para
  volver a llamar a `/api/Employees/authenticate` y así regenerar/reenviar el código MFA —
  no existe un endpoint dedicado de "reenviar código" que no necesite la contraseña.

Capacitor Preferences en Android/iOS usa almacenamiento nativo (SharedPreferences /
NSUserDefaults) que **no está cifrado por defecto** — es el equivalente a guardar la
contraseña en un fichero de texto plano accesible por otras apps con root/jailbreak, o
recuperable en un backup no cifrado del dispositivo.

## Alternativa 1 — Refresh token revocable en Keychain/Keystore, desbloqueado por biometría

En vez de guardar la contraseña, guardar un **refresh token** (o token de larga duración)
emitido por el servidor tras el primer login, protegido por el almacenamiento seguro nativo
(`Keychain` en iOS, `Keystore` en Android — no Preferences). La biometría desbloquea el
acceso a ese token, no reintroduce ninguna contraseña.

- **Ventaja**: el servidor puede revocar el token en cualquier momento (cambio de
  contraseña, dispositivo perdido, baja de usuario) sin que la contraseña real haya estado
  nunca expuesta en el dispositivo.
- **Requiere del backend**: que `/api/Employees/authenticate` (o su equivalente en `Users`,
  ver `docs/SERVICE_CONTRACT_GAPS.md` #1-2) devuelva un refresh token con su propia
  expiración/revocación, distinto del token de sesión corto que ya devuelve hoy.
- **Requiere del cliente**: sustituir Capacitor Preferences por un plugin de almacenamiento
  seguro nativo (p. ej. `@capacitor/preferences` no vale para esto — haría falta algo como
  `capacitor-secure-storage-plugin` o equivalente respaldado por Keychain/Keystore).

## Alternativa 2 — Endpoint de reenvío de MFA con el challenge activo

Sustituir `resendMfaCode()` por una llamada que reenvíe usando **el `challengeId` ya
emitido** en el primer intento de login, sin volver a autenticar con usuario/contraseña.
Es exactamente el patrón que ya sigue `verifyMfaCode()` (usa `challengeId` + código, nunca la
contraseña) — `resendMfaCode` es la única función del flujo MFA que todavía depende de tener
la contraseña guardada.

- **Requiere del backend**: un endpoint tipo `POST /api/Users/mfa/resend` (nombre a
  confirmar) que acepte `challengeId` y regenere/reenvíe el código sin pedir credenciales de
  nuevo.
- Si no existe y no se va a construir, la alternativa mínima es no ofrecer "reenviar código"
  y en su lugar obligar a volver a la pantalla de login si el código caduca — peor UX, pero
  sin guardar nada sensible.

## Qué falta confirmar antes de tocar código (añadido a `docs/SERVICE_CONTRACT_GAPS.md`)

- ¿El backend real de `Users` puede emitir un refresh token independiente del token de
  sesión?
- ¿Existe o se puede construir un endpoint de reenvío de MFA basado en `challengeId`?
- Decisión de producto: si ninguna de las dos existe a corto plazo, ¿se acepta
  temporalmente pedir la contraseña de nuevo cada vez que la sesión expira (sin guardarla en
  ningún sitio), sacrificando el login biométrico hasta que el backend lo soporte?

## No se ha tocado

`saved_password`, el login biométrico y `resendMfaCode()` siguen exactamente igual que
antes de este documento — funcionan en el MVP desplegado, tal como se pidió conservar.
