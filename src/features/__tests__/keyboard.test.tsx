import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { useSettingsStore } from '@/state/settingsStore';

function Page({ name }: { name: string }) {
  return (
    <div>
      <h1>{name}</h1>
      <button type="button">Uno</button>
      <button type="button">Dos</button>
    </div>
  );
}

describe('TV / keyboard navigation', () => {
  it('Escape navigates back and arrow keys move focus when TV mode is on', async () => {
    useSettingsStore.getState().update((s) => ({ ...s, tv: { ...s.tv, mode: 'on' } }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/', '/history']} initialIndex={1}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Page name="Inicio" />} />
            <Route path="/history" element={<Page name="Historial" />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(document.documentElement.classList.contains('tv-mode')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).not.toBe(document.body);
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('does not hijack arrows when TV mode is off', async () => {
    useSettingsStore.getState().update((s) => ({ ...s, tv: { ...s.tv, mode: 'off' } }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Page name="Inicio" />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(document.documentElement.classList.contains('tv-mode')).toBe(false);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(document.body);
  });
});
