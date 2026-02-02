import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@components': path.resolve(dirname, 'src/components'),
      '@hooks': path.resolve(dirname, 'src/hooks'),
      '@styles': path.resolve(dirname, 'src/styles')
    }
  }
});
