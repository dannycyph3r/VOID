import { useCallback, useEffect, useState } from 'react';
import { isObject, load, save } from './storage.ts';

export type Settings = { sound: boolean; reducedMotion: boolean };

const DEFAULTS: Settings = { sound: true, reducedMotion: false };
const valid = (v: unknown): v is Settings => isObject(v) && typeof v.sound === 'boolean' && typeof v.reducedMotion === 'boolean';

function systemReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Persisted settings plus the effective reduced-motion flag (setting OR system preference). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => load('settings', DEFAULTS, valid));
  const [system, setSystem] = useState(systemReduced);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save('settings', next);
      return next;
    });
  }, []);

  return { settings, update, reducedMotion: settings.reducedMotion || system };
}
