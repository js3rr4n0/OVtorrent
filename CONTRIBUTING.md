# Contribuir a OVtorrent

Gracias por tu interés. Estas reglas mantienen el proyecto fiel a sus restricciones.

## Reglas no negociables

1. **100 % web y estática.** Nada que necesite un proceso fuera del navegador en producción: ni backend, ni API propia, ni base de datos de servidor, ni Electron/Tauri, ni extensiones. Única excepción, opcional y autoalojada por el usuario: el puente de `bridge/` (ver `docs/BRIDGE.md`); la aplicación debe seguir funcionando sin él.
2. **Sin terceros obligatorios.** No añadas dependencias de servicios con cuenta, API key, pago, analítica o telemetría. Las dependencias npm deben ser open source con licencia compatible (MIT, Apache-2.0, BSD, ISC) y documentarse en `docs/LICENSES.md`.
3. **Honestidad técnica.** No simules funcionalidades que el navegador no pueda garantizar. Si algo no es posible, implementa la interfaz de capacidad, degrada funcionalmente, muestra un mensaje claro y documenta la evolución futura.
4. **Privacidad por defecto.** Nada sale del navegador salvo las conexiones P2P/HTTP necesarias para reproducir lo que el usuario pidió.
5. **Seguridad.** Valida toda entrada con Zod, sin `eval`, sin `new Function`, sin HTML arbitrario en metadatos, sin cargar scripts externos.
6. **`recap.md` es acumulativo.** Nunca borres entradas anteriores; añade una entrada al final de cada fase.

## Flujo de trabajo

```bash
npm install   # con npm 10 puede requerir: npm install --legacy-peer-deps (peers opcionales de Vitest 4)
npm run dev
npm run lint && npm run typecheck && npm run test && npm run build
npm run test:e2e   # opcional, requiere Chromium de Playwright
```

- TypeScript `strict: true`. Sin `any`.
- Formato con Prettier (`npm run format`).
- Añade tests para cada módulo nuevo. Usa los adapters falsos de `src/test/fakes` en lugar de torrents públicos.
- Las pantallas deben ser navegables con teclado y D-pad (foco visible, objetivos ≥ 48 px, sin dependencias de hover).
- Textos de interfaz en español.

## Estructura

Consulta `docs/ARCHITECTURE.md`. En resumen: `src/core` (lógica pura, sin React), `src/state` (stores Zustand con persistencia local), `src/features` (pantallas), `src/components` (UI reutilizable), `src/app` (shell, router, hooks globales), `src/test` (setup y fakes), `e2e` (Playwright).

## Pull requests

Describe qué restricción del proyecto podría verse afectada y cómo la has respetado. Incluye la salida de `lint`, `typecheck`, `test` y `build`.
