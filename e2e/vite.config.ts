// Production build used by the Playwright suite: the real app plus the
// determinism page, so both are tested as minified, shipped code.
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import base from '../vite.config.ts';

const root = resolve(import.meta.dirname, '..');

export default mergeConfig(base, {
  root,
  build: {
    rolldownOptions: {
      input: { main: resolve(root, 'index.html'), determinism: resolve(root, 'e2e/determinism/index.html') },
    },
  },
});
