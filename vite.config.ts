import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
