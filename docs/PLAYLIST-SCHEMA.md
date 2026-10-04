# Esquema de playlist (versión 1)

Las playlists se persisten únicamente en el almacenamiento local y se exportan/importan como JSON. El esquema está versionado y se valida con Zod (`src/core/schemas/playlist.ts`, modo `strict`: cualquier campo desconocido se rechaza).

```json
{
  "version": 1,
  "name": "Mi playlist local",
  "description": "",
  "items": [
    {
      "id": "uuid",
      "sourceType": "magnet",
      "source": "magnet:?xt=urn:btih:...",
      "title": "Contenido autorizado",
      "tags": [],
      "position": 0
    }
  ]
}
```

## Campos de la playlist

| Campo                    | Tipo     | Reglas                                        |
| ------------------------ | -------- | --------------------------------------------- |
| `version`                | `1`      | Obligatorio. Otras versiones se rechazan.     |
| `id`                     | UUID     | Opcional en importación; se genera uno local. |
| `name`                   | string   | 1–200 caracteres, sin `<` `>`.                |
| `description`            | string   | ≤ 1000 caracteres, opcional.                  |
| `items`                  | array    | ≤ 500 elementos.                              |
| `createdAt`, `updatedAt` | ISO 8601 | Opcionales.                                   |

## Campos de cada elemento

| Campo             | Tipo                                                  | Reglas                                                                                                                                 |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | UUID                                                  | Obligatorio; se regenera si colisiona.                                                                                                 |
| `sourceType`      | `magnet` · `torrent` · `file` · `url` · `hls` · `m3u` | Obligatorio.                                                                                                                           |
| `source`          | string                                                | 1–4096 caracteres. Validación por tipo: magnet válido (`urn:btih`), URL `http(s)`/`blob` sin credenciales, nombre de archivo no vacío. |
| `title`           | string                                                | 1–200, sin HTML ni caracteres de control.                                                                                              |
| `description`     | string                                                | ≤ 1000, opcional.                                                                                                                      |
| `tags`            | string[]                                              | ≤ 20 etiquetas de ≤ 32 caracteres.                                                                                                     |
| `position`        | entero ≥ 0                                            | Se renumera al importar.                                                                                                               |
| `durationSeconds` | número ≥ 0                                            | Opcional, introducido por el usuario.                                                                                                  |
| `qualityLabel`    | string ≤ 16                                           | Opcional (`480p`, `1080p`, `2160p`…). Permite ofrecer selección de calidad entre variantes del mismo título.                           |

Tipos de fuente: `magnet` y `torrent` (P2P), `file` (archivo local, solo nombre), `url` (archivo http(s) directo), `hls` (playlist `.m3u8`, reproducida de forma nativa o con hls.js), `m3u` (reservado; las listas M3U se importan como elementos individuales).
| `addedAt` | ISO 8601 | Opcional. |

## Comportamiento del importador

1. Rechaza archivos > 2 MB y JSON mal formado.
2. Rechaza claves peligrosas en cualquier nivel: `script`, `html`, `onload`, `onerror`, `eval`, `__proto__`, `constructor`, `prototype`.
3. Valida la estructura y muestra **errores por campo** (`items.3.source: Magnet link no válido`).
4. Limita el número de elementos (500) y pide confirmación a partir de 50.
5. No ejecuta ningún valor importado ni lo envía a ningún servicio.
6. Permite cancelar antes de guardar.

## Exportación

El JSON exportado omite el `id` local de la playlist para que sea portable. Se descarga como archivo mediante una Blob URL; nunca se envía a un servidor.

## Bundle completo

Ajustes → Almacenamiento exporta un documento `{"format":"ovtorrent-export","version":1,...}` con `settings`, `library`, `playlists`, `favorites` e `history`, validado con el mismo rigor al importar (`src/core/schemas/export.ts`).
