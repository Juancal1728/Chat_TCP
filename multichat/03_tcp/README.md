# Sistema de Chat Multi‑Protocolo TCP

Sistema de chat en tiempo real con **arquitectura de tres capas** que comunica un **frontend web** con un **proxy REST** y un **servidor Java TCP/JSON**. Soporta mensajería privada y grupal, perfiles locales y sincronización mediante **polling HTTP**.

---

## Integrantes

* Juan David Calderon - A00403633
* Juan Felipe Nieto - A00404377

---

## Tabla de contenidos

* [Arquitectura](#arquitectura)
* [Componentes](#componentes)
* [Tecnologías](#tecnologías)
* [Requisitos previos](#requisitos-previos)
* [Instalación](#instalación)
* [Ejecución](#ejecución)
* [Funcionalidades](#funcionalidades)
* [Flujo de comunicación](#flujo-de-comunicación)
* [Estructura del proyecto](#estructura-del-proyecto)
* [Archivos de datos](#archivos-de-datos)
* [Comandos útiles](#comandos-útiles)
* [Solución de problemas](#solución-de-problemas)
* [Notas técnicas](#notas-técnicas)
* [Licencia y versión](#licencia-y-versión)

---

## Arquitectura

```
┌───────────────────────────────────────────────────────────────┐
│                      WEB CLIENT (Frontend)                    │
│                JavaScript + Webpack  •  :8080                 │
│  - UI Login/Chat   - Perfiles locales   - Polling 2 s         │
└───────────────▲───────────────────────────────────────────────┘
                │ HTTP/REST
                │
┌───────────────┴───────────────────────────────────────────────┐
│                   REST API PROXY (Node.js)                    │
│                    Express/CORS  •  :5001                     │
│  - Endpoints REST  - Traducción HTTP ⇄ TCP/JSON               │
└───────────────▲───────────────────────────────────────────────┘
                │ TCP/JSON
                │
┌───────────────┴───────────────────────────────────────────────┐
│                  BACKEND SERVER (Java 21)                     │
│                      Sockets TCP  •  :12345                   │
│  - ChatServicesImpl  - TCPJSONController  - Persistencia      │
└───────────────────────────────────────────────────────────────┘
```

---

## Componentes

**1) Backend (Java) — `03_tcp/server/`**

* **Puerto**: `12345` (TCP/JSON)
* **Responsabilidades**: lógica de negocio; usuarios, grupos, colas de pendientes; persistencia en archivos `.jsonl`.
* **Clases**: `ChatServicesImpl`, `TCPJSONController`, DTOs `Request/Response`, `Main`.

**2) REST API Proxy (Node.js) — `03_tcp/rest-api/`**

* **Puerto**: `5001` (HTTP)
* **Responsabilidades**: exponer endpoints REST; traducir HTTP⇄TCP/JSON; CORS.
* **Archivos**: `src/index.js`, `src/services/delegateService.js`.

**3) Web Client (Frontend) — `03_tcp/web-client/`**

* **Puerto**: `8080` (webpack dev server)
* **Responsabilidades**: UI, estados locales, polling, paneles de perfil/grupos.
* **Código**: páginas `Login.js`, `Chat.js`; componentes `ProfilePanel.js`, `UserInfoPanel.js`, `GroupSettingsPanel.js`; `services/restDelegate.js`.

---

## Tecnologías

* **Backend**: Java 21 (LTS), Gradle 8.10.x, Gson 2.10.x, JUnit 5, sockets TCP.
* **Middleware**: Node.js ≥ 18, Express 4, CORS, `net` (cliente TCP).
* **Frontend**: JavaScript ES6+, Webpack 5, Babel, HTML5, CSS3.

---

## Requisitos previos

1. **JDK 21+**
   Verifica: `java -version`
2. **Node.js 18+ y npm**
   Verifica: `node --version` y `npm --version`
3. **(Opcional) Git**
   Verifica: `git --version`

---

## Instalación

> **Nota**: Asume que tu proyecto está en `/ruta/a/tu/proyecto/03_tcp/`

### 1) Backend (Java)

Gradle wrapper descarga dependencias automáticamente.

**Windows (CMD/PowerShell)**
```cmd
cd C:\ruta\a\tu\proyecto\03_tcp
.\gradlew.bat --version
.\gradlew.bat :server:build
```

**macOS/Linux**
```bash
cd /ruta/a/tu/proyecto/03_tcp
./gradlew --version
./gradlew :server:build
```

### 2) REST API (Node.js)

**Windows (CMD/PowerShell)**
```cmd
cd C:\ruta\a\tu\proyecto\03_tcp\rest-api
npm install
```

**macOS/Linux**
```bash
cd /ruta/a/tu/proyecto/03_tcp/rest-api
npm install
```

### 3) Web Client (Frontend)

**Windows (CMD/PowerShell)**
```cmd
cd C:\ruta\a\tu\proyecto\03_tcp\web-client
npm install
```

**macOS/Linux**
```bash
cd /ruta/a/tu/proyecto/03_tcp/web-client
npm install
```

---

## Ejecución

Ejecuta **en tres terminales diferentes** en el siguiente orden:

### Terminal 1 — Backend (Java)

**Windows (CMD/PowerShell)**
```cmd
cd C:\ruta\a\tu\proyecto\03_tcp
.\gradlew.bat :server:run
```

**macOS**
```bash
cd /Users/tu-usuario/ruta/a/tu/proyecto/03_tcp
./gradlew :server:run
```

**Linux**
```bash
cd /home/tu-usuario/ruta/a/tu/proyecto/03_tcp
./gradlew :server:run
```

**Salida esperada:**
```
=== SERVIDOR DE CHAT===
Servidor TCP original (puerto 6000)
Servidor TCP-JSON para proxy HTTP (puerto 12345)
====================================

[TCP-JSON] Servidor TCP-JSON escuchando en puerto 12345
✅ Servidores iniciados correctamente
💡 Presiona Ctrl+C para detener
```

---

### Terminal 2 — REST API (Node.js)

**Windows (CMD/PowerShell)**
```cmd
cd C:\ruta\a\tu\proyecto\03_tcp\rest-api
npm start
```

**macOS**
```bash
cd /Users/tu-usuario/ruta/a/tu/proyecto/03_tcp/rest-api
npm start
```

**Linux**
```bash
cd /home/tu-usuario/ruta/a/tu/proyecto/03_tcp/rest-api
npm start
```

**Salida esperada:**
```
[REST-API] Server listening on port 5001
```

---

### Terminal 3 — Web Client (Frontend)

**Windows (CMD/PowerShell)**
```cmd
cd C:\ruta\a\tu\proyecto\03_tcp\web-client
npm start
```

**macOS**
```bash
cd /Users/tu-usuario/ruta/a/tu/proyecto/03_tcp/web-client
npm start
```

**Linux**
```bash
cd /home/tu-usuario/ruta/a/tu/proyecto/03_tcp/web-client
npm start
```

**Salida esperada:**
```
<i> [webpack-dev-server] Project is running at:
<i> [webpack-dev-server] Loopback: http://localhost:8080/
```

---

### Acceso y uso de la aplicación

1. Abre tu navegador en `http://localhost:8080`
2. Ingresa un nombre de usuario y haz clic en "Join Chat"
3. Para probar con múltiples usuarios, abre otra ventana en **modo incógnito** (Ctrl+Shift+N en Chrome/Edge, Cmd+Shift+N en Safari)
4. Al crear los multiples se recomienda crear un perfil con nombre propio y el segundo perfil crearlo como "Juan David Calderon", de esta forma se podra probar de forma apropiada el chat.

---

## Funcionalidades

### Autenticación y Sesión
* **Login con nombre de usuario**: interfaz de autenticación simple para desarrollo.
* **Registro automático**: usuarios nuevos se crean automáticamente al hacer login.
* **Persistencia de usuarios**: almacenados en `data/users.txt`.
* **Eliminación de usuarios**: funcionalidad para borrar permanentemente usuarios del sistema.
* **Sesión activa**: mantenida con `sessionStorage` del navegador.

### Mensajería Privada
* **Chat 1-a-1**: conversaciones privadas entre dos usuarios.
* **Burbujas diferenciadas**: mensajes enviados (verde) vs recibidos (gris).
* **Timestamps**: marca de tiempo en cada mensaje.
* **Historial persistente**: guardado en archivos `.jsonl` individuales por usuario.
* **Cola de mensajes**: mensajes quedan pendientes para usuarios offline.
* **Indicador de mensajes nuevos**: punto verde en lista de contactos.

### Mensajería Grupal
* **Crear grupos**: modal con selección múltiple de miembros.
* **Agregar miembros post-creación**: panel de configuración para gestionar grupo.
* **Icono personalizado**: subir imagen de grupo (Base64).
* **Mensajes broadcast**: distribución automática a todos los miembros.
* **Historial de grupo**: archivo dedicado `data/history/#NombreGrupo.jsonl`.

### Gestión de Perfiles
* **Editar perfil personal**: panel deslizante estilo WhatsApp.
* **Nombre personalizado**: cambiar nombre mostrado.
* **Estado/Descripción**: campo "About" personalizable.
* **Imagen de perfil**: subir y almacenar en Base64.
* **Eliminar cuenta propia**: opción para borrar tu propia cuenta permanentemente desde el perfil.
* **Almacenamiento por usuario**: datos en `localStorage` con clave por username.
* **Avatares por defecto**: SVG generado con iniciales del usuario.

### Panel de Información de Contactos
* **Ver perfil de otros usuarios**: acceso desde header del chat.
* **Información de solo lectura**: nombre, descripción e imagen.
* **Opciones de chat**: gestión de conversación individual.
* **Eliminar usuarios**: opción para eliminar permanentemente usuarios del sistema.
* **Cierre automático**: panel se cierra al cambiar de conversación.

### Configuración de Grupos
* **Panel de configuración**: accesible desde header del chat grupal.
* **Subir icono de grupo**: imagen personalizada.
* **Gestionar miembros**: ver lista y agregar nuevos miembros.
* **Diseño consistente**: modal con estilo uniforme.

### Gestión de Historial
* **Limpiar chat para mí**: elimina mensajes del cliente (localStorage).
* **Limpiar chat para todos**: elimina mensajes del servidor (archivos `.jsonl`).
* **Confirmación de acción**: diálogos antes de eliminar.
* **Implementación completa**: backend `clearChatHistory()` en `ChatServicesImpl`.

### Sincronización en Tiempo Real
* **Polling automático**: consultas HTTP cada 2 segundos.
* **Actualización de usuarios**: refresh de lista online/offline.
* **Indicadores de estado**: íconos visuales de conectividad.
* **Cache local**: optimización de mensajes para reducir tráfico.

### Interfaz Moderna
* **Diseño tipo WhatsApp**: dark theme profesional y limpio.
* **Tema oscuro**: colores suaves y modernos.
* **Responsive**: adaptable a diferentes tamaños de pantalla.
* **Transiciones suaves**: animaciones CSS para mejor UX.
* **Paneles deslizantes**: modales y sidebars con efecto slide.
* **Estados visuales**: hover, focus y active bien definidos.

### Testing
* **38 tests unitarios**: suite completa de tests JUnit 5.
* **Cobertura de backend**: `ChatServicesImpl`, DTOs, controladores.
* **Tests de integración**: validación de flujos completos.
* **Reporte HTML**: generado automáticamente en `server/build/reports/tests/`.

---

## Flujo de comunicación

**Login**

1. Frontend → `POST /api/login` (REST).
2. Proxy crea socket TCP → backend `:12345` y envía `{ action: "LOGIN", ... }`.
3. Backend valida/crea usuario y responde `OK`.

**Mensaje privado**

1. Frontend → `POST /api/message/user` con `{ from, to, msg }`.
2. Backend persiste en `history/<user>.jsonl`, encola en `pending[to]`.
3. Frontend del receptor hace polling `GET /api/messages/pending/<to>` y renderiza.

**Grupo**

* Creación `POST /api/group/create`, añadir miembros `POST /api/group/add-member`, mensaje `POST /api/message/group` → persistencia en `history/#Grupo.jsonl` y distribución a miembros.

---

## Estructura del proyecto

```
03_tcp/
├─ server/                       # Backend Java
│  ├─ src/main/java/
│  │  ├─ controllers/ TCPJSONController.java
│  │  ├─ dtos/        Request.java, Response.java
│  │  ├─ services/    ChatServicesImpl.java
│  │  └─ ui/          Main.java
│  ├─ data/           users.txt, groups.txt, history/*.jsonl
│  └─ build.gradle
├─ rest-api/                    # Middleware Node.js
│  ├─ src/index.js
│  ├─ src/services/delegateService.js
│  └─ package.json
├─ web-client/                  # Frontend
│  ├─ src/pages/    Login.js, Chat.js
│  ├─ src/components/ ProfilePanel.js, UserInfoPanel.js, GroupSettingsPanel.js
│  ├─ src/services/ restDelegate.js
│  ├─ index.html / index.css / index.js / webpack.config.js
│  └─ package.json
├─ build.gradle
├─ settings.gradle
└─ gradlew / gradlew.bat
```

---

## Archivos de datos

Durante la ejecución, el backend crea/usa:

```
server/data/
├─ users.txt             # Lista de usuarios
├─ groups.txt            # Formato: Grupo:Usuario1,Usuario2
└─ history/
   ├─ <usuario>.jsonl    # Historial privado por usuario
   └─ #<grupo>.jsonl     # Historial por grupo
```

**JSONL (1 objeto por línea)**

```json
{ "type":"text", "from":"Juan", "target":"Maria", "isGroup":false, "msg":"Hola", "ts":"2025-11-08T10:30:00Z" }
```

**Mensajes pendientes (formato interno)**
Privado: `"MSG|from|content"`  ·  Grupal: `"GROUP|groupName|from|content"`

---

## Comandos útiles

### Backend (Gradle)

**Windows (CMD/PowerShell)**
```cmd
:: Desde la raíz del proyecto 03_tcp\
cd C:\ruta\a\tu\proyecto\03_tcp

:: Compilar
.\gradlew.bat :server:build

:: Ejecutar servidor
.\gradlew.bat :server:run

:: Limpiar archivos compilados
.\gradlew.bat clean

:: Compilar sin ejecutar tests
.\gradlew.bat :server:build -x test
```

**macOS/Linux**
```bash
# Desde la raíz del proyecto 03_tcp/
cd /ruta/a/tu/proyecto/03_tcp

# Compilar
./gradlew :server:build

# Ejecutar servidor
./gradlew :server:run

# Limpiar archivos compilados
./gradlew clean

# Compilar sin ejecutar tests
./gradlew :server:build -x test
```

---

### REST API (Node.js)

**Windows (CMD/PowerShell)**
```cmd
:: Desde rest-api\
cd C:\ruta\a\tu\proyecto\03_tcp\rest-api

:: Instalar dependencias
npm install

:: Ejecutar en producción
npm start

:: Ejecutar en desarrollo (con auto-reload)
npm run dev
```

**macOS/Linux**
```bash
# Desde rest-api/
cd /ruta/a/tu/proyecto/03_tcp/rest-api

# Instalar dependencias
npm install

# Ejecutar en producción
npm start

# Ejecutar en desarrollo (con auto-reload)
npm run dev
```

---

### Frontend (Web Client)

**Windows (CMD/PowerShell)**
```cmd
:: Desde web-client\
cd C:\ruta\a\tu\proyecto\03_tcp\web-client

:: Instalar dependencias
npm install

:: Dev server en localhost:8080
npm start

:: Compilar para producción
npm run build
```

**macOS/Linux**
```bash
# Desde web-client/
cd /ruta/a/tu/proyecto/03_tcp/web-client

# Instalar dependencias
npm install

# Dev server en localhost:8080
npm start

# Compilar para producción
npm run build
```

---

### Diagnóstico de puertos

**Windows (CMD/PowerShell)**
```cmd
:: Ver qué proceso usa los puertos
netstat -ano | findstr "5001"
netstat -ano | findstr "8080"
netstat -ano | findstr "12345"

:: Matar proceso por PID
taskkill /PID <numero-PID> /F
```

**macOS/Linux**
```bash
# Ver qué proceso usa los puertos
lsof -i :5001
lsof -i :8080
lsof -i :12345

# Matar proceso por PID
kill -9 <numero-PID>

# O matar directamente por puerto
kill -9 $(lsof -t -i:5001)
kill -9 $(lsof -t -i:8080)
kill -9 $(lsof -t -i:12345)
```

---

## Solución de problemas

**Puerto en uso (`EADDRINUSE`)**

* Cierra procesos del puerto correspondiente (ver "Diagnóstico de puertos").

**No conecta el frontend**

* Verifica que backend (:12345) y REST (:5001) estén activos, y el frontend (:8080) en marcha.
* Revisa CORS habilitado en `rest-api/src/index.js`:

```js
const cors = require('cors');
app.use(cors()); // Antes de las rutas
```

**`Gradle build failed`**

* Requiere **JDK 21**. Limpia y reconstruye: `./gradlew clean build --refresh-dependencies`.

**`npm install` falla**

* Borra `node_modules` y `package-lock.json`; `npm cache clean --force`; luego `npm install`.

**No llegan mensajes en tiempo real**

* Abre devtools (F12) → pestañas *Console* y *Network*.
* Verifica polling cada 2 s a `/api/messages/pending/<user>` y que exista `sessionStorage.getItem('username')`.

---

## Testing

El proyecto incluye **38 tests unitarios** para el backend Java usando **JUnit 5**:

### Ejecutar tests

**Windows (CMD/PowerShell)**
```cmd
:: Desde la raíz del proyecto 03_tcp\
cd C:\ruta\a\tu\proyecto\03_tcp

:: Ejecutar todos los tests
.\gradlew.bat :server:test

:: Ver reporte HTML (abre en navegador por defecto)
start server\build\reports\tests\test\index.html
```

**macOS**
```bash
# Desde la raíz del proyecto 03_tcp/
cd /Users/tu-usuario/ruta/a/tu/proyecto/03_tcp

# Ejecutar todos los tests
./gradlew :server:test

# Ver reporte HTML (abre en Safari por defecto)
open server/build/reports/tests/test/index.html
```

**Linux**
```bash
# Desde la raíz del proyecto 03_tcp/
cd /home/tu-usuario/ruta/a/tu/proyecto/03_tcp

# Ejecutar todos los tests
./gradlew :server:test

# Ver reporte HTML (abre con navegador por defecto)
xdg-open server/build/reports/tests/test/index.html
```

**Cobertura de tests**

* ✅ **Autenticación**: Login/logout de usuarios, validación de sesiones
* ✅ **Gestión de usuarios**: Usuarios online/offline, lista de usuarios
* ✅ **Grupos**: Creación, agregar miembros, obtener grupos del usuario
* ✅ **Mensajería privada**: Envío, recepción, cola de pendientes
* ✅ **Mensajería grupal**: Broadcast a miembros, historial de grupo
* ✅ **Historial**: Recuperación de mensajes, limpieza de chat
* ✅ **DTOs**: Serialización/deserialización con Gson
* ✅ **Respuestas TCP**: Formato JSON correcto

**Resultado esperado**

```
BUILD SUCCESSFUL
38 tests completed, 0 failures
100% success rate
Duration: ~0.3s
```

**Archivos de test**

* `server/src/test/java/services/ChatServicesImplTest.java`
* `server/src/test/java/dtos/RequestTest.java`
* `server/src/test/java/dtos/ResponseTest.java`

---

## Notas técnicas

### Persistencia de Datos

* **Formato JSONL**: un objeto JSON por línea, eficiente para operaciones append.
* **Archivos separados**: un archivo por usuario/grupo para mejor concurrencia.
* **Sin base de datos**: simplifica deployment para propósitos educativos.

### Concurrencia

* `ConcurrentHashMap` para gestión thread-safe de usuarios online.
* Thread pool (`Executors.newFixedThreadPool(10)`) para conexiones TCP simultáneas.
* Sincronización en operaciones de escritura de archivos.

### Arquitectura de Comunicación

* **TCP/JSON binario**: comunicación eficiente entre proxy y backend.
* **HTTP/REST**: interfaz estándar para el frontend.
* **Polling HTTP**: alternativa simple a WebSockets (2 segundos).



