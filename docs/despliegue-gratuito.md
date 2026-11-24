# Despliegue gratuito

Hay dos opciones. Las dos son gratuitas en el momento de escribir esto, pero los planes gratuitos cambian: **revisa los límites antes de empezar**.

| | A · Render + Neon | B · Oracle Cloud (todo en una máquina) |
|---|---|---|
| Coste | Gratis | Gratis (plan *Always Free*) |
| Base de datos | Neon (PostgreSQL gestionado) | PostgreSQL en Docker, en la misma máquina |
| Importación de BCP (Chromium) | Probablemente **no** cabe en 512 MB | Sí |
| Dificultad | Baja | Media (administrar un servidor) |
| Mantenimiento | Mínimo | Tú actualizas el servidor |

Recomendación: empieza con **A**. Si la importación de BCP falla por memoria, pasa a **B**.

---

## Antes de empezar (en tu ordenador)

1. Sube el proyecto a GitHub:
   ```bash
   git add -A
   git commit -m "Versión para despliegue"
   git push
   ```
2. Ten a mano un generador de secretos. Con Node:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Lo usarás para `JWT_SECRET`. Guárdalo en un gestor de contraseñas.

---

## Opción A · Render (aplicación) + Neon (base de datos)

### Paso 1 · Base de datos en Neon
1. Crea una cuenta en https://neon.tech y un proyecto nuevo.
2. Copia la cadena de conexión del panel. Tiene esta forma:
   `postgres://usuario:contraseña@ep-xxxx.neon.tech/neondb?sslmode=require`
3. **Quita `?sslmode=require` del final.** La aplicación gestiona SSL con `PGSSL=true`. Guarda el resultado como `DATABASE_URL`.

### Paso 2 · Servicio web en Render
1. Crea una cuenta en https://render.com y pulsa **New → Web Service**.
2. Conecta tu repositorio de GitHub.
3. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### Paso 3 · Variables de entorno
En **Environment**, añade:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La cadena de Neon, sin `?sslmode=...` |
| `PGSSL` | `true` |
| `JWT_SECRET` | El secreto que generaste |
| `ADMIN_USERNAME` | Tu usuario superadministrador |
| `ADMIN_PASSWORD` | Una contraseña fuerte (distinta de la local) |
| `NODE_ENV` | `production` |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` (evita descargar el navegador en cada instalación) |

Render asigna el puerto automáticamente. La aplicación ya lee `PORT`.

### Paso 4 · Primer arranque
1. Pulsa **Create Web Service** y espera al despliegue.
2. Revisa los logs. Deben aparecer las migraciones y la creación del superadministrador:
   ```
   Migración aplicada: 001_base.sql
   ...
   Superadministrador "…" creado
   Servidor en http://localhost:…
   ```
3. Abre `https://TU-APP.onrender.com/api/health`. Debe responder `{"ok":true,...}`.

### Paso 5 · Puesta en marcha
1. Entra en la web con el usuario administrador.
2. Crea los usuarios en **Administración → 1 · Usuarios**.
3. Sube el Excel de datos de meta en **Administración → 2 · Datos de meta**: primero **Validar**, después **Guardar datos**.
4. **Elimina `ADMIN_PASSWORD` de Render** y guarda los cambios. Ya no se usa.

### Limitaciones de Render gratuito
- **Se duerme** tras unos 15 minutos sin uso. La primera visita tarda cerca de un minuto.
- **Memoria de 512 MB.** La importación de BCP con Chromium puede fallar. Si ocurre, usa la opción B para esa parte.
- **Neon gratuito** tiene límite de almacenamiento y de historial. Haz copias de seguridad (ver más abajo).

---

## Opción B · Oracle Cloud (todo en una máquina)

Esta opción ejecuta todo en una máquina: la aplicación con Chromium (para BCP), PostgreSQL y Caddy para HTTPS. Es la que puede sostener la importación de BCP.

### B1 · Cuenta y máquina virtual
1. Crea una cuenta en la oferta gratuita de Oracle Cloud: https://www.oracle.com/cloud/free/
2. En la consola, entra en **Compute → Instances → Create instance**.
3. **Imagen:** Ubuntu (22.04 o 24.04).
4. **Forma (shape):** elige **Ampere A1 Flex** (ARM) con **1 OCPU y 6 GB de memoria**, dentro de la oferta *Always Free*.
   **No uses** `VM.Standard.E2.1.Micro`: tiene 1 GB, no basta para Chromium.
