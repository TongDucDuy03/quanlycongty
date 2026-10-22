import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', testIgnore: ['**/company.e2e.spec.ts', '**/public-site.e2e.spec.ts'], use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', testIgnore: ['**/company.e2e.spec.ts', '**/public-site.e2e.spec.ts'], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'company-desktop', testMatch: ['**/company.e2e.spec.ts', '**/public-site.e2e.spec.ts'], use: { baseURL: 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } } },
    { name: 'company-mobile', testMatch: ['**/company.e2e.spec.ts', '**/public-site.e2e.spec.ts'], use: { baseURL: 'http://127.0.0.1:4175', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: 'npm run dev -- --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -- --port 4175 --strictPort', url: 'http://127.0.0.1:4175', env: { VITE_COMPANY_ENDPOINT: 'https://script.google.com/macros/s/test-deployment/exec' }, reuseExistingServer: !process.env.CI },
  ],
})
