import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'production-acceptance.spec.ts',workers:1,timeout:180000,
 outputDir:'./test-results/production',reporter:'list',
 use:{baseURL:process.env.NEXUS_ACCEPT_URL,ignoreHTTPSErrors:true,viewport:{width:1440,height:960},trace:'off',screenshot:'off',video:'off'}
});
