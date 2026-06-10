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
  // Anthropic ember palette — every accent stays in the warm orange family
  { id: 'claude',  label: 'Claude',   main: '#d97757', dark: '#bd5d3f', light: '#e59a7f' },
  { id: 'rust',    label: 'Rust',     main: '#c2553d', dark: '#a3402c', light: '#d97b62' },
  { id: 'flame',   label: 'Flame',    main: '#e08b4e', dark: '#c26f33', light: '#eba872' },
  { id: 'kraft',   label: 'Kraft',    main: '#d4a27f', dark: '#b58057', light: '#e3bd9e' },
  { id: 'gold',    label: 'Gold',     main: '#d9a066', dark: '#b97f44', light: '#e6ba8c' },
  { id: 'ochre',   label: 'Ochre',    main: '#cf8a3e', dark: '#ab6e2a', light: '#dfa765' },
  { id: 'sienna',  label: 'Sienna',   main: '#b5764f', dark: '#945c3a', light: '#cb9573' },
  { id: 'brick',   label: 'Brick',    main: '#b3372e', dark: '#922a22', light: '#cd5a4f' },
  { id: 'peach',   label: 'Peach',    main: '#e8a87c', dark: '#cc8657', light: '#f2c4a2' },
  { id: 'clay',    label: 'Clay',     main: '#a97e5f', dark: '#8a6347', light: '#c09b7f' },
  { id: 'stone',   label: 'Stone',    main: '#a5a293', dark: '#85826f', light: '#bfbcae' },
  { id: 'ivory',   label: 'Ivory',    main: '#e3ddcb', dark: '#c4bca3', light: '#f5f3ec' },
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
