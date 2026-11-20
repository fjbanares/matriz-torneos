# El Cobrador del Waaagh · Torneos

Aplicación web sencilla con login, gestión de usuarios por parte del superadministrador y creación de torneos.

## Funcionalidades

- **Sin registro público**: solo el superadministrador da de alta usuarios.
- **Superadministrador**: crear, eliminar y restablecer la contraseña de usuarios.
- **Contraseña temporal**: al crear o restablecer una cuenta, el usuario debe cambiarla en su primer acceso.
- **Usuarios**: crear y eliminar torneos (solo con nombre), y cambiar su contraseña.
- **Diseño responsive** (móvil y escritorio) y accesible (teclado, lectores de pantalla, contraste).

## Estructura

```
cobrador-torneos/
├── server.js          # Servidor Express y cabeceras de seguridad
├── db.js              # Conexión a PostgreSQL, tablas y superadmin inicial
├── auth.js            # Sesiones (JWT en cookie) y middlewares
├── routes/
│   ├── auth.js        # Login, logout, sesión actual, cambio de contraseña
│   ├── admin.js       # Gestión de usuarios (solo superadmin)
│   └── tournaments.js # Crear, listar y eliminar torneos
└── public/            # Frontend (HTML, CSS y JS sin frameworks)
    └── img/logo.svg   # ← sustituir por tu logo
```

---

## 1. Probar en local

Requisitos: **Node.js 20 o superior** y una base de datos PostgreSQL. La forma más fácil de tener una base de datos gratuita es Neon (paso 3); también puedes usar Postgres local.

```bash
cd cobrador-torneos
npm install
cp .env.example .env
```

Genera un `JWT_SECRET` aleatorio y pégalo en `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Edita `.env` con tu `DATABASE_URL`, `ADMIN_USERNAME` y `ADMIN_PASSWORD`, y arranca:

```bash
npm run dev
```

Abre http://localhost:3000 e inicia sesión con el superadministrador.

## 2. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Primera versión de Cobrador Torneos"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cobrador-torneos.git
git push -u origin main
```

Crea antes el repositorio vacío en github.com (sin README ni .gitignore, porque ya los tienes). El `.gitignore` evita subir `.env` y `node_modules`.

## 3. Base de datos gratuita (Neon)

1. Crea una cuenta en https://neon.tech y un proyecto nuevo.
2. Copia la cadena de conexión (formato `postgres://usuario:contraseña@host/basedatos`).
3. Esa cadena será tu `DATABASE_URL`. En Neon, `PGSSL` debe ser `true`.

## 4. Hosting gratuito (Render)

1. Crea una cuenta en https://render.com y pulsa **New → Web Service**.
2. Conecta tu repositorio de GitHub.
3. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. En **Environment**, añade estas variables:

| Variable       | Valor                                                |
|----------------|------------------------------------------------------|
| `DATABASE_URL` | La cadena de conexión de Neon                        |
| `PGSSL`        | `true`                                               |
| `JWT_SECRET`   | El secreto aleatorio generado antes                  |
| `ADMIN_USERNAME` | El nombre de tu superadministrador                 |
| `ADMIN_PASSWORD` | Una contraseña larga y segura                      |
| `NODE_ENV`     | `production`                                         |

5. Pulsa **Create Web Service**. Cuando termine el despliegue, tendrás una URL pública `https://tu-app.onrender.com`.

**Importante:** cuando el primer arranque haya creado tu superadministrador, puedes borrar `ADMIN_USERNAME` y `ADMIN_PASSWORD` de Render. Ya no se vuelven a usar.

### Notas sobre el plan gratuito

- Los servicios gratuitos se **duermen tras unos 15 minutos sin uso**. La primera visita tras una pausa puede tardar cerca de un minuto en cargar.
- Los planes gratuitos cambian con el tiempo. Revisa los límites en la web de cada proveedor antes de desplegar.

## 5. Logo

El logo del club está en `public/img/logo.png` y se usa en la cabecera, en el login y como favicon. Para cambiarlo, sustituye ese archivo manteniendo el nombre. Las decisiones de diseño están en `DESIGN.md`.

## Próximos pasos sugeridos

- Editar el nombre de los torneos.
- Límite de intentos más estricto y bloqueo temporal de cuentas.
- Copias de seguridad de la base de datos.
- Roles adicionales y permisos por torneo, cuando los necesites.

## Estado actual (WIP)

- **Backend:** autenticación, administración de usuarios, torneos (con tipo de juego, equipo, modo de preparación y jugadores por equipo) y matrices con sus jugadores, rivales, disposiciones y valoraciones. Catálogos en `config.js`.
- **Frontend de la aplicación:** pendiente de adaptar a las nuevas rutas y a la vista de matrices. `public/js/app.js` aún corresponde a la versión anterior, así que el flujo de torneos no funciona completo.
- **Demo de matrices:** `demo/matrices-demo.html` es una prototipo independiente (guarda en el navegador). No se sirve desde el servidor, porque la carpeta `demo/` está fuera de `public/`.
- **Pendiente:** facciones que aparecen en los Excel de ejemplo y no están en la lista de 40k (Adeptus Custodes, Drukhari, Death Guard, Chaos Daemons, Chaos Space Marines, Deathwatch, Blood Angels).
- **Sigmar:** pendiente de definir las facciones.
