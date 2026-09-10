import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'editor',
  plugins: [react()],
  server: { port: 5273 },
  build: { outDir: '../out/editor', emptyOutDir: true },
});
