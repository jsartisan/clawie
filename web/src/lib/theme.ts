import { useCallback, useEffect, useState } from 'react';

export type ThemeId = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'clawie-theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return window.matchMedia(MEDIA_QUERY).matches;
}

export function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';
}

function resolvesToDark(theme: ThemeId): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark());
}

function applyTheme(theme: ThemeId): void {
  document.documentElement.classList.toggle('dark', resolvesToDark(theme));
}

/**
 * Theme state backed by the `.dark` class on <html> and localStorage.
 *
 * `'system'` tracks the OS preference live via a media-query listener, so the
 * app flips automatically when the user changes their system appearance while
 * the page is open. `index.html` runs the same resolution inline before React
 * mounts, which prevents a flash of the wrong theme on reload.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(getStoredTheme);

  const setTheme = useCallback((next: ThemeId) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;

    const media = window.matchMedia(MEDIA_QUERY);
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, setTheme };
}
