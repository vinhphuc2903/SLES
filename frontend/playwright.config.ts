import { defineConfig } from '@playwright/test'
if (!process.env.SLES_E2E_DATABASE?.startsWith('sles_e2e_') || !process.env.SLES_E2E_URL) throw new Error('Use npm run test:e2e to create an isolated environment.')
export default defineConfig({
 testDir:'./e2e', fullyParallel:false, workers:1, retries:0, timeout:60000,
 expect:{timeout:10000}, reporter:[['list'],['json',{outputFile:'test-results/e2e-results.json'}]],
 use:{baseURL:process.env.SLES_E2E_URL,browserName:'chromium',trace:'off',screenshot:'off',video:'off'},
})
