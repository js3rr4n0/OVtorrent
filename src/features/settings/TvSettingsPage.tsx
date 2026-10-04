import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { useTvDetection } from '@/app/hooks/useTvMode';
import { Card, Field, Notice, PageHeader, Select, Toggle } from '@/components/ui';
import { useSettingsStore } from '@/state/settingsStore';

export function TvSettingsPage() {
  useDocumentTitle('Modo TV');
  const tv = useSettingsStore((s) => s.settings.tv);
  const update = useSettingsStore((s) => s.update);
  const detection = useTvDetection();

  return (
    <div>
      <PageHeader
        title="Modo TV y TV boxes"
        subtitle="Navegación con D-pad o teclas de flecha, foco visible, objetivos de 48×48 px, texto grande y alto contraste. Sin dependencias de hover."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Field
            label="Activación"
            htmlFor="tv-mode"
            hint={`Detección por user agent: ${detection.isTv ? 'sí' : 'no'} (${detection.reason}).`}
          >
            <Select
              id="tv-mode"
              value={tv.mode}
              onChange={(e) =>
                update((s) => ({ ...s, tv: { ...s.tv, mode: e.target.value as typeof s.tv.mode } }))
              }
            >
              <option value="auto">Automático (según user agent)</option>
              <option value="on">Siempre activado</option>
              <option value="off">Siempre desactivado</option>
            </Select>
          </Field>
          <Toggle
            id="tv-large"
            label="Texto grande"
            checked={tv.largeText}
            onChange={(v) => update((s) => ({ ...s, tv: { ...s.tv, largeText: v } }))}
          />
          <Toggle
            id="tv-contrast"
            label="Alto contraste"
            checked={tv.highContrast}
            onChange={(v) => update((s) => ({ ...s, tv: { ...s.tv, highContrast: v } }))}
          />
          <Toggle
            id="tv-hide-diag"
            label="Ocultar diagnósticos en el reproductor"
            checked={tv.hideDiagnostics}
            onChange={(v) => update((s) => ({ ...s, tv: { ...s.tv, hideDiagnostics: v } }))}
          />
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Teclas</h2>
          <ul className="text-sm tv:text-xl">
            <li>Flechas / D-pad: mover el foco</li>
            <li>Enter / OK: activar</li>
            <li>Escape / Back / Backspace: volver atrás</li>
            <li>Espacio: reproducir / pausar en el reproductor</li>
            <li>F: pantalla completa · M: silenciar</li>
          </ul>
          <div className="mt-3">
            <Notice kind="warning">
              No todos los TV boxes soportan WebRTC, MediaSource, PWA o todos los codecs. Revisa la
              pantalla de Diagnóstico en el propio dispositivo.
            </Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
