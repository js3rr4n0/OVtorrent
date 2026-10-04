import { useEffect, useState } from 'react';
import { Badge, Button, Card, Notice } from '@/components/ui';
import { formatBytes } from '@/components/format';
import { probeWebRtc, type WebRtcProbeResult } from '@/core/compat/webrtcProbe';
import { collectExtendedReport, type ExtendedReport } from './extendedReport';
export type { ExtendedReport } from './extendedReport';

function tri(v: boolean | null): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (v === null) return { tone: 'warn', text: 'n/d' };
  return v ? { tone: 'ok', text: 'sí' } : { tone: 'bad', text: 'no' };
}

export function ExtendedDiagnostics({ onReport }: { onReport?: (r: ExtendedReport) => void }) {
  const [report, setReport] = useState<ExtendedReport | null>(null);
  const [rtc, setRtc] = useState<WebRtcProbeResult | null>(null);
  const [rtcBusy, setRtcBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void collectExtendedReport().then((r) => {
      if (!active) return;
      setReport(r);
      onReport?.(r);
    });
    return () => {
      active = false;
    };
  }, [onReport]);

  const runRtc = async () => {
    setRtcBusy(true);
    try {
      setRtc(await probeWebRtc({ timeoutMs: 3000 }));
    } finally {
      setRtcBusy(false);
    }
  };

  if (!report) {
    return (
      <Card>
        <p role="status">Ejecutando pruebas de compatibilidad…</p>
      </Card>
    );
  }
  const persisted = tri(report.storagePersisted);
  return (
    <>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Memoria y procesos</h2>
        <ul className="text-sm tv:text-xl">
          <li>
            Memoria del dispositivo:{' '}
            {report.memory.deviceMemoryGb !== undefined
              ? `${report.memory.deviceMemoryGb} GB`
              : 'no expuesta'}{' '}
            {report.memory.lowMemory ? (
              <Badge tone="warn">poca memoria: ventana reducida automáticamente</Badge>
            ) : null}
          </li>
          <li>
            Heap JS en uso:{' '}
            {report.memory.usedJsHeapBytes !== undefined
              ? formatBytes(report.memory.usedJsHeapBytes)
              : 'no expuesto'}
            {report.memory.jsHeapLimitBytes !== undefined
              ? ` de ${formatBytes(report.memory.jsHeapLimitBytes)}`
              : ''}
          </li>
          <li>
            Worker de parsing y métricas:{' '}
            <Badge tone={report.worker.mode === 'worker' ? 'ok' : 'warn'}>
              {report.worker.mode === 'worker' ? 'activo' : 'hilo principal'}
            </Badge>
            {report.worker.roundTripMs !== null
              ? ` · ida y vuelta ${report.worker.roundTripMs} ms`
              : ''}
            {report.worker.error ? ` · ${report.worker.error}` : ''}
          </li>
          <li>
            Almacenamiento persistente concedido:{' '}
            <Badge tone={persisted.tone}>{persisted.text}</Badge>
            <span className="ovt-muted">
              {' '}
              (si es «no», el navegador puede borrar los datos locales bajo presión de espacio)
            </span>
          </li>
          <li>
            Service Worker:{' '}
            {report.serviceWorker.registered
              ? `registrado (${report.serviceWorker.state ?? '?'})`
              : 'no registrado'}
            {report.serviceWorker.registered
              ? report.serviceWorker.controlling
                ? ' · controla esta página'
                : ' · aún no controla esta página'
              : ''}
          </li>
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">
          Pruebas de decodificación (MediaCapabilities)
        </h2>
        <table className="w-full text-sm tv:text-lg">
          <thead>
            <tr className="ovt-muted text-left text-xs">
              <th>Perfil</th>
              <th>Soportado</th>
              <th>Fluido</th>
              <th>Eficiente</th>
            </tr>
          </thead>
          <tbody>
            {report.decode.map((p) => {
              const s = tri(p.supported);
              const sm = tri(p.smooth);
              const pe = tri(p.powerEfficient);
              return (
                <tr key={p.id}>
                  <td className="py-0.5">{p.label}</td>
                  <td>
                    <Badge tone={s.tone}>{s.text}</Badge>
                  </td>
                  <td>
                    <Badge tone={sm.tone}>{sm.text}</Badge>
                  </td>
                  <td>
                    <Badge tone={pe.tone}>{pe.text}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {report.decode[0]?.note ? (
          <p className="ovt-muted mt-1 text-xs">{report.decode[0].note}</p>
        ) : null}
        {report.decodeSummary.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm tv:text-lg">
            {report.decodeSummary.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : null}
        <p className="ovt-muted mt-2 text-xs">
          «Fluido» y «eficiente» son estimaciones del navegador para ese perfil; no garantizan la
          reproducción de un archivo concreto.
        </p>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Prueba de WebRTC</h2>
        <p className="mb-2 text-sm tv:text-lg">
          Crea una conexión local con un canal de datos y observa los candidatos ICE durante 3
          segundos. No contacta con ningún servidor STUN ni envía datos fuera del dispositivo.
        </p>
        <Button onClick={() => void runRtc()} disabled={rtcBusy}>
          {rtcBusy ? 'Probando…' : 'Probar WebRTC'}
        </Button>
        {rtc ? (
          <div className="mt-2">
            {rtc.supported ? (
              <Notice kind={rtc.dataChannel && rtc.hostCandidates > 0 ? 'success' : 'warning'}>
                DataChannel: {rtc.dataChannel ? 'sí' : 'no'} · candidatos host: {rtc.hostCandidates}{' '}
                · srflx: {rtc.srflxCandidates} · relay: {rtc.relayCandidates} · IPv6:{' '}
                {rtc.ipv6 ? 'sí' : 'no'} · {rtc.durationMs} ms
                {rtc.hostCandidates === 0
                  ? ' · Sin candidatos host: el navegador puede estar bloqueando WebRTC (política o extensión).'
                  : ''}
                {rtc.error ? ` · ${rtc.error}` : ''}
              </Notice>
            ) : (
              <Notice kind="error">{rtc.error ?? 'WebRTC no disponible'}</Notice>
            )}
          </div>
        ) : null}
      </Card>
    </>
  );
}
