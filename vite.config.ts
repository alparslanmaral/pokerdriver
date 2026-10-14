import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build also works under a sub-path (GitHub Pages: /pokerdriver/)
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
