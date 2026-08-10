# ARTIBusiness Facturación — Móvil

Aplicación móvil multiempresa (multi-tenant) de control de facturación para clientes de
ARTIBusiness. Desarrollada con Ionic + Angular + Capacitor.

Este proyecto nace del reciclaje de una app de Fichajes ya funcional del mismo ecosistema:
se reutiliza toda la infraestructura (multi-tenant, autenticación, cliente HTTP) y se
sustituyen las pantallas de negocio por las de Facturación. El contexto completo del dominio
está en `CONTEXTO_FACTURACION.md`.

---

## Arquitectura multi-tenant

Cada empresa tiene una **clave de acceso** que se resuelve contra una API de configuración
centralizada. Con esa clave se obtienen la URL base de la API y los identificadores de
empresa y centro.

```
POST https://configurationapidispatcher-h2g0g4amcgdmaddh.westeurope-01.azurewebsites.net/api/configuration
{ "clave": "arti01" }

→ { "idEmpresa": 9, "idCentro": 1, "url": "https://api.artisoftware.com" }
```

Todas las llamadas posteriores van contra `url` con `Authorization: Bearer <token>`.

---

## 1. Configuración inicial (Setup)

La app pide la clave de empresa al primer arranque. Se guarda en Capacitor Preferences y se
cachea la configuración resultante.

- Si el usuario no tiene clave puede acceder a la web de alta desde el enlace **"Obtener
  clave"** de la pantalla de setup.
- Desde la pantalla de login hay un enlace **"Cambiar clave de acceso"** que limpia la
  configuración y lleva de vuelta al setup.

---

## 2. Autenticación (reutilizada de la app de Fichajes)

### 2.1 Login

```
POST /api/Employees/authenticate
{ "Company": 9, "BusinessUnit": 1, "username": "usuario", "password": "1234" }
```

Respuesta **sin MFA**: `{ token, expiration, userFirstName, userLastName, userEmail,
userPhone, employeeId, userCompany }`.

Respuesta **con MFA**: `{ acceso: "mfa", challengeId, maskedEmail }` — la app redirige
automáticamente a la pantalla de verificación.

### 2.2 Verificar código MFA

```
POST /api/Employees/authenticatemfa
{ "Company": 9, "BusinessUnit": 1, "username": "usuario", "ValidationCode": "123456" }
```

### 2.3 Olvidé mi contraseña

```
POST /api/Employees/forgot
{ "Company": 9, "username": "usuario" }
```

### Sesión

El token y los datos de usuario se guardan en `localStorage`. La sesión expira a las 24
horas; al expirar se borra automáticamente y se redirige al login.

> Pendiente de confirmar con el equipo backend: si los usuarios de Facturación se autentican
> contra este mismo endpoint de `Employees` o si hace falta uno específico para este dominio.

---

## 3. Facturación (en construcción)

Estado actual: **solo estructura de navegación y UI placeholder**, sin conexión a backend —
los endpoints necesarios no existen todavía (ver `CONTEXTO_FACTURACION.md`, sección 3, para
la lista completa que hay que pedir al equipo backend).

- **Facturas emitidas** (`/app/emitidas`): segmentos Borradores / Contabilizadas / Firmadas +
  selector de numerador/serie (placeholder, deshabilitado).
- **Facturas recibidas** (`/app/recibidas`): botón de escaneo OCR como acción principal
  (placeholder, sin conectar).

---

## 4. Seguridad y cabeceras

Todas las rutas protegidas envían:

```
Authorization: Bearer <token>
Content-Type: application/json
Accept: */*
```

En plataforma nativa se usa **CapacitorHttp** (evita restricciones CORS del WebView). En web
se usa `fetch` con `credentials: 'include'`.

---

## 5. Despliegue

MVP desplegado en **Netlify** (build web, `npm run build` → carpeta `www/`) para revisión por
URL sin compilar nada localmente. Configuración en `netlify.toml`.
