# El Cobrador del Waaagh · Torneos

Aplicación para preparar torneos: cada usuario crea sus torneos y, dentro de cada uno, sus matrices de equipo contra los rivales (jugadores propios frente a columnas rivales, con ejército, disposición y valoración 1-7).

## Qué incluye

- **Acceso:** login con usuario y contraseña. No hay registro público; solo el superadministrador crea cuentas.
- **Superadministrador:** crear usuarios, restablecer contraseñas (genera una temporal que el usuario debe cambiar) y eliminar usuarios.
- **Torneos:** crear (tipo de juego, nombre, equipo, jugadores por equipo), abrir, eliminar. Cada usuario solo ve los suyos.
- **Matrices:** pestañas por rival; jugadores propios con ejército y disposición; columnas rivales con nombre, ejército y disposición; valoraciones 1-7; ocultar y mostrar filas y columnas con el ojo; promedios.
- **Guardado automático:** cada cambio se guarda en la base de datos poco después de hacerlo. El indicador junto al nombre del torneo muestra si está guardado.

- **Importación desde Best Coast Pairings (BCP):** el formulario admite pegar el enlace del evento, leer los equipos y elegir el tuyo. Después genera el torneo con una matriz por cada equipo rival. **Pendiente:** la lectura del evento en sí (ver Estado).

**Alojamiento gratuito:** Render (plan gratuito, 512 MB de memoria) probablemente no tenga memoria suficiente para Chromium. Una opción gratuita que sí lo soporta es una máquina de Oracle Cloud (plan Always Free) con Docker Compose instalado. Los límites de los planes gratuitos cambian; verifícalos antes de contratar.

**Pendiente:** Age of Sigmar (sus facciones aún no están definidas).

## Estructura

```
server.js          Servidor Express, cabeceras de seguridad y arranque (migraciones + superadmin)
db.js              Conexión a PostgreSQL y superadmin inicial
migrate.js         Ejecuta las migraciones pendientes (también: npm run migrate)
migrations/        Esquema de la base de datos, versionado (001, 002…)
validate.js        Validación de todo lo que llega del cliente
config.js          Juegos, facciones y disposiciones (fuente única de verdad)
auth.js            Sesiones (JWT en cookie) y control de acceso
routes/            auth, admin y tournaments (la API)
public/            Frontend: index.html, css/styles.css, js/app.js, img/logo.png
docker-compose.yml PostgreSQL para desarrollo local
demo/              Prototipo anterior de las matrices (ya integrado en la aplicación)
```

## API

Todas las rutas (salvo login y salud) requieren sesión.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Inicia sesión |
| POST | `/api/auth/logout` | Cierra sesión |
| GET | `/api/auth/me` | Usuario de la sesión |
| POST | `/api/auth/change-password` | Cambia la contraseña |
| GET | `/api/admin/users` | Lista usuarios (superadmin) |
| POST | `/api/admin/users` | Crea usuario con contraseña temporal (superadmin) |
| POST | `/api/admin/users/:id/reset-password` | Restablece contraseña (superadmin) |
| DELETE | `/api/admin/users/:id` | Elimina usuario (superadmin) |
| GET | `/api/tournaments/meta` | Juegos, facciones, disposiciones y límites |
| GET | `/api/tournaments` | Torneos del usuario |
| POST | `/api/tournaments` | Crea torneo |
| GET | `/api/tournaments/:id` | Estado completo: jugadores, matrices, rivales, ocultos y valoraciones |
| PUT | `/api/tournaments/:id` | Guarda el estado completo (validado y en una transacción) |
| DELETE | `/api/tournaments/:id` | Elimina torneo y todo lo que contiene |
| GET | `/api/health` | Comprueba la aplicación y la base de datos |

## Todo con Docker (recomendado)

No hace falta instalar Node, PostgreSQL ni navegadores en tu ordenador. Solo Docker Desktop.

