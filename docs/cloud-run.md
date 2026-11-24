# Despliegue en Google Cloud Run (gratis dentro del cupo)

Cloud Run ejecuta la aplicación en un contenedor que solo consume cuando alguien la usa. La base de datos va en **Neon** (gratuita, ver `docs/despliegue-gratuito.md`, opción A, paso 1).

> **Importante antes de empezar**
> - El cupo gratuito de Cloud Run se aplica a regiones concretas de **Estados Unidos**. Esta guía usa `us-central1`. Antes de desplegar, confirma en https://cloud.google.com/run/pricing que tu región está en el nivel gratuito.
> - Google pide una **cuenta de facturación con tarjeta**. Si te mantienes dentro del cupo no se cobra nada, pero conviene poner una alerta de presupuesto (paso 2).
> - Los límites del cupo cambian. Revísalos en la página de precios antes de desplegar.

---

## 1 · Preparar Google Cloud

1. Crea una cuenta en https://cloud.google.com y activa la facturación. El crédito de bienvenida, si lo tienes, cubre cualquier error de configuración.
2. Instala la herramienta de línea de comandos `gcloud`: https://cloud.google.com/sdk/docs/install
3. Inicia sesión y crea un proyecto (el identificador debe ser único en el mundo):
   ```bash
   gcloud auth login
   gcloud projects create cobrador-torneos-TU_NOMBRE --name="Cobrador Torneos"
   gcloud config set project cobrador-torneos-TU_NOMBRE
   ```
4. Vincula la facturación. Lista tus cuentas y copia el identificador de la que uses:
   ```bash
   gcloud billing accounts list
   gcloud billing projects link cobrador-torneos-TU_NOMBRE --billing-account=ID_DE_FACTURACION
   ```
5. Activa las APIs necesarias:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

## 2 · Alerta de presupuesto (obligatoria)

1. En la consola de Google Cloud, ve a **Facturación → Presupuestos y alertas → Crear presupuesto**.
2. Ámbito: tu proyecto. Importe: **1 €** (o el que quieras).
3. Umbrales de alerta: 50 %, 90 % y 100 %. Activa las notificaciones por correo.

La alerta **avisa, pero no detiene** el servicio. Revisa la facturación cada semana durante el primer mes.

## 3 · Base de datos en Neon

Si aún no la tienes:
1. Crea un proyecto en https://neon.tech.
2. Copia la cadena de conexión y **quita `?sslmode=require`** del final. Ese valor será `DATABASE_URL`.

## 4 · Desplegar la aplicación

Desde la carpeta del proyecto (la que contiene el `Dockerfile`):

```bash
gcloud run deploy cobrador-torneos \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --concurrency 2 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,PGSSL=true,DATABASE_URL=POSTGRES_URL_DE_NEON,JWT_SECRET=TU_SECRETO,ADMIN_USERNAME=admin,ADMIN_PASSWORD=TU_CONTRASEÑA"
```

Qué significa cada opción:

| Opción | Motivo |
|---|---|
| `--source .` | Cloud Build construye la imagen desde el `Dockerfile` del proyecto |
| `--memory 2Gi` | Chromium necesita memoria. Con menos, la importación de BCP puede fallar |
| `--concurrency 2` | Pocas peticiones a la vez por instancia, para no saturar la memoria |
| `--min-instances 0` | La aplicación se apaga cuando no se usa: así no consume el cupo |
| `--max-instances 1` | Evita que se creen varias instancias y consuman el cupo más deprisa |
| `--timeout 300` | La importación de BCP puede tardar más de los 60 segundos por defecto |

**Consejo:** si la importación de BCP es poco frecuente, prueba con `--memory 1Gi`. Consume la mitad del cupo de memoria, pero Chromium puede quedarse corto en eventos grandes. Compruébalo en tu primera importación.

La primera construcción tarda varios minutos. Al final, `gcloud` muestra la URL del servicio, con esta forma:
`https://cobrador-torneos-xxxxx-uc.a.run.app`

## 5 · Comprobar

1. Abre `https://TU-URL/api/health`. Debe responder `{"ok":true,...}`.
2. Mira los logs si algo falla:
   ```bash
   gcloud run services logs read cobrador-torneos --region us-central1 --limit 100
   ```
   Deben aparecer las migraciones y `Superadministrador "…" creado` (solo la primera vez).

## 6 · Puesta en marcha

1. Entra en la web con el usuario administrador.
2. Crea los usuarios y sube el Excel de datos de meta (primero **Validar**, luego **Guardar datos**).
3. Prueba una importación de BCP con un evento real.
4. **Elimina `ADMIN_PASSWORD`** del servicio:
   ```bash
   gcloud run services update cobrador-torneos --region us-central1 --remove-env-vars ADMIN_PASSWORD
   ```
   Eso crea una nueva revisión sin esa variable.

## 7 · Actualizar la aplicación

Cuando cambies el código, repite el despliegue del paso 4 con el mismo comando. Las variables de entorno se mantienen. Las migraciones se aplican solas al arrancar.

## 8 · Puntos a tener en cuenta

- **Arranque en frío:** al estar apagada, la primera visita tarda varios segundos (más si arranca Chromium).
- **Sin disco persistente:** los ficheros que se escriben dentro del contenedor (por ejemplo, la carpeta de depuración de BCP) se pierden al reiniciarse. Todos los datos de la aplicación están en Neon.
- **Variables visibles:** las variables que pasas con `--set-env-vars` se ven en la consola de Cloud Run. Si quieres ocultarlas, usa **Secret Manager** (https://cloud.google.com/secret-manager) y `--set-secrets`.
- **Coste:** revisa el cupo en **Facturación → Informes**. Si ves cargos, reduce `--memory` o `--max-instances`, o desactiva el servicio con `gcloud run services delete cobrador-torneos --region us-central1`.

## Lista de comprobación

- [ ] Proyecto creado y facturación vinculada.
- [ ] Alerta de presupuesto configurada.
- [ ] Región `us-central1` confirmada como nivel gratuito.
- [ ] Base de datos en Neon, con `DATABASE_URL` sin `sslmode`.
- [ ] `/api/health` responde `ok`.
- [ ] Entras como administrador y subes el Excel de meta.
- [ ] Probada una importación de BCP.
- [ ] `ADMIN_PASSWORD` eliminado del servicio.
