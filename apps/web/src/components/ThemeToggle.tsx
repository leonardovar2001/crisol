import { useThemeMode, type Mode } from '../lib/theme.js';

const OPTIONS: { value: Mode; label: string; title: string }[] = [
  { value: 'system', label: 'Auto', title: 'Seguir la preferencia del sistema' },
  { value: 'light', label: 'Claro', title: 'Modo claro' },
  { value: 'dark', label: 'Oscuro', title: 'Modo oscuro' },
];

/**
 * Each person picks their own. Nothing here is shared with the room — the
 * projector can be light while every phone stays dark.
 */
export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();

  return (
    <div className="theme-toggle" role="group" aria-label="Modo de color">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={mode === option.value}
          className={mode === option.value ? 'is-active' : ''}
          onClick={() => setMode(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