5. **Claves SSH:** descarga la clave privada y guárdala. La necesitas para conectarte.
6. Asegúrate de que la instancia tiene **IP pública**.

#### Red durante la creación de la instancia (pantalla "Primary VNIC")
Al crear la instancia, el asistente pide la red. Para la oferta gratuita rellénalo así:

| Campo | Qué elegir |
|---|---|
| **VNIC name** | `cobrador-vnic` |
| **Primary network** | **Create new virtual cloud network** → nombre `cobrador-vcn` |
| **Subnet** | **Create new public subnet** → nombre `cobrador-subnet-publica` |
| **Assign a public IPv4 address** | Marcado (sin esto la máquina no es accesible) |

No elijas **Specify OCID** ni **Select existing** salvo que ya tengas una red creada. Las redes virtuales y las subredes no tienen coste. Revisa el resumen de la derecha: debe indicar la oferta *Always Free*.

### B2 · Red de Oracle Cloud: que la máquina sea accesible desde Internet

Para que el HTTPS funcione, tu máquina tiene que tener IP pública y aceptar tráfico en los puertos 80 (validación del certificado) y 443 (web). Hay cuatro comprobaciones, en este orden.

**1 · La instancia tiene IP pública reservada**
1. En el menú de Oracle (☰) ve a **Compute → Instances** y entra en tu instancia.
2. En la sección **Instance details → Primary VNIC** (o *Attached VNICs*), entra en la VNIC.
3. En **IPv4 Addresses**, pulsa los tres puntos de la IP pública y elige **Edit** → **Reserved public IP** → crea una nueva con el nombre que quieras.

Así la IP no cambia si reinicias la máquina. La IP reservada asociada a una instancia en marcha no tiene coste en la oferta gratuita. Apunta esa IP en DuckDNS (paso B3).

**2 · La subred es pública**
La red que creó el asistente de instancias ya es pública. Compruébalo en **Networking → Virtual Cloud Networks**, entra en tu red y después en la subred de la instancia. En **Subnet access** debe poner **Public subnet**.

**3 · La regla de entrada en la lista de seguridad**
Esta es la regla que más se olvida.
1. Dentro de la subred, en **Security Lists**, entra en la lista por defecto (*Default Security List for …*).
2. Pulsa **Add Ingress Rules** y añade estas dos reglas:

| Source CIDR | IP protocol | Destination port range | Descripción |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP (validación HTTPS) |
| `0.0.0.0/0` | TCP | `443` | HTTPS (la web) |

3. Guarda. No borres la regla que ya existe para el puerto **22** (SSH), o perderás el acceso por SSH.

**4 · El firewall de Ubuntu**
Las imágenes de Ubuntu de Oracle traen reglas de `iptables` que bloquean casi todo. Hay que abrir los puertos **antes** de la regla final que rechaza el tráfico:

```bash
sudo iptables -L INPUT --line-numbers          # mira el número de la línea "REJECT"
sudo iptables -I INPUT <número_de_REJECT> -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT <número_de_REJECT> -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt install -y iptables-persistent     # responde "Sí" para guardar las reglas
sudo netfilter-persistent save
```

Sustituye `<número_de_REJECT>` por el número que aparezca en la línea con `REJECT`. Si lo insertas después, no tendrá efecto.

**Comprobar la red desde tu ordenador** (antes de montar nada, o cuando termines):
```bash
nc -vz IP_PUBLICA 22
nc -vz IP_PUBLICA 80
nc -vz IP_PUBLICA 443
```
Si el 22 conecta pero el 80 o el 443 no, el problema está en el paso 3 o en el 4. Si ninguno conecta, revisa la IP reservada y la subred.

Cuando Caddy esté en marcha (paso B8), `sudo ss -ltnp` debe mostrar los puertos 80 y 443 escuchando.

### B3 · Dominio gratuito
1. Entra en https://www.duckdns.org e inicia sesión.
2. Crea un subdominio (por ejemplo `cobrador`) y apúntalo a la **IP pública** de la máquina.
3. Tu dominio será `cobrador.duckdns.org`. Lo usarás como `DOMAIN` en `.env`.

