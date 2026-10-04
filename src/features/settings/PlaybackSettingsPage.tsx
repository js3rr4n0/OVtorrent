import { useState } from 'react';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Toggle,
} from '@/components/ui';
import { useBridgeState } from '@/state/bridgeStore';
import {
  DEFAULT_WEBSOCKET_TRACKERS,
  isWebSocketTracker,
  normalizeTrackerList,
} from '@/core/streaming/webtorrent/trackers';
import { formatBytes } from '@/components/format';
import {
  BUFFER_PRESET_VALUES,
  BUFFER_PRESETS,
  BUFFER_STORE_KINDS,
  estimateBufferBytes,
  MAX_MEMORY_BUFFER_BYTES,
  MAX_TRACKERS,
  QUALITY_MODES,
  QUALITY_PRIORITIES,
  RESOLUTIONS,
  resolveBufferWindow,
  type BufferPreset,
} from '@/core/schemas/settings';
import { useSettingsStore } from '@/state/settingsStore';

const PRESET_LABELS: Record<BufferPreset, string> = {
  'data-saver': 'Ahorro de datos',
  balanced: 'Balanceado',
  'stable-4k': '4K estable',
  custom: 'Personalizado',
};
const QUALITY_LABELS = {
  auto: 'Auto',
  'data-saver': 'Ahorro de datos',
  balanced: 'Balanceado',
  max: 'Máxima calidad',
} as const;
const PRIORITY_LABELS = {
  stability: 'Priorizar estabilidad',
  quality: 'Priorizar calidad',
  'fast-start': 'Priorizar inicio rápido',
} as const;
const STORE_LABELS = {
  'no-persistence': 'Sin persistencia (recomendado)',
  memory: 'Memoria RAM limitada',
  indexeddb: 'IndexedDB efímero (local)',
} as const;

