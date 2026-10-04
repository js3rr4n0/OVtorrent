# Auditoría de accesibilidad (Fase 4)

Fecha: 2026-10-04. Herramientas: axe-core (`@axe-core/playwright`, reglas WCAG 2.0/2.1 A y AA más buenas prácticas) sobre todas las pantallas en modo escritorio y modo TV, más revisión manual con teclado y D-pad.

## Ejecución automática

`e2e/a11y.spec.ts` recorre `/`, `/import`, `/playlists`, `/history`, `/settings`, `/settings/playback`, `/settings/storage`, `/settings/tv`, `/diagnostics`, `/about`, el reproductor y el modo TV. Las violaciones con impacto `serious` o `critical` hacen fallar la suite; las menores se registran en la consola del test para revisión manual.

```bash
npm run build
npm run test:e2e -- e2e/a11y.spec.ts
```

Resultado en la fecha de la auditoría: **0 violaciones graves o críticas** en todas las rutas y modos (ver `recap.md`).

## Revisión manual

| Criterio                        | Estado    | Notas                                                                                                                                    |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Navegación completa por teclado | Cumple    | Tab/Enter en todos los controles; sin trampas de foco. Diálogos cierran con Escape y devuelven el foco al disparador tras cerrarse.      |
| Navegación por D-pad (modo TV)  | Cumple    | Flechas mueven el foco espacialmente con fallback al orden del DOM; Back/Escape vuelve atrás.                                            |
| Foco visible                    | Cumple    | Contorno de 3 px (4 px + halo en TV).                                                                                                    |
| Objetivos táctiles/foco ≥ 48 px | Cumple    | Botones, enlaces de navegación, inputs y checkboxes con `min-h-12`/`min-w-12`.                                                           |
| Contraste de texto              | Cumple AA | Tema claro y oscuro revisados; modo TV con alto contraste (negro/blanco/ámbar).                                                          |
| Etiquetas de formulario         | Cumple    | Todos los `input`/`select`/`textarea` tienen `<label for>` o `aria-label`.                                                               |
| Mensajes de estado y error      | Cumple    | `role="status"`/`role="alert"`; errores de campo asociados visualmente al campo.                                                         |
| Encabezados y landmarks         | Cumple    | `nav` con `aria-label`, `main` con enlace «Saltar al contenido», un `h1` por pantalla, `document.title` actualizado.                     |
| Reproductor                     | Cumple    | Controles con `aria-label` y `aria-pressed`; indicadores en `dl`; subtítulos mediante `<track>`; panel simplificado con `aria-expanded`. |
| Movimiento reducido             | Cumple    | `prefers-reduced-motion` desactiva transiciones.                                                                                         |
| Lectores de pantalla            | Parcial   | Verificado con el árbol de accesibilidad de Chromium (Playwright). Pendiente prueba con NVDA/VoiceOver/TalkBack en dispositivos reales.  |

## Correcciones aplicadas durante la auditoría

- Las listas virtualizadas conservan la semántica de lista y mantienen visible la fila enfocada al navegar con teclado.
- Las secciones de exportación usan `fieldset`/`legend`.
- La tabla de pruebas de decodificación lleva encabezados de columna.

## Pendiente

- Pruebas con lectores de pantalla en Android TV (TalkBack) y Safari (VoiceOver).
- Anuncios `aria-live` de cambios de estado de reproducción más granulares (actualmente los avisos usan `role="status"`).
