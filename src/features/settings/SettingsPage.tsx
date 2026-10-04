import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { Card, Field, LinkButton, PageHeader, Select, Toggle } from '@/components/ui';
import { THEMES } from '@/core/schemas/settings';
import { useSettingsStore } from '@/state/settingsStore';

export function SettingsPage() {
  useDocumentTitle('Ajustes');
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const persisted = useSettingsStore((s) => s.persisted);
  const themeLabel: Record<(typeof THEMES)[number], string> = {
    system: 'Sistema',
    dark: 'Oscuro',
    light: 'Claro',
  };

  return (
    <div>
      <PageHeader
        title="Ajustes"
        subtitle="Todo se guarda en este navegador. Borrar los datos del sitio restablece los valores por defecto."
      />
      {!persisted ? (
        <p className="mb-4 text-sm text-amber-600">No se pudo guardar en almacenamiento local.</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Apariencia</h2>
          <Field label="Tema" htmlFor="theme">
            <Select
              id="theme"
              value={settings.theme}
              onChange={(e) => update((s) => ({ ...s, theme: e.target.value as typeof s.theme }))}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {themeLabel[t]}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Reproductor</h2>
          <Toggle
            id="autoplay"
            label="Reproducir el siguiente automáticamente"
            checked={settings.player.autoplayNext}
            onChange={(v) => update((s) => ({ ...s, player: { ...s.player, autoplayNext: v } }))}
          />
          <Toggle
            id="remember"
            label="Recordar progreso de reproducción"
            hint="Se guarda localmente en el historial."
            checked={settings.player.rememberProgress}
            onChange={(v) =>
              update((s) => ({ ...s, player: { ...s.player, rememberProgress: v } }))
            }
          />
          <Field label="Volumen inicial" htmlFor="vol">
            <input
              id="vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="min-h-12 w-full"
              value={settings.player.defaultVolume}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  player: { ...s.player, defaultVolume: Number(e.target.value) },
                }))
              }
            />
          </Field>
          <Field label="Velocidad inicial" htmlFor="rate">
            <Select
              id="rate"
              value={String(settings.player.defaultRate)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  player: { ...s.player, defaultRate: Number(e.target.value) },
                }))
              }
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Privacidad</h2>
          <Toggle
            id="confirm-ext"
            label="Confirmar antes de añadir URLs externas"
            hint="Recuerda que el servidor remoto verá tu IP al reproducir."
            checked={settings.privacy.confirmExternalUrls}
            onChange={(v) =>
              update((s) => ({ ...s, privacy: { ...s.privacy, confirmExternalUrls: v } }))
            }
          />
          <p className="ovt-muted text-sm">
            No hay analítica, telemetría ni cuentas que configurar: no existen.
          </p>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Más ajustes</h2>
          <div className="flex flex-col gap-2">
            <LinkButton to="/settings/playback">Calidad y búfer</LinkButton>
            <LinkButton to="/settings/storage">Almacenamiento y limpieza</LinkButton>
            <LinkButton to="/settings/tv">Modo TV</LinkButton>
            <LinkButton to="/diagnostics">Diagnóstico del dispositivo</LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
