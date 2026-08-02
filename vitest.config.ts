import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Point at sources so tests run without building the workspace first.
    alias: {
      '@crisol/shared': resolve('./packages/shared/src/index.ts'),
      '@crisol/engine': resolve('./packages/engine/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
  },
});
