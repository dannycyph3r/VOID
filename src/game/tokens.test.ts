// Design-token consistency: tokens.json (source of truth), tokens.css and the
// theme in game.config.ts must agree, and the accent must stay mint.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { game, theme } from '../../VOID-Design-Handoff/tokens/game.config.ts';

const root = new URL('../../VOID-Design-Handoff/tokens/', import.meta.url);
const json = JSON.parse(readFileSync(new URL('tokens.json', root), 'utf8')) as {
  name: string; color: Record<string, string>; crt: Record<string, number | string>;
};
const css = readFileSync(new URL('tokens.css', root), 'utf8');

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** Normalise "#82E6D0" / "rgba(232,228,216,0.10)" / "rgba(232,228,216,.10)" for comparison. */
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '').replace(/(\d*\.?\d+)/g, (n) => String(parseFloat(n)));

describe('design tokens', () => {
  it('product name matches across config and tokens', () => {
    expect(game.name).toBe('VOID');
    expect(json.name).toBe(game.name);
  });

  it('every tokens.json color has the same value in tokens.css and game.config theme', () => {
    for (const [key, value] of Object.entries(json.color)) {
      const m = css.match(new RegExp(`--${kebab(key)}:\\s*([^;]+);`));
      expect(m, `--${kebab(key)} missing from tokens.css`).not.toBeNull();
      expect(norm(m![1].replace(/\/\*.*$/, ''))).toBe(norm(value));
      expect(norm(theme[key as keyof typeof theme] as string)).toBe(norm(value));
    }
  });

  it('keeps the mint accent and never introduces gold', () => {
    expect(norm(json.color.flare)).toBe(norm('#82E6D0'));
    expect(css).not.toMatch(/gold/i);
    expect(JSON.stringify(theme)).not.toMatch(/gold/i);
  });

  it('CRT strengths agree and the utility classes exist', () => {
    expect(theme.crt.scanline).toBe(json.crt.scanline);
    expect(theme.crt.scanlineInGame).toBe(json.crt.scanlineInGame);
    expect(theme.crt.vignette).toBe(json.crt.vignette);
    for (const cls of ['.crt-scan', '.crt-scan--game', '.crt-vignette', '.glow-flare', '.signal-in']) expect(css).toContain(cls);
    expect(css).toContain(`rgba(0,0,0,${String(json.crt.scanline).replace(/^0/, '')}) 3px`);
  });
});