export function PlaybackSettingsPage() {
  useDocumentTitle('Calidad y búfer');
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const window = resolveBufferWindow(settings);
  const estimate = estimateBufferBytes(settings.buffer.estimateBitrateKbps, window);
  const estimateInitial = estimateBufferBytes(settings.buffer.estimateBitrateKbps, {
    ...window,
    aheadSeconds: window.initialSeconds,
    behindSeconds: 0,
  });
  const overLimit = estimate > settings.buffer.memoryLimitBytes;

  return (
    <div>
      <PageHeader
        title="Calidad y búfer"
        subtitle="Controles honestos: el navegador no puede cambiar el bitrate real de un archivo único sin transcodificar, y esta aplicación no transcodifica ni en local ni en la nube."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Calidad</h2>
          <Field label="Modo" htmlFor="q-mode">
            <Select
              id="q-mode"
              value={settings.quality.mode}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  quality: { ...s.quality, mode: e.target.value as typeof s.quality.mode },
                }))
              }
            >
              {QUALITY_MODES.map((m) => (
                <option key={m} value={m}>
                  {QUALITY_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Resolución preferida"
            htmlFor="q-res"
            hint="Solo se aplica cuando existen varias versiones (480p/720p/1080p/4K) en la playlist o variantes HLS declaradas."
          >
            <Select
              id="q-res"
              value={settings.quality.preferredResolution}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  quality: {
                    ...s.quality,
                    preferredResolution: e.target.value as typeof s.quality.preferredResolution,
                  },
                }))
              }
            >
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 'auto' ? 'Auto' : r === '2160p' ? '2160p / 4K' : r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bitrate máximo preferido (kbps, 0 = sin límite)" htmlFor="q-max">
            <Input
              id="q-max"
              type="number"
              min={0}
              max={200000}
              value={settings.quality.maxBitrateKbps}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  quality: { ...s.quality, maxBitrateKbps: Number(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Bitrate mínimo aceptable (kbps, 0 = sin mínimo)" htmlFor="q-min">
            <Input
              id="q-min"
              type="number"
              min={0}
              max={200000}
              value={settings.quality.minBitrateKbps}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  quality: { ...s.quality, minBitrateKbps: Number(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Prioridad" htmlFor="q-prio">
            <Select
              id="q-prio"
              value={settings.quality.priority}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  quality: { ...s.quality, priority: e.target.value as typeof s.quality.priority },
                }))
              }
            >
              {QUALITY_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Notice kind="info">
            Un torrent 4K seguirá siendo 4K si no existen versiones alternativas. La aplicación no
            usa servicios cloud de transcodificación ni incluye un transcodificador local porque es
            100 % web.
          </Notice>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Búfer temporal</h2>
          <Field label="Preset" htmlFor="b-preset">
            <Select
              id="b-preset"
              value={settings.buffer.preset}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  buffer: { ...s.buffer, preset: e.target.value as BufferPreset },
                }))
              }
            >
              {BUFFER_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                  {p !== 'custom'
                    ? ` (${BUFFER_PRESET_VALUES[p].initialSeconds}s / ${BUFFER_PRESET_VALUES[p].aheadSeconds}s / ${BUFFER_PRESET_VALUES[p].behindSeconds}s)`
                    : ''}
                </option>
              ))}
            </Select>
          </Field>
          {settings.buffer.preset === 'custom' ? (
            <div className="grid grid-cols-3 gap-2">
              {(['initialSeconds', 'aheadSeconds', 'behindSeconds'] as const).map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      initialSeconds: 'Inicial (s)',
                      aheadSeconds: 'Futuro (s)',
                      behindSeconds: 'Histórico (s)',
                    }[k]
                  }
                  htmlFor={`b-${k}`}
                >
                  <Input
                    id={`b-${k}`}
                    type="number"
                    min={k === 'behindSeconds' ? 0 : 1}
                    max={k === 'aheadSeconds' ? 1800 : 600}
                    value={settings.buffer.custom[k]}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        buffer: {
                          ...s.buffer,
                          custom: { ...s.buffer.custom, [k]: Number(e.target.value) || 0 },
                        },
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          ) : null}
          <Field label="Dónde se guardan las piezas temporales" htmlFor="b-store">
            <Select
              id="b-store"
              value={settings.buffer.storeKind}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  buffer: { ...s.buffer, storeKind: e.target.value as typeof s.buffer.storeKind },
                }))
              }
            >
              {BUFFER_STORE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {STORE_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Límite de memoria para el búfer: ${formatBytes(settings.buffer.memoryLimitBytes)}`}
            htmlFor="b-mem"
          >
            <input
              id="b-mem"
              type="range"
              className="min-h-12 w-full"
              min={16 * 1024 * 1024}
              max={MAX_MEMORY_BUFFER_BYTES}
              step={16 * 1024 * 1024}
              value={settings.buffer.memoryLimitBytes}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  buffer: { ...s.buffer, memoryLimitBytes: Number(e.target.value) },
                }))
              }
            />
          </Field>
          <Field label="Bitrate asumido para la estimación (kbps)" htmlFor="b-bitrate">
            <Input
              id="b-bitrate"
              type="number"
              min={100}
              max={200000}
              value={settings.buffer.estimateBitrateKbps}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  buffer: { ...s.buffer, estimateBitrateKbps: Number(e.target.value) || 100 },
                }))
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Máx. peers" htmlFor="b-peers">
              <Input
                id="b-peers"
                type="number"
                min={1}
                max={200}
                value={settings.buffer.maxPeers}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    buffer: { ...s.buffer, maxPeers: Number(e.target.value) || 1 },
                  }))
                }
              />
            </Field>
            <Field label="Máx. solicitudes simultáneas" htmlFor="b-conc">
              <Input
                id="b-conc"
                type="number"
                min={1}
                max={64}
                value={settings.buffer.maxConcurrentRequests}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    buffer: { ...s.buffer, maxConcurrentRequests: Number(e.target.value) || 1 },
                  }))
                }
              />
            </Field>
          </div>
          <Notice kind={overLimit ? 'warning' : 'info'} title="Espacio temporal estimado">
            <p>
              Ventana ({window.behindSeconds}s histórico + {window.aheadSeconds}s futuro):{' '}
              <strong>{formatBytes(estimate)}</strong> · búfer inicial ({window.initialSeconds}s):{' '}
              {formatBytes(estimateInitial)}
            </p>
            <p className="mt-1 text-xs">
              espacio ≈ bitrate (bits/s) × segundos de búfer ÷ 8. El valor real varía según codec,
              contenedor, tamaño de pieza y overhead.
            </p>
            {overLimit ? (
              <p className="mt-1 font-medium">
                La ventana supera el límite de memoria: se eliminarán piezas antes de lo
                configurado.
              </p>
            ) : null}
          </Notice>
        </Card>
        <P2pCard />
      </div>
    </div>
  );
}

function P2pCard() {
  const bridge = useBridgeState();
  const p2p = useSettingsStore((s) => s.settings.p2p);
  const update = useSettingsStore((s) => s.update);
  const [draft, setDraft] = useState(p2p.customTrackers.join('\n'));
  const [trackerError, setTrackerError] = useState<string | null>(null);
  const saveTrackers = () => {
    const lines = draft
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const invalid = lines.filter((l) => !isWebSocketTracker(l));
    if (invalid.length > 0) {
      setTrackerError(`Solo se admiten trackers ws:// o wss://: ${invalid[0]}`);
      return;
    }
    if (lines.length > MAX_TRACKERS) {
      setTrackerError(`Máximo ${MAX_TRACKERS} trackers`);
      return;
    }
    setTrackerError(null);
    update((s) => ({ ...s, p2p: { ...s.p2p, customTrackers: normalizeTrackerList(lines) } }));
  };
  return (
    <Card className="md:col-span-2">
      <h2 className="mb-3 text-lg font-semibold">P2P (WebTorrent en navegador)</h2>
      <Toggle
        id="p2p-default-trackers"
        label="Usar los trackers WebSocket públicos por defecto"
        hint={`Son una dependencia del protocolo WebTorrent, no un servicio de esta aplicación: ${DEFAULT_WEBSOCKET_TRACKERS.join(', ')}`}
        checked={p2p.useDefaultTrackers}
        onChange={(v) => update((s) => ({ ...s, p2p: { ...s.p2p, useDefaultTrackers: v } }))}
      />
      <Toggle
        id="p2p-upload"
        label="Compartir piezas con otros peers mientras reproduces"
        hint="BitTorrent es recíproco: desactivarlo puede reducir la velocidad que otros peers te ofrecen."
        checked={p2p.uploadEnabled}
        onChange={(v) => update((s) => ({ ...s, p2p: { ...s.p2p, uploadEnabled: v } }))}
      />
      <Toggle
        id="p2p-restart"
        label="Reiniciar la sesión al superar el límite de memoria"
        hint="Libera todas las piezas descargadas y continúa desde la posición actual. Si lo desactivas, la memoria puede crecer hasta que el navegador cierre la pestaña."
        checked={p2p.restartOnMemoryLimit}
        onChange={(v) => update((s) => ({ ...s, p2p: { ...s.p2p, restartOnMemoryLimit: v } }))}
      />
      <Field label="Segundos sin peers antes de avisar" htmlFor="p2p-timeout">
        <Input
          id="p2p-timeout"
          type="number"
          min={5}
          max={300}
          value={p2p.noPeersTimeoutSeconds}
          onChange={(e) =>
            update((s) => ({
              ...s,
              p2p: { ...s.p2p, noPeersTimeoutSeconds: Number(e.target.value) || 30 },
            }))
          }
        />
      </Field>
      <Field
        label="Trackers WebSocket adicionales (uno por línea)"
        htmlFor="p2p-trackers"
        hint="ws:// o wss://. Los trackers UDP/HTTP no son accesibles desde un navegador."
        error={trackerError ?? undefined}
      >
        <textarea
          id="p2p-trackers"
          className="min-h-24 w-full rounded-md border border-[var(--ovt-border)] bg-[var(--ovt-surface)] p-2 font-mono text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <Button onClick={saveTrackers}>Guardar trackers</Button>
      <h3 className="mt-6 mb-2 text-base font-semibold">
        Puente OVtorrent (opcional, autoalojado)
      </h3>
      <p className="ovt-muted mb-2 text-sm tv:text-lg">
        Un navegador solo alcanza peers WebRTC. El puente es un programa gratuito que ejecutas tú en
        un PC o NAS (carpeta <code>bridge/</code> del proyecto): se conecta a los peers BitTorrent
        clásicos y te sirve el contenido por WebRTC. Con el puente emparejado basta con pegar un
        magnet y pulsar reproducir.
      </p>
      <pre className="ovt-surface mb-3 overflow-x-auto rounded p-2 text-xs">{`cd bridge && npm install && npm start -- --code TU-CODIGO`}</pre>
      <Field
        label="Código de emparejamiento"
        htmlFor="bridge-code"
        hint="El mismo que muestra el puente al arrancar (mínimo 6 caracteres). Vacío = sin puente."
      >
        <Input
          id="bridge-code"
          value={p2p.bridgeCode}
          maxLength={64}
          autoComplete="off"
          onChange={(e) => update((s) => ({ ...s, p2p: { ...s.p2p, bridgeCode: e.target.value } }))}
        />
      </Field>
      <p className="text-sm tv:text-lg" role="status">
        Estado del puente:{' '}
        {!p2p.bridgeCode.trim() ? (
          <Badge>desactivado</Badge>
        ) : bridge.connected ? (
          <Badge tone="ok">conectado{bridge.name ? ` (${bridge.name})` : ''}</Badge>
        ) : (
          <Badge tone="warn">emparejando… arranca el puente con este código</Badge>
        )}
        {bridge.torrents.length > 0 ? ` · ${bridge.torrents.length} torrent(s) en el puente` : ''}
        {bridge.lastError ? ` · ${bridge.lastError}` : ''}
      </p>
      <div className="mt-3">
        <Notice kind="info">
          Al reproducir, el navegador se conecta a los trackers WebSocket y a otros peers mediante
          WebRTC. Los peers y los servidores STUN usados por WebRTC pueden conocer tu IP pública; la
          aplicación no opera ningún servidor para ocultarla.
        </Notice>
      </div>
    </Card>
  );
}
