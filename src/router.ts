// Minimal hash router: works from any static host and keeps browser Back working.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'stages'; sel: string | null }
  | { name: 'flight'; id: string }
  | { name: 'result' }
  | { name: 'stats'; tab: string | null; stage: string | null }
  | { name: 'how' };

export function parseHash(hash: string): Route {
  const [path, qs] = hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(qs ?? '');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'stages': return { name: 'stages', sel: q.get('sel') };
    case 'flight': return parts[1] ? { name: 'flight', id: parts[1] } : { name: 'stages', sel: null };
    case 'result': return { name: 'result' };
    case 'stats': return { name: 'stats', tab: q.get('tab'), stage: q.get('stage') };
    case 'how': return { name: 'how' };
    default: return { name: 'home' };
  }
}

export function href(path: string): string {
  return `#/${path.replace(/^\/+/, '')}`;
}

export function navigate(path: string, replace = false): void {
  const h = href(path);
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
