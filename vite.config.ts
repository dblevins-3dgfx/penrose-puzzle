import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Node's process.env, which this config reads (no @types/node needed for it)
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // GitHub Pages serves the site under /penrose-puzzle/; the deploy
  // workflow passes that in. Local dev and preview stay at /.
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  // Listen on the local network so phones or tablets can open the dev server
  server: { host: true }
});
