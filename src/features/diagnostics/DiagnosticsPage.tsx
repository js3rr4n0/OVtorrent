import { useEffect, useMemo, useState } from 'react';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { useTvDetection } from '@/app/hooks/useTvMode';
import { Badge, Button, Card, Notice, PageHeader } from '@/components/ui';
import { formatBytes } from '@/components/format';
import { detectCodecSupport } from '@/core/media/compat';
import {
  deviceMemoryGb,
  hasAudioTracksApi,
  hasFileSystemAccess,
  hasMseForHls,
  hasNativeHls,
  hasFullscreen,
  hasIndexedDb,
  hasManagedMediaSource,
  hasMediaSource,
  hasPictureInPicture,
  hasRTCDataChannel,
  hasServiceWorker,
  hasWebRTC,
  hasWebWorkers,
  networkInfo,
  storageEstimate,
} from '@/core/streaming/capabilities';
import { isLocalStorageAvailable } from '@/core/storage/StorageAdapter';
import { sessionCleanup } from '@/core/cleanup/SessionCleanup';

function describeOs(ua: string): string {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/Tizen/i.test(ua)) return 'Tizen';
  if (/webOS|Web0S/i.test(ua)) return 'webOS';
  return 'Desconocido';
}

function describeBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome / Chromium';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return 'Desconocido';
}

