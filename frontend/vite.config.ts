import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Rule A4: If VITE_API_URL is missing at production build time, fail the build.
  if (command === 'build' && process.env.STRICT_BUILD_CHECK === 'true') {
    if (!env.VITE_API_URL && !process.env.VITE_API_URL) {
      throw new Error(
        '❌ Build Failed (Rule A4): VITE_API_URL environment variable is required at build time and cannot be empty. Never fall back to localhost.'
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true
        },
        '/health': {
          target: 'http://localhost:5001',
          changeOrigin: true
        },
        '/auth': {
          target: 'http://localhost:5001',
          changeOrigin: true
        },
        '/companies': {
          target: 'http://localhost:5001',
          changeOrigin: true
        }
      }
    }
  };
});
