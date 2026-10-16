// game.config.ts — the only place the product name and scoring constants live.
export const game = {
  name: 'VOID',
  score: { perSecond: 10, perFuelUnit: 25 }, // Debt Score = round(s*10 + fuel*25), lower is better
  burst: { cost: 2.4, duration: 0.28 },
} as const;

export const theme = {
  void: '#0E0F10', voidDeep: '#08090A', voidRaised: '#18191B',
  starlight: '#E8E4D8', starlightDim: '#B9B5AA',
  telemetry: '#8A8880',
  flare: '#82E6D0', flareHover: '#A6EEDD', flarePressed: '#66C9B3', // accent (mint)
  alarm: '#D9604C', // danger only
  hair: 'rgba(232,228,216,.10)', hairStrong: 'rgba(232,228,216,.24)',
  font: { display: 'Barlow Condensed', ui: 'IBM Plex Mono' },
  crt: { scanline: 0.18, scanlineInGame: 0.12, vignette: 0.5 },
} as const;
