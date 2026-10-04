import { Badge } from '@/components/ui';
import { formatBytes, formatSpeed } from '@/components/format';
import type { StreamingMetrics } from '@/core/streaming';

export function PlayerIndicators({
  metrics,
  engine,
  state,
  bufferUsage,
}: {
  metrics: StreamingMetrics | null;
  engine: string;
  state: string;
  bufferUsage?: { bytes: number; limitBytes: number; kind: string };
}) {
  const res = metrics?.resolution;
  return (
    <dl
      className="ovt-surface grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg p-3 text-sm md:grid-cols-4 tv:text-xl"
      aria-label="Indicadores"
    >
      <Row label="Estado">
        <Badge tone={state === 'error' ? 'bad' : state === 'playing' ? 'ok' : 'neutral'}>
          {state}
        </Badge>
      </Row>
      <Row label="Motor">{engine}</Row>
      <Row label="Resolución">{res ? `${res.width}×${res.height}` : 'n/d'}</Row>
      <Row label="Bitrate">
        {metrics?.bitrateKbps
          ? `${Math.round(metrics.bitrateKbps)} kbps`
          : 'n/d (no se puede medir sin datos del motor)'}
      </Row>
      <Row label="Buffering">{metrics?.isBuffering ? <Badge tone="warn">sí</Badge> : 'no'}</Row>
      <Row label="Búfer adelante">{metrics ? `${metrics.bufferedSeconds.toFixed(1)} s` : '—'}</Row>
      <Row label="Peers">{engine === 'html5' ? 'n/a (sin P2P)' : (metrics?.peers ?? '—')}</Row>
      <Row label="Velocidad">
        {engine === 'html5' ? 'n/a' : formatSpeed(metrics?.downloadSpeedBps ?? 0)}
      </Row>
      <Row label="Disponibilidad">
        {metrics && Number.isFinite(metrics.availability)
          ? `${Math.round(metrics.availability * 100)} %`
          : 'n/d'}
      </Row>
      <Row label="Caché temporal">
        {bufferUsage ? `${formatBytes(bufferUsage.bytes)} (${bufferUsage.kind})` : '—'}
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="ovt-muted text-xs tv:text-base">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
