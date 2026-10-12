import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@unicornrush/engine-api': pkg('engine-api'),
      '@unicornrush/engine-lib': pkg('engine-lib'),
      '@unicornrush/engine': pkg('engine'),
    },
  },
});
