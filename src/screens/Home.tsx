import { useEffect, useRef, useState } from 'react';
import { Icon, Screen, Toggle, useNow, useTitle } from '../components/ui.tsx';
import { game } from '../game/constants.ts';
import { formatCountdown, msUntilUtcMidnight } from '../game/daily.ts';
import { STAGES } from '../game/stages.ts';
import { href } from '../router.ts';
import type { Settings } from '../state/settings.ts';

const p2 = (n: number) => String(n).padStart(2, '0');

function dialTicks(): string {
  let d = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180, r2 = i % 6 === 0 ? 354 : 364;
    d += `M${(400 + 372 * Math.cos(a)).toFixed(1)} ${(400 + 372 * Math.sin(a)).toFixed(1)}L${(400 + r2 * Math.cos(a)).toFixed(1)} ${(400 + r2 * Math.sin(a)).toFixed(1)}`;
  }
  return d;
}
function hazardTeeth(): string {
  let d = '';
  for (let j = 0; j < 28; j++) {
    const b = (j * 360 / 28) * Math.PI / 180;
    d += `M${(168 + 20 * Math.cos(b)).toFixed(1)} ${(248 + 20 * Math.sin(b)).toFixed(1)}L${(168 + 30 * Math.cos(b)).toFixed(1)} ${(248 + 30 * Math.sin(b)).toFixed(1)}`;
  }
  return d;
}
const DIAL = dialTicks();
const TEETH = hazardTeeth();
const ROUTE = 'M40 700 C 170 610, 290 548, 350 488 C 400 440, 482 452, 496 392 C 510 330, 444 290, 486 222 C 530 152, 620 124, 700 112';

/** Decorative orbital composition (aria-hidden). Ambient motion stops under reduced motion. */
function OrbitalHero() {
  return (
    <section className="hero" aria-hidden="true">
      <svg viewBox="0 0 800 800">
        <circle cx="400" cy="400" r="372" fill="none" stroke="rgba(232,228,216,.12)" />
        <path d={DIAL} stroke="rgba(232,228,216,.3)" fill="none" />
        <g fontFamily="IBM Plex Mono, monospace" fontSize="12" letterSpacing="1.5" fill="#8A8880">
          <text x="390" y="12">000</text><text x="782" y="404">090</text><text x="390" y="800">180</text><text x="-14" y="404">270</text>
        </g>
        <circle cx="400" cy="400" r="300" fill="none" stroke="rgba(232,228,216,.14)" />
        <circle cx="400" cy="400" r="196" fill="none" stroke="rgba(232,228,216,.14)" />
        <circle cx="400" cy="400" r="148" fill="none" stroke="rgba(138,136,128,.35)" strokeDasharray="1 5" />
        <circle cx="400" cy="400" r="112" fill="none" stroke="rgba(138,136,128,.45)" strokeDasharray="1 4" />
        <circle cx="400" cy="400" r="84" fill="none" stroke="rgba(138,136,128,.6)" strokeDasharray="1 3" />
        <circle cx="400" cy="400" r="58" fill="#E8E4D8" />
        <circle cx="422" cy="390" r="54" fill="#0E0F10" opacity="0.9" />
        <circle cx="400" cy="400" r="58" fill="none" stroke="#E8E4D8" />
        <path d="M400 360 V440 M360 400 H440" stroke="rgba(232,228,216,.25)" />
        <path d={TEETH} stroke="#D9604C" strokeWidth="1.2" />
        <circle cx="168" cy="248" r="14" fill="#000000" stroke="#E8E4D8" />
        <path d={ROUTE} fill="none" stroke="rgba(130,230,208,.22)" />
        <path className="flow" d={ROUTE} fill="none" stroke="#82E6D0" strokeWidth="1.6" strokeDasharray="6 9" />
        <circle cx="700" cy="112" r="5" fill="#82E6D0" />
        <circle className="pulse" cx="700" cy="112" r="22" fill="none" stroke="#82E6D0" />
        <path d="M676 112 H 690 M710 112 H 724 M700 88 V 102 M700 122 V 136" stroke="#82E6D0" />
      </svg>
      <div className="orbit" style={{ width: '49%' }}>
        <div><span style={{ width: 9, height: 9, background: '#E8E4D8' }} /></div>
      </div>
      <div className="orbit" style={{ width: '75%' }}>
        <div style={{ animationDuration: '96s', animationDirection: 'reverse' }}>
          <span style={{ width: 20, height: 20, background: '#18191B', border: '1px solid #E8E4D8' }} />
        </div>
      </div>
    </section>
  );
}

export function Home({ settings, onSettings }: { settings: Settings; onSettings: (p: Partial<Settings>) => void }) {
  useTitle(null);
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const clock = `${p2(now.getUTCDate())}.${p2(now.getUTCMonth() + 1)}.${String(now.getUTCFullYear()).slice(2)} · ${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}`;

  return (
    <Screen>
      <header className="topbar">
        <span className="label" style={{ letterSpacing: '.14em' }}><time dateTime={now.toISOString()}>{clock}</time> UTC</span>
        <button ref={btnRef} className="icon-btn" type="button" aria-label="Settings" aria-expanded={open} aria-controls="settings-popover" onClick={() => setOpen((o) => !o)}>
          {Icon.settings}
        </button>
      </header>
      {open && (
        <div ref={popRef} id="settings-popover" className="popover popover-layer" role="dialog" aria-label="Settings">
          <Toggle label="Sound" on={settings.sound} onChange={(v) => onSettings({ sound: v })} />
          <Toggle label="Reduced motion" on={settings.reducedMotion} onChange={(v) => onSettings({ reducedMotion: v })} />
        </div>
      )}
      <main className="home-main signal-boot">
        <section className="home-left">
          <div className="home-brand" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="navmark"><span>NAV-01</span><span className="blink" aria-hidden="true">_</span></div>
            <h1 className="wordmark">{game.name}</h1>
            <div className="tick-rule" aria-hidden="true" />
          </div>
          <nav aria-label="Main">
            <ul className="menu">
              <li><a className="menu-row active" href={href('stages')}><span className="mark" aria-hidden="true">▸</span><span className="text">Stages</span><span className="meta">{STAGES.length}</span></a></li>
              <li><a className="menu-row" href={href('flight/daily')}><span className="mark" aria-hidden="true">▸</span><span className="text">Daily</span><span className="meta" aria-label="Resets in">{formatCountdown(msUntilUtcMidnight(now))}</span></a></li>
              <li><a className="menu-row" href={href('stats')}><span className="mark" aria-hidden="true">▸</span><span className="text">Stats</span><span /></a></li>
              <li><a className="menu-row" href={href('how')}><span className="mark" aria-hidden="true">▸</span><span className="text">How to Play</span><span /></a></li>
            </ul>
          </nav>
        </section>
        <OrbitalHero />
      </main>
    </Screen>
  );
}
