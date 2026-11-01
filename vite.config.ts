import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Emits sw.js with the list of built files to precache, so the game works offline once loaded. */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'poker-racer-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle);
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      const precache = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', ...files.map((f) => `./${f}`)];
      const source = readFileSync(new URL('./scripts/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative asset paths so the build also works under a sub-path (GitHub Pages: /pokerdriver/)
  base: './',
  plugins: [serviceWorkerPlugin()],
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
