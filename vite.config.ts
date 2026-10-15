import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' }
});
