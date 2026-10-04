# Pruebas

## Principio

**No se depende de torrents públicos ni de red en ningún test.** Toda la lógica de streaming se prueba contra adapters falsos (`src/test/fakes`):

- `FakeStreamingEngine` / `FakeStreamingSession`: simulan capacidades, peers, errores de codec y el ciclo de vida de una sesión.
- `FakeBufferStore`: registra llamadas y aplica la política de ventanas en memoria.
- `FakeMediaAdapter`: simula un elemento multimedia (tiempo, duración, `canPlayType`).
- `FakeStorageAdapter`: adapter en memoria que puede simular fallos de escritura (cuota).

`fake-indexeddb` sustituye IndexedDB en jsdom para probar `IndexedDbBufferStore`.

## Unitarias e integración (Vitest + React Testing Library)

```bash
npm run test          # una pasada
npm run test:watch
```

Cobertura actual (`src/**/__tests__`):

| Área                    | Casos                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importación de magnet   | hex, base32, v2 rechazado, HTML en `dn`, trackers WebSocket                                                                                                                                                                             |
| Validación de torrent   | bencode multi/single file, hash SHA-1, trackers, entradas corruptas y sobredimensionadas                                                                                                                                                |
| Importación JSON        | válido, JSON roto, errores por campo, claves prohibidas, `javascript:`, versión, límites y confirmación                                                                                                                                 |
| Seguridad               | esquemas URL, credenciales, sanitización de texto y etiquetas                                                                                                                                                                           |
| Búfer                   | memoria (ventana, expulsión por límite), IndexedDB, sin persistencia, política de ventanas                                                                                                                                              |
| Stores                  | ajustes (persistencia, datos corruptos, fallo de escritura), biblioteca, playlists (crear/editar/duplicar/reordenar/borrar), historial                                                                                                  |
| Exportación/importación | bundle completo, claves prohibidas, borrados parciales y total                                                                                                                                                                          |
| Streaming               | ausencia de WebRTC/MediaSource, resolución de motor, errores de peer y codec con fakes, motor HTML5 (object URLs, stop libera recursos)                                                                                                 |
| Limpieza                | razones, ciclo de vida (`pagehide`, `beforeunload`, `hidden`), aislamiento de fallos                                                                                                                                                    |
| TV                      | detección por user agent, navegación espacial, teclas de retroceso                                                                                                                                                                      |
| Pantallas               | biblioteca, importación de magnet y JSON, playlists, ajustes de calidad/búfer, almacenamiento (restablecimiento), reproductor (magnet sin motor, archivo sin seleccionar, URL con controles), diagnóstico, navegación por teclado/D-pad |

## End-to-end (Playwright)

```bash
npm run build
npm run test:e2e
```

`playwright.config.ts` levanta `npm run preview` y ejecuta `e2e/app.spec.ts` en Chromium: carga con hash routing y sin peticiones a terceros, recarga en rutas profundas, importación y persistencia de magnet con aviso de Fase 2, creación y exportación de playlist, navegación D-pad en modo TV, borrado total de datos, funcionamiento offline de la interfaz y pantalla de diagnóstico.

Si Playwright no encuentra su Chromium, define `PLAYWRIGHT_CHROMIUM_PATH` con la ruta a un ejecutable de Chromium.

## Calidad estática

```bash
npm run lint       # ESLint (incluye no-eval / no-new-func)
npm run typecheck  # TypeScript strict
npm run format:check
```

## Pendiente por fase

- Fase 2: tests del motor WebTorrent con fakes de tracker/peer, prioridad secuencial y limpieza avanzada.
- Fase 3: parsers M3U/M3U8, HLS multivariant, conversión SRT→VTT.
- Fase 4: pruebas de compatibilidad, auditoría de seguridad y accesibilidad.
