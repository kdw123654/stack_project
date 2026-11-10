import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/backend-api': {
        target: loadEnv(mode, '.', '').BACKEND_API_PROXY_TARGET || 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend-api/, ''),
      },
      '/ai-api': {
        target: loadEnv(mode, '.', '').AI_API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-api/, ''),
      },
    },
  },
}));
