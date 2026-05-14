import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 5175,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5175,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      '__APP_VERSION__': JSON.stringify(env.VITE_APP_VERSION || 'dev'),
    },
  };
});
