# Sistema de diseño · El Cobrador del Waaagh

**Decisión:** sistema **1 · Cartel de club** (aprobado).
Este documento es la referencia para todas las páginas del proyecto. Antes de añadir una pantalla o un componente, comprueba que encaja aquí; si no encaja, actualiza este archivo primero.

## Carácter

Cartel de feria y señalización industrial. Negro sobre amarillo, tipografía de impacto, sombras duras y ninguna esquina redondeada. La app es una herramienta de trabajo para preparar torneos: debe leerse rápido, con datos claros y acciones evidentes.

## Colores

| Token            | Valor     | Uso                                              |
|------------------|-----------|--------------------------------------------------|
| `--yellow`       | `#f5c518` | Fondo de página, bordes de tarjetas, acento      |
| `--yellow-hi`    | `#ffe066` | Brillo del fondo (solo degradado)                |
| `--yellow-dark`  | `#c99700` | Sombra del fondo (solo degradado)                |
| `--ink`          | `#111111` | Texto sobre amarillo, cabecera, sombras, bordes  |
| `--card`         | `#141414` | Tarjetas y paneles                               |
| `--field`        | `#000000` | Fondo de campos de texto                         |
| `--paper`        | `#fff5d1` | Texto sobre tarjetas                             |
| `--muted`        | `#d8c77a` | Texto secundario sobre tarjetas y tablas         |
| `--ink-soft`     | `#3d3500` | Texto secundario sobre el fondo amarillo (7:1)   |
| `--danger`       | `#ff8a6b` | Errores y acciones destructivas                  |
| `--focus`        | `#ffffff` | Foco sobre fondos oscuros (ver Accesibilidad)    |

Regla: el texto sobre amarillo siempre es negro; el texto sobre negro siempre es crema o amarillo.

## Tipografía

- **Títulos, botones y cabeceras de tabla:** Impact (alternativa: Haettenschweiler, Arial Narrow Bold). Siempre en mayúsculas.
- **Texto, campos y etiquetas:** `system-ui` (la fuente del sistema). Las etiquetas no van en mayúsculas para favorecer la lectura.
- No se cargan fuentes externas.

## Formas y espaciado

- Esquinas rectas (`border-radius: 0`).
- Bordes: 3 o 4 px en tarjetas y botones, 2 px en campos.
- Sombra dura desplazada: `6px 6px 0 #111` en tarjetas, `4px 4px 0 #111` en botones.
- Escala de espaciado de 4 px.

## Componentes

- **Botón principal:** amarillo, borde y sombra negros, mayúsculas. Al pasar el cursor pasa a blanco. Al pulsarlo se desplaza 2 px.
- **Botón destructivo:** fondo negro, texto y borde en `--danger`. Al pasar el cursor se rellena.
- **Botones de navegación:** contorno crema; el activo se rellena de amarillo.
- **Tarjeta / fila de torneo:** fondo negro, borde amarillo, sombra dura. En escritorio, nombre a la izquierda y acción a la derecha; en móvil, apilado.
- **Campos:** fondo negro, borde amarillo de 2 px, altura mínima de 48 px.
- **Mensajes:** bloque negro con texto de color. Error en `--danger`, confirmación en amarillo.
- **Tablas:** tarjeta negra con borde amarillo. En móvil cada fila se convierte en tarjeta.

## Logo

- Archivo: `public/img/logo.png`. Se muestra completo, sin recortar ni cambiar colores.
- En cabecera: 52 px de alto, con borde amarillo.
- En login: 150 px de ancho máximo, con borde amarillo.
- Como favicon: el mismo archivo.

## Layout y responsive

- Ancho máximo de contenido: 1100 px.
- Breakpoints: 640 px (listas de dos columnas), 700 px (tablas en tarjetas), 800 px (formularios y paneles en dos columnas).
- En móvil todo se apila. Los botones de formulario ocupan todo el ancho.
- Ninguna pantalla debe requerir desplazamiento horizontal. Las tablas, si no caben, se desplazan dentro de su contenedor.

## Accesibilidad

- Contraste: texto normal al menos 4,5:1 y controles al menos 3:1 (WCAG AA). Verificar con herramienta antes de cada versión.
- Foco visible en todos los controles: 3 px. Negro sobre fondos claros, blanco sobre fondos oscuros.
- Cada campo tiene su etiqueta visible. El placeholder nunca sustituye a la etiqueta.
- Errores: se anuncian con `role="alert"` y el campo se marca con `aria-invalid`.
- Áreas táctiles de al menos 44 px (48 px en botones y campos).
- Las franjas y adornos son decorativos y no transmiten información.
- Sin animaciones obligatorias; se respeta `prefers-reduced-motion`.

## Lenguaje de la app

Textos en español neutro, tratando al usuario de tú. Verbos de acción claros: "Crear torneo", "Eliminar", "Entrar". Los nombres de las acciones siempre describen lo que ocurre.

## Qué evitar

- Esquinas redondeadas o sombras suaves: rompen el carácter del cartel.
- Más de un color de acento a la vez.
- Mayúsculas en párrafos o etiquetas largas.
- Texto amarillo sobre fondo amarillo o crema sobre blanco.
