import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['workspace.spec.ts', 'server-boundaries.spec.ts'], outputDir: './test-results/demo', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 960 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: true },
});
