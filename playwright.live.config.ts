import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', testMatch:'live*.spec.ts', outputDir:'./test-results/live', workers:1, fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:5176',viewport:{width:1440,height:960},screenshot:'only-on-failure'},
});
