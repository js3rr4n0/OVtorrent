# Accesibilidad

## Navegación por teclado y mando

- Todos los controles son elementos nativos (`button`, `a`, `input`, `select`) y se pueden operar con Tab/Enter.
- En **modo TV** (automático por user agent o manual), las teclas de flecha/D-pad mueven el foco al elemento más cercano en esa dirección (`src/core/tv/spatialNavigation.ts`), con fallback al orden del DOM en los bordes.
- Escape / Back / Backspace vuelven atrás (salvo dentro de campos de texto y diálogos, donde cierran el diálogo).
- Atajos en el reproductor: Espacio (play/pausa), F (pantalla completa), M (silencio), teclas multimedia.
- Enlace «Saltar al contenido» al principio de la página.

## Foco visible

`:focus-visible` muestra un contorno de 3 px (4 px + halo en modo TV, color ámbar sobre fondo oscuro).

## Tamaño y contraste

- Objetivos mínimos de 48 × 48 CSS px (`min-h-12 min-w-12`), obligatorios en modo TV.
- Modo TV: texto base de 20 px, alto contraste opcional (negro/blanco/ámbar).
- Tema claro y oscuro con `prefers-color-scheme` y selección manual.
- `prefers-reduced-motion` desactiva animaciones y transiciones.

## Semántica y ARIA

- Encabezados jerárquicos por pantalla y `document.title` actualizado.
- Pestañas de importación con `role="tablist"/"tab"/"tabpanel"`.
- Diálogos con `role="dialog"`, `aria-modal`, `aria-labelledby`, foco inicial en «Cancelar» y cierre con Escape.
- Avisos con `role="status"` o `role="alert"` según gravedad.
- Controles con `aria-label` descriptivo (por ejemplo «Adelantar 30 segundos») y `aria-pressed` para toggles.
- Indicadores del reproductor en una lista de definiciones (`dl`).

## Subtítulos

El reproductor admite subtítulos WebVTT locales mediante `<track>`. SRT se convertirá localmente en la Fase 3.

## Pendiente (Fase 4: auditoría de accesibilidad)

- Pruebas con lectores de pantalla (NVDA, VoiceOver, TalkBack en Android TV).
- Revisión de contraste con herramientas automáticas en ambos temas.
- Anuncios en vivo de cambios de estado del reproductor (`aria-live`).
