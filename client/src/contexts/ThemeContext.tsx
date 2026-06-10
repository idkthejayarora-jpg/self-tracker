import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface AccentPreset {
  id: string;
  label: string;
  main: string;
  dark: string;
  light: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  // Anthropic paper palette
  { id: 'claude',  label: 'Claude',   main: '#d97757', dark: '#bd5d3f', light: '#e59a7f' },
  { id: 'kraft',   label: 'Kraft',    main: '#d4a27f', dark: '#b58057', light: '#e3bd9e' },
  { id: 'olive',   label: 'Olive',    main: '#788c5d', dark: '#5f7247', light: '#94a87a' },
  { id: 'sage',    label: 'Sage',     main: '#629a90', dark: '#4a7d74', light: '#82b4ab' },
  // Blues
  { id: 'sky',     label: 'Sky',      main: '#0ea5e9', dark: '#0284c7', light: '#38bdf8' },
  { id: 'indigo',  label: 'Indigo',   main: '#6366f1', dark: '#4f46e5', light: '#818cf8' },
  { id: 'blue',    label: 'Blue',     main: '#3b82f6', dark: '#2563eb', light: '#60a5fa' },
  // Purples
  { id: 'violet',  label: 'Violet',   main: '#8b5cf6', dark: '#7c3aed', light: '#a78bfa' },
  { id: 'pink',    label: 'Pink',     main: '#ec4899', dark: '#db2777', light: '#f472b6' },
  { id: 'fuchsia', label: 'Fuchsia',  main: '#d946ef', dark: '#c026d3', light: '#e879f9' },
  // Reds & Oranges
  { id: 'rose',    label: 'Rose',     main: '#f43f5e', dark: '#e11d48', light: '#fb7185' },
  { id: 'orange',  label: 'Orange',   main: '#f97316', dark: '#ea580c', light: '#fb923c' },
  { id: 'amber',   label: 'Amber',    main: '#f59e0b', dark: '#d97706', light: '#fbbf24' },
  { id: 'gold',    label: 'Gold',     main: '#C9A84C', dark: '#A8872A', light: '#DCB24F' },
  { id: 'coral',   label: 'Coral',    main: '#FF6B6B', dark: '#e05555', light: '#ff8f8f' },
  // Greens
  { id: 'lime',    label: 'Lime',     main: '#84cc16', dark: '#65a30d', light: '#a3e635' },
  { id: 'green',   label: 'Green',    main: '#22c55e', dark: '#16a34a', light: '#4ade80' },
  { id: 'teal',    label: 'Teal',     main: '#14b8a6', dark: '#0d9488', light: '#2dd4bf' },
  { id: 'emerald', label: 'Emerald',  main: '#10b981', dark: '#059669', light: '#34d399' },
  { id: 'cyan',    label: 'Cyan',     main: '#06b6d4', dark: '#0891b2', light: '#22d3ee' },
  // Neutrals
  { id: 'slate',   label: 'Slate',    main: '#94a3b8', dark: '#64748b', light: '#cbd5e1' },
  { id: 'red',     label: 'Red',      main: '#ef4444', dark: '#dc2626', light: '#f87171' },
  { id: 'yellow',  label: 'Yellow',   main: '#eab308', dark: '#ca8a04', light: '#facc15' },
  { id: 'purple',  label: 'Purple',   main: '#a855f7', dark: '#9333ea', light: '#c084fc' },
];

export type ThemeMode = 'dark' | 'light';

function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyAccent(preset: AccentPreset) {
  const root = document.documentElement;
  root.style.setProperty('--accent',           preset.main);
  root.style.setProperty('--accent-dark',       preset.dark);
  root.style.setProperty('--accent-light',      preset.light);
  root.style.setProperty('--accent-rgb',        hexToRgbTriplet(preset.main));
  root.style.setProperty('--accent-rgb-dark',   hexToRgbTriplet(preset.dark));
  root.style.setProperty('--accent-rgb-light',  hexToRgbTriplet(preset.light));
}

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  isLight: boolean;
  accent: AccentPreset;
  setAccent: (preset: AccentPreset) => void;
}

const ThemeContext = createContext<ThemeContextValue>(null!);

const DEFAULT_ACCENT = ACCENT_PRESETS.find(p => p.id === 'claude')!;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() =>
    (localStorage.getItem('st_theme') as ThemeMode) || 'dark'
  );
  const [accent, setAccentState] = useState<AccentPreset>(() => {
    // v2 key: existing saved accents from the old glass theme are ignored
    // once, so everyone lands on the new Claude default after the redesign.
    const saved = localStorage.getItem('st_accent_v2');
    return ACCENT_PRESETS.find(p => p.id === saved) || DEFAULT_ACCENT;
  });

  // Apply mode
  useEffect(() => {
    const html = document.documentElement;
    if (mode === 'light') {
      html.classList.add('light');
    } else {
      html.classList.remove('light');
    }
    localStorage.setItem('st_theme', mode);
  }, [mode]);

  // Apply accent on mount and change
  useEffect(() => {
    applyAccent(accent);
    localStorage.setItem('st_accent_v2', accent.id);
  }, [accent]);

  const toggleMode = useCallback(() => {
    setMode(m => m === 'dark' ? 'light' : 'dark');
  }, []);

  const setAccent = useCallback((preset: AccentPreset) => {
    setAccentState(preset);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, isLight: mode === 'light', accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