```bash
cp .env.example .env              # y cambia JWT_SECRET, ADMIN_PASSWORD
docker compose up -d --build      # la primera vez tarda varios minutos (imagen de ~1,5 GB)
```

Abre http://localhost:3000. Para ver logs: `docker compose logs -f app`. Para parar: `docker compose down`.

**Importación desde BCP:** el contenedor incluye Chromium (Playwright). Al pegar la URL de un evento, la aplicación abre la página, pulsa la pestaña Roster y extrae equipos, jugadores, ejércitos y disposiciones.

**Depuración:** con `BCP_DEBUG=1` en `.env`, cada lectura guarda el HTML y una captura en `./debug/`. Si la extracción no encuentra equipos, envía esos ficheros para ajustar `bcp/extract.js`.

## Desarrollo local

Requisitos: **Node.js 20 o superior** y **Docker Desktop** (gratis para uso personal).

```bash
npm install                       # 1. dependencias
docker compose up -d              # 2. base de datos PostgreSQL local
cp .env.example .env              # 3. configuración (en Windows: copy .env.example .env)
```

En `.env`, cambia `JWT_SECRET` por un valor aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
npm run dev                       # 4. arranca (aplica las migraciones automáticamente)
```

Abre http://localhost:3000 y entra con `ADMIN_USERNAME` y `ADMIN_PASSWORD`.

**Comprobar la base de datos:** http://localhost:3000/api/health debe responder `{"ok":true}`.

**Parar y reanudar:** `Ctrl+C` para la aplicación; `docker compose down` para la base de datos (los datos se conservan); `docker compose up -d` para volver a arrancarla.

**Reiniciar la base de datos desde cero:** `docker compose down -v` borra los datos. Al volver a arrancar, se crean de nuevo las tablas y el superadministrador.

## Migraciones

Las migraciones son ficheros SQL numerados en `migrations/`. Se aplican en orden, cada una en una transacción, y se registran en la tabla `schema_migrations`, así que nunca se ejecutan dos veces.

- Se aplican **automáticamente** al arrancar la aplicación.
- Para aplicarlas sin arrancarla: `npm run migrate`.
- Para cambiar el esquema, **añade un nuevo fichero** (`003_…sql`). No edites los existentes una vez aplicados.

**Aviso:** la migración `002` sustituye el modelo de matrices de la versión anterior. Si tenías matrices guardadas con esa versión, se pierden al aplicarla. Eran datos de prueba.

## Producción (gratis)

La misma aplicación, con estos servicios:

| Pieza | Servicio gratuito | Notas |
|---|---|---|
| Base de datos | Neon | PostgreSQL gestionado |
| Aplicación | Render (Web Service) | Duerme tras unos 15 min sin uso; la primera carga tarda casi un minuto |

**1. Base de datos (Neon)**
1. Crea una cuenta en https://neon.tech y un proyecto.
2. Copia la cadena de conexión. Quítale el `?sslmode=require` del final.

**2. Aplicación (Render)**
1. Crea una cuenta en https://render.com → **New → Web Service** → conecta el repositorio de GitHub.
2. Build Command: `npm install`. Start Command: `npm start`.
3. Variables de entorno:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La cadena de Neon, sin `?sslmode=...` |
| `PGSSL` | `true` |
| `JWT_SECRET` | Un secreto largo y aleatorio, distinto del local |
| `ADMIN_USERNAME` | Tu usuario superadministrador |
| `ADMIN_PASSWORD` | Una contraseña fuerte, distinta de la local |
| `NODE_ENV` | `production` |

4. Al arrancar, la aplicación aplica las migraciones y crea el superadministrador. Comprueba `https://TU-APP.onrender.com/api/health`.
5. Cuando entres correctamente, **elimina `ADMIN_PASSWORD` de Render**.

**Importante:** local y producción son bases de datos distintas. No apuntes tu `.env` local a Neon, ni al revés.

