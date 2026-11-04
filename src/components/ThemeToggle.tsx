'use client';
import * as React from 'react';
import { Moon, Sun } from 'lucide-react';

/** Dark is the default; light is an opt-in (e.g. for bright projectors). Preference is remembered per browser. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [light, setLight] = React.useState(false);
  React.useEffect(() => { setLight(document.documentElement.dataset.theme === 'light'); }, []);
  const toggle = () => {
    const next = !light; setLight(next);
    document.documentElement.dataset.theme = next ? 'light' : 'dark';
    try { localStorage.setItem('ww-theme', next ? 'light' : 'dark'); } catch { /* private mode */ }
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={light} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cave-700 text-white hover:bg-cave-600 ${className}`}>
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
