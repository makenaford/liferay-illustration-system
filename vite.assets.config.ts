import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** The Marketing Assets site — see assets-site/. */
export default defineConfig({
  root: 'assets-site',
  // .env.<mode> files live at the project root (--mode cloudflare).
  envDir: '..',
  plugins: [react()],
  server: { port: 5274 },
  build: { outDir: '../out/assets-site-build', emptyOutDir: true },
});