## Calidad y pruebas

- La validación de datos se ha probado de forma aislada (alta de torneos, estado completo, valoraciones 1-7, facciones y disposiciones fuera de catálogo).
- Las rutas de torneos se han probado con una base de datos simulada. **No se han probado todavía contra PostgreSQL real ni en un navegador real.** Esa comprobación es el primer paso al desplegar en local.

## Estado

- **Torneos y matrices:** persistencia completa, con migraciones y guardado automático.
- **Facciones de 40k:** 28 ejércitos. Son los 23 ejércitos con códex propio (fuente: guía de Warhammer Guild, noviembre de 2026) más cinco capítulos de Space Marine que Best Coast Pairings trata como ejércitos propios: Black Templars, Blood Angels, Dark Angels, Deathwatch y Space Wolves.
- **Importación desde BCP, parte pendiente:** la página de BCP carga los datos con JavaScript, desde una API interna. `bcp/fetch.js` contiene la lectura, que todavía no está conectada. La conversión de los datos, la generación de matrices y el flujo del formulario sí están hechos y probados.
- **Age of Sigmar:** pendiente de definir sus facciones.

### Formato que necesita la importación de BCP

Para conectar la lectura, hace falta una respuesta real de BCP. Se obtiene así:

1. Abre el evento en el navegador (Chrome o Safari).
2. Abre las herramientas de desarrollo (en Chrome: `Cmd+Option+I`) y ve a la pestaña **Network** (Red).
3. Recarga la página y filtra por **Fetch/XHR**.
4. Busca la petición cuya respuesta contiene los equipos y los jugadores, pulsa con el botón derecho y elige **Copy → Copy response**.

Con esa respuesta y la URL de la petición, se implementa el lector en `bcp/fetch.js`.

## Datos de meta (administración)

La varita mágica sugiere valores a partir de datos que carga el superadministrador, no de ninguna web externa.

1. En **Administración → Datos de meta** hay una sección por juego (40k y Sigmar).
2. Elige un Excel (.xls o .xlsx, máximo 1 MB). La primera hoja debe tener estas columnas en la primera fila: `faction | rival | win_rate | avg_diff | games`.
3. **Validar** muestra el resultado fila por fila y una vista previa de la diferencia media de cada cruce.
4. **Guardar datos** reemplaza los datos del juego, solo si no hay errores.
5. **Descargar datos actuales** baja un Excel con lo que hay guardado, para editarlo y volver a subirlo.

Reglas del validador:
- Un valor vacío o `-` es un dato ausente: se muestra como `-` y no impide guardar.
- Un nombre de facción desconocido, un número mal escrito o una fila repetida es un error, y sí impide guardar.

La varita usa la diferencia media (`avg_diff`) para asignar el valor de la escala 1-7. Mientras se calcula una varita, la matriz queda bloqueada hasta que termine.

Tras actualizar el código, instala la dependencia de Excel con `npm install` (o reconstruye Docker con `docker compose up -d --build app`).

## Lista de cada rival

En la fila del ejército de cada rival hay un icono de informe:

- **Torneo creado a mano, o rival sin enlace:** abre una ventana para pegar la lista en texto. Se puede leer y editar. Los cambios se guardan al cerrar la ventana.
- **Torneo importado de BCP con enlace a la lista del jugador:** el icono abre esa lista de BCP en una ventana nueva. No se visita ni se copia nada de BCP.

El enlace a BCP se toma del HTML de la pestaña Roster, si la fila del jugador lo incluye como enlace a `/list/…`.

## Despliegue

Ver `docs/despliegue-gratuito.md`: dos opciones gratuitas paso a paso (Render + Neon, o Oracle Cloud con Docker).

También hay una guía para Google Cloud Run: `docs/cloud-run.md`.

Guía para Vercel (aplicación completa, con BCP): `docs/vercel.md`. Empieza por la comprobación de límites del plan gratuito.
