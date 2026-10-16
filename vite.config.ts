import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { game } from './VOID-Design-Handoff/tokens/game.config.ts';

// The product name in index.html comes from game.config.ts, like everywhere else.
process.env.VITE_GAME_NAME = game.name;

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` + `npm run dev:server`: same-origin API calls when VITE_VOID_API_URL=/api.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
