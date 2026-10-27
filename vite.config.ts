import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build produces one self-contained index.html (JS, CSS and font inlined),
// so the app opens with a double click, without a server.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  test: {
    environment: 'node',
  },
});
