# Despliegue en Vercel (aplicación completa, con BCP)

Esta guía despliega **todo el proyecto, incluida la importación de BCP**, como contenedor en Vercel. La base de datos va en Neon.

> **Antes de empezar: comprobación obligatoria.** No he podido confirmar desde aquí dos cosas, y de ellas depende que esta opción sea gratuita:
> 1. Que el **plan Hobby** permita ejecutar imágenes de contenedor como funciones, y con qué cuota.
> 2. Que la **imagen** (unos 1,5 GB con el navegador de Playwright) entre en el registro de contenedores de Vercel del plan gratuito, y cuánto cuesta almacenarla.
>
> Léelo en las páginas oficiales antes de seguir:
> - Plan Hobby: https://vercel.com/docs/plans/hobby
> - Contenedores como funciones: https://vercel.com/docs/functions/container-images
> - Registro de contenedores (límites y precios): https://vercel.com/docs/container-registry
> - Límites de las funciones (memoria y duración): https://vercel.com/docs/functions/limitations
>
> Si alguna de las dos no está cubierta por el plan gratuito, **para aquí**: la opción tendría coste, y la revisaremos.

---

## 1 · Cuenta y herramienta de línea de comandos

1. Crea una cuenta en https://vercel.com (plan Hobby).
2. Instala la CLI con Node 20 o superior:
   ```bash
   npm install -g vercel
   vercel login
   ```

## 2 · Base de datos en Neon

1. Crea un proyecto en https://neon.tech.
2. Copia la cadena de conexión y **quita `?sslmode=require`** del final. Ese valor será `DATABASE_URL`.

## 3 · Ajustar el puerto del contenedor

Vercel sirve los contenedores por el **puerto 80** por defecto. La aplicación lee el puerto de la variable `PORT`. En el `Dockerfile`, cambia la línea de entorno:

```dockerfile
ENV NODE_ENV=production \
    PORT=80 \
    BCP_DEBUG_DIR=/app/debug \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

Esto no rompe el desarrollo local: `docker-compose.yml` y `docker-compose.prod.yml` leen `PORT` de `.env` (valor `3000`), y ese valor tiene prioridad sobre el del `Dockerfile`.

## 4 · Comprobar que la imagen se construye

Antes de desplegar, prueba la imagen en tu ordenador:
```bash
docker build -t cobrador-vercel .
docker run --rm -p 8080:80 \
  --env-file .env \
  -e PORT=80 \
  -e PGSSL=true \
  -e DATABASE_URL="postgres://USUARIO:CONTRASEÑA@HOST.neon.tech/NOMBRE" \
  cobrador-vercel
```
Sustituye la cadena de Neon por la tuya, sin `?sslmode=require`. El `.env` debe tener `JWT_SECRET`, `ADMIN_USERNAME` y `ADMIN_PASSWORD`; si falta `JWT_SECRET`, la aplicación no arranca (ese es el error `Falta la variable de entorno JWT_SECRET`).

**Importante:** dentro del contenedor, `localhost` es el propio contenedor, no tu ordenador. Por eso `DATABASE_URL` debe apuntar a Neon (o a `host.docker.internal` si usas una base de datos en tu ordenador).

Si el arranque muestra las migraciones y `Servidor en…`, la imagen funciona. Comprueba `http://localhost:8080/api/health`.

Anota el tamaño de la imagen:
```bash
docker image ls cobrador-vercel
```
Si pesa mucho más de lo que indica el límite del registro de Vercel, habrá que reducirla (por ejemplo, con una imagen base de Node más ligera e instalando solo Chromium). Dímelo y lo preparamos.

## 5 · Crear el proyecto en Vercel

Desde la carpeta del proyecto:
```bash
vercel link
```
Elige **Create a new project**, un nombre (por ejemplo `cobrador-torneos`) y confirma. La CLI detecta el `Dockerfile` y lo usa para construir la aplicación.

La forma exacta de configurar el contenedor (memoria, duración, puerto) cambia con las versiones de Vercel. Consulta https://vercel.com/docs/functions/container-images para confirmar los nombres de las opciones antes de aplicarlas.

## 6 · Variables de entorno

En el panel del proyecto, ve a **Settings → Environment Variables** y añade, para el entorno **Production**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La cadena de Neon, sin `?sslmode=...` |
| `PGSSL` | `true` |
| `JWT_SECRET` | Un secreto largo y aleatorio |
| `ADMIN_USERNAME` | Tu usuario superadministrador |
| `ADMIN_PASSWORD` | Una contraseña fuerte (quítala después del primer acceso) |
| `NODE_ENV` | `production` |
| `PORT` | `80` |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` |

## 7 · Memoria y duración

- **Memoria:** configura la función con **2 GB**. Es el máximo del plan Hobby, según la documentación de límites. Con menos, Chromium puede fallar durante la importación de BCP.
- **Duración máxima:** **300 segundos**, el valor por defecto y máximo del plan Hobby. Una importación de BCP debe caber en ese tiempo. Si no cabe, el error será de tiempo agotado.

Ajusta ambos en la configuración de la función del proyecto (o en el archivo de configuración que indique la documentación de contenedores).

## 8 · Desplegar

Primera vez, en producción:
```bash
vercel --prod
```
Al terminar, la CLI muestra la URL, con esta forma: `https://cobrador-torneos.vercel.app` (o similar).

