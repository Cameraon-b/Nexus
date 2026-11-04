import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,pfx,p12}', '**/.git/**', '**/.local/**', '**/.tools/**', '**/.cache/**', '**/.browsers/**', '**/backend/**'] },
    proxy: { '/api': { target: process.env.NEXUS_API_URL ?? 'http://127.0.0.1:5080', changeOrigin: false } },
  },
});