### B4 · Conectarte por SSH
Desde tu ordenador (sustituye la ruta de la clave y la IP):
```bash
chmod 600 ~/Downloads/clave-oracle.key
ssh -i ~/Downloads/clave-oracle.key ubuntu@IP_PUBLICA
```

### B5 · Instalar Docker y Git
En la máquina:
```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER
```
Cierra la sesión SSH y vuelve a entrar para que el cambio de grupo tenga efecto. Comprueba:
```bash
docker compose version
```
Si `docker-compose-v2` no existe en tu versión de Ubuntu, sigue la guía oficial de Docker para Ubuntu: https://docs.docker.com/engine/install/ubuntu/

### B6 · Descargar el proyecto
```bash
git clone https://github.com/TU_USUARIO/TU_REPO.git cobrador-torneos
cd cobrador-torneos
cp .env.example .env
```
Si el repositorio es privado, usa un token de acceso personal en la URL o una clave de despliegue de GitHub.

### B7 · Configurar `.env`
Edita el archivo (`nano .env`) y define:

| Variable | Valor |
|---|---|
| `DOMAIN` | `cobrador.duckdns.org` (tu dominio) |
| `POSTGRES_PASSWORD` | Una contraseña larga. Solo la usa la base de datos. |
| `JWT_SECRET` | El secreto que generaste |
| `ADMIN_USERNAME` | Tu usuario superadministrador |
| `ADMIN_PASSWORD` | Una contraseña fuerte, distinta de la local |

Genera la de la base de datos con el mismo comando de siempre. Las demás variables de desarrollo (`DATABASE_URL`, `PGSSL`) se ignoran en producción, porque `docker-compose.prod.yml` las define.

### B8 · Arrancar
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```
La primera construcción tarda bastante (descarga Chromium). En los logs deben aparecer las migraciones y `Superadministrador "…" creado`.

Caddy obtiene el certificado HTTPS solo, en el primer minuto. Si aún no responde, revisa que el dominio apunta a la IP y que los puertos 80 y 443 están abiertos.

### B9 · Comprobar
Abre `https://cobrador.duckdns.org/api/health`. Debe responder `{"ok":true,...}`.

### B10 · Puesta en marcha
1. Entra en la web con el usuario administrador.
2. Crea los usuarios y sube el Excel de datos de meta (primero **Validar**, luego **Guardar datos**).
3. Prueba una importación de BCP con un evento real. Es la prueba que esta opción debe superar.
4. **Elimina `ADMIN_PASSWORD` de `.env`** y aplica el cambio:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

### B11 · Mantenimiento
- **Actualizar:** `git pull && docker compose -f docker-compose.prod.yml up -d --build`. Las migraciones se aplican solas.
- **Ver logs:** `docker compose -f docker-compose.prod.yml logs -f app`.
- **Reiniciar:** `docker compose -f docker-compose.prod.yml restart`.

### Puntos a verificar en esta opción
- **Imagen de Chromium en ARM:** la imagen de Playwright suele tener versión para ARM, pero compruébalo en la primera construcción. Si falla, avisa.
- **Oracle puede parar instancias inactivas** en la oferta gratuita. Revisa su política actual antes de depender de la máquina.
- **Límites de la oferta gratuita** cambian. Verifícalos en https://www.oracle.com/cloud/free/

## Copias de seguridad (ambas opciones)

Desde tu ordenador (necesitas el cliente `pg_dump` de PostgreSQL):

```bash
pg_dump "postgres://usuario:contraseña@host/basedatos?sslmode=require" > copia-$(date +%F).sql
```

Para la opción B, en la máquina:
```bash
docker exec cobrador-db pg_dump -U cobrador cobrador > copia-$(date +%F).sql
```

Guarda las copias fuera del servidor. Hazlas, como mínimo, una vez por semana.

---

## Lista de comprobación

- [ ] El proyecto está en GitHub.
- [ ] La base de datos existe (Neon, o Docker en la máquina).
- [ ] Las variables de entorno están definidas (sin `ADMIN_PASSWORD` al final).
- [ ] `/api/health` responde `ok`.
- [ ] Entras como administrador y puedes crear usuarios.
- [ ] Has subido el Excel de meta y lo has validado.
- [ ] Has eliminado `ADMIN_PASSWORD` del servicio.
- [ ] Tienes una copia de seguridad guardada fuera del servidor.