A partir de ahora, cada vez que cambies el código, repite `vercel --prod`.

## 9 · Comprobar

1. Abre `https://TU-URL/api/health`. Debe responder `{"ok":true,...}`.
2. Revisa los logs si algo falla:
   ```bash
   vercel logs TU-URL
   ```
   Deben aparecer las migraciones y `Superadministrador "…" creado` (solo la primera vez).

## 10 · Puesta en marcha

1. Entra con el usuario administrador, crea los usuarios y sube el Excel de datos de meta (primero **Validar**, luego **Guardar datos**).
2. **Prueba la importación de BCP con un evento real.** Es la prueba que decide si esta opción sirve.
3. Quita `ADMIN_PASSWORD` de **Environment Variables** y vuelve a desplegar con `vercel --prod`.

## Solución de problemas

### `Executable doesn't exist at /home/…/.cache/ms-playwright/…`
Significa que Playwright busca el navegador en la carpeta personal del usuario del contenedor, y no en `/ms-playwright`. Eso ocurre cuando la variable `PLAYWRIGHT_BROWSERS_PATH` no llega al contenedor.

El `Dockerfile` ya instala Chromium en `/ms-playwright` durante la construcción y define la variable. Para aplicarlo:

1. Confirma que **Vercel construye con el `Dockerfile` nuevo**: en el panel, revisa el commit del último despliegue y que el paso de construcción incluya `npx playwright install chromium`.
2. Añade `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` en **Environment Variables** de Vercel y **redespliega sin caché** (`vercel --prod --force`).
3. Si sigue fallando, pégame el registro de construcción del despliegue. Lo que buscamos es si el paso `npx playwright install chromium` se ejecutó y terminó bien.

**Comprobación en local, antes de desplegar** (con un usuario que no sea `root`):
```bash
docker build -t cobrador-vercel .
docker run --rm --user 1000 cobrador-vercel \
  node -e "const {chromium}=require('playwright'); console.log(chromium.executablePath()); console.log(require('fs').existsSync(chromium.executablePath()))"
```
Debe imprimir una ruta que empiece por `/ms-playwright/` y después `true`.

## Solución definitiva para BCP en Vercel: Chromium serverless

La diagnóstico (`/api/admin/bcp-diagnostic`) mostró que `/ms-playwright` no existe dentro del contenedor de Vercel. El navegador instalado durante la construcción no llega al entorno de ejecución. Para evitarlo, usa Chromium empaquetado para funciones serverless.

**Pasos:**

1. Instala las dependencias en tu proyecto. Elige versiones compatibles entre sí: la tabla de compatibilidad está en la página de `@sparticuz/chromium` (https://www.npmjs.com/package/@sparticuz/chromium):
   ```bash
   npm install @sparticuz/chromium playwright-core@1.47.2
   ```
   Después de instalar, revisa que `package.json` contenga ambas dependencias.
2. Confirma con `vercel --prod` que el despliegue se construye sin errores.
3. En **Environment Variables** de Vercel añade `BCP_CHROMIUM=serverless`.
4. Vuelve a desplegar y prueba la importación de BCP. La primera importación tardará más, porque Chromium se descomprime en `/tmp`.
5. Si falla, pega el mensaje de error completo.

Esta ruta no se usa en local, donde sigue funcionando Playwright normal. No la he probado contra Vercel desde aquí.

## Limitaciones y riesgos

- **Arranque en frío:** la primera petición tras un periodo sin uso tarda varios segundos, y más si hay que arrancar Chromium.
- **Memoria:** con 2 GB, Chromium tiene margen limitado. Si una importación falla por memoria, el error aparecerá en los logs.
- **Tiempo máximo:** 300 segundos por petición. Las importaciones muy grandes pueden no caber.
- **Sin disco persistente:** lo que se escribe dentro del contenedor (la carpeta de depuración de BCP) se pierde. Los datos de la aplicación están en Neon.
- **Uso no comercial:** el plan Hobby es para uso personal y no comercial. Lee las condiciones antes de publicar la aplicación.
- **Coste:** revisa **Usage** en el panel de Vercel cada semana. Si aparece un cargo, para el despliegue o reduce la memoria.

## Lista de comprobación

- [ ] El plan Hobby y el registro de contenedores cubren la imagen (paso previo).
- [ ] La imagen se construye y arranca en local con `PORT=80`.
- [ ] Proyecto enlazado con `vercel link`.
- [ ] Variables de entorno en Production, sin `ADMIN_PASSWORD` al final.
- [ ] Memoria 2 GB y duración 300 s configuradas.
- [ ] `/api/health` responde `ok`.
- [ ] Probada una importación de BCP con un evento real.