export function DiagnosticsPage() {
  useDocumentTitle('Diagnóstico');
  const tv = useTvDetection();
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number }>({});
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void storageEstimate().then(setEstimate);
  }, []);

  const report = useMemo(() => {
    const ua = navigator.userAgent;
    const checks = [
      { label: 'WebRTC (RTCPeerConnection)', ok: hasWebRTC(), critical: true },
      { label: 'WebRTC DataChannel', ok: hasRTCDataChannel(), critical: true },
      { label: 'MediaSource Extensions', ok: hasMediaSource(), critical: true },
      { label: 'ManagedMediaSource (iOS 17+)', ok: hasManagedMediaSource(), critical: false },
      { label: 'HLS nativo (<video> con .m3u8)', ok: hasNativeHls(), critical: false },
      { label: 'HLS mediante hls.js (MediaSource)', ok: hasMseForHls(), critical: false },
      {
        label: 'Pistas de audio alternativas (AudioTrackList)',
        ok: hasAudioTracksApi(),
        critical: false,
      },
      { label: 'IndexedDB', ok: hasIndexedDb(), critical: false },
      { label: 'localStorage', ok: isLocalStorageAvailable(), critical: false },
      { label: 'Service Worker', ok: hasServiceWorker(), critical: false },
      { label: 'Picture-in-picture', ok: hasPictureInPicture(), critical: false },
      { label: 'Pantalla completa', ok: hasFullscreen(), critical: false },
      { label: 'Web Workers', ok: hasWebWorkers(), critical: false },
      { label: 'File System Access API', ok: hasFileSystemAccess(), critical: false },
      {
        label: 'Contexto seguro (HTTPS/localhost)',
        ok: Boolean(window.isSecureContext),
        critical: false,
      },
    ];
    const codecs = detectCodecSupport();
    const limitations: string[] = [];
    if (!hasWebRTC() || !hasRTCDataChannel())
      limitations.push(
        'Sin WebRTC DataChannels no es posible el streaming P2P desde el navegador.',
      );
    if (!hasMediaSource())
      limitations.push(
        'Sin MediaSource Extensions solo es posible la reproducción progresiva de archivos completos.',
      );
    if (!hasNativeHls() && !hasMseForHls())
      limitations.push('HLS no disponible: ni soporte nativo ni MediaSource para hls.js.');
    if (!hasAudioTracksApi())
      limitations.push(
        'El navegador no expone pistas de audio alternativas en archivos locales/URLs; en HLS las gestiona hls.js.',
      );
    if (!hasServiceWorker())
      limitations.push(
        'Sin Service Worker la interfaz no funcionará offline ni se podrá instalar como PWA.',
      );
    if (!window.isSecureContext)
      limitations.push(
        'Fuera de un contexto seguro (HTTPS) muchas APIs (Service Worker, PiP, WebRTC) están deshabilitadas.',
      );
    if (!codecs.find((c) => c.id === 'mp4-h264')?.supported)
      limitations.push(
        'H.264/AAC no se reporta como soportado: la mayoría del contenido MP4 no se reproducirá.',
      );
    if (!codecs.find((c) => c.id === 'hevc')?.supported)
      limitations.push(
        'HEVC (H.265) no soportado: los archivos 4K HEVC no se reproducirán y no hay transcodificación.',
      );
    if (!codecs.find((c) => c.id === 'av1')?.supported)
      limitations.push('AV1 no soportado por este navegador/hardware.');
    const mem = deviceMemoryGb();
    if (mem !== undefined && mem <= 2)
      limitations.push(
        `Memoria aproximada baja (${mem} GB): usa el preset «Ahorro de datos» y el almacén sin persistencia.`,
      );
    const net = networkInfo();
    if (net.saveData) limitations.push('El navegador tiene activado el ahorro de datos.');
    return {
      ua,
      browser: describeBrowser(ua),
      os: describeOs(ua),
      screen: `${window.screen.width}×${window.screen.height} (viewport ${window.innerWidth}×${window.innerHeight}, DPR ${window.devicePixelRatio})`,
      checks,
      codecs,
      net,
      mem,
      limitations,
      tv,
    };
  }, [tv]);

  const copy = async () => {
    const text = JSON.stringify(
      {
        ...report,
        estimate,
        cleanupHistory: sessionCleanup.history(),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Diagnóstico del dispositivo"
        subtitle="Capacidades reales detectadas en este navegador. Nada se envía a ningún servidor; el informe solo se copia al portapapeles si tú lo pides."
        actions={
          <Button onClick={() => void copy()}>{copied ? 'Copiado' : 'Copiar informe'}</Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Entorno</h2>
          <ul className="text-sm tv:text-xl">
            <li>Navegador: {report.browser}</li>
            <li>Sistema operativo: {report.os}</li>
            <li>Pantalla: {report.screen}</li>
            <li>Plataforma TV: {report.tv.isTv ? `sí (${report.tv.platform})` : 'no detectada'}</li>
            <li>
              Conexión: {report.net.effectiveType ?? 'no expuesta'}
              {report.net.downlinkMbps ? ` · ~${report.net.downlinkMbps} Mbps` : ''}
            </li>
            <li>
              Memoria aproximada: {report.mem !== undefined ? `${report.mem} GB` : 'no expuesta'}
            </li>
            <li>
              Almacenamiento: {estimate.usage !== undefined ? formatBytes(estimate.usage) : 'n/d'}
              {estimate.quota !== undefined ? ` / ${formatBytes(estimate.quota)}` : ''}
            </li>
          </ul>
          <p className="ovt-muted mt-2 break-all text-xs">{report.ua}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">APIs</h2>
          <ul className="grid grid-cols-1 gap-1 text-sm tv:text-xl">
            {report.checks.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-2">
                <span>{c.label}</span>
                <Badge tone={c.ok ? 'ok' : c.critical ? 'bad' : 'warn'}>{c.ok ? 'sí' : 'no'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Codecs y formatos</h2>
          <ul className="grid grid-cols-1 gap-1 text-sm tv:text-xl">
            {report.codecs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.label}
                  {c.note ? <span className="ovt-muted block text-xs">{c.note}</span> : null}
                </span>
                <Badge
                  tone={c.result === 'probably' ? 'ok' : c.result === 'maybe' ? 'warn' : 'bad'}
                >
                  {c.result}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="ovt-muted mt-2 text-xs">
            «maybe» significa que el navegador no garantiza el soporte. Si un formato no es
            compatible no se promete conversión automática.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Limitaciones detectadas</h2>
          {report.limitations.length === 0 ? (
            <Notice kind="success">
              No se detectaron limitaciones críticas. Esto no garantiza la reproducción de todo el
              contenido.
            </Notice>
          ) : (
            <ul className="list-disc pl-5 text-sm tv:text-xl">
              {report.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
