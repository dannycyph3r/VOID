// Shared interface components (handoff docs/03-components.md).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { game } from '../game/constants.ts';
import { href } from '../router.ts';

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Sets document.title from game.name. */
export function useTitle(page: string | null): void {
  useEffect(() => {
    document.title = page ? `${game.name} · ${page}` : game.name;
  }, [page]);
}

/** Screen wrapper with the CRT overlay layers (scanlines, optional vignette). */
export function Screen({ children, className = '', vignette = true, game: inGame = false }: {
  children: ReactNode; className?: string; vignette?: boolean; game?: boolean;
}) {
  return (
    <div className={`screen ${className}`}>
      {children}
      {vignette && <div className="crt-vignette" aria-hidden="true" />}
      <div className={inGame ? 'crt-scan crt-scan--game' : 'crt-scan'} aria-hidden="true" />
    </div>
  );
}

export function BackLink({ to = '', label = game.name }: { to?: string; label?: string }) {
  return (
    <a className="back" href={href(to)} aria-label={to ? `Back to ${label}` : 'Back to home'}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M14 8H2M7 3L2 8l5 5" /></svg>
      <span>{label}</span>
    </a>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-row">
      <span id={`t-${label}`}>{label}</span>
      <button type="button" className="toggle" aria-pressed={on} aria-labelledby={`t-${label}`} onClick={() => onChange(!on)}>
        {on ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

export const Icon = {
  settings: <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M2 5h8M14 5h2M2 13h2M8 13h8" /><rect x="10" y="3" width="4" height="4" /><rect x="4" y="11" width="4" height="4" /></svg>,
  pause: <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="1" width="3" height="12" /><rect x="9" y="1" width="3" height="12" /></svg>,
  restart: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2.5 7a4.5 4.5 0 1 0 1.4-3.3M2.5 1.5v3h3" /></svg>,
  arrow: <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5" /></svg>,
  lock: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="3" y="7" width="10" height="7" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>,
  cross: <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.6" /></svg>,
};

/** Keep keyboard focus inside a dialog while it is open; Esc calls onEscape. */
export function useFocusTrap(open: boolean, onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const esc = useRef(onEscape);
  useEffect(() => { esc.current = onEscape; });
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        esc.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
