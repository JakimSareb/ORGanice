/* global process */
// ORG Mode para Eli (3.18): pruebas E2E propias (e2e/eli). Se lanzan con «yarn e2e».
// No forman parte del build ni de jest. Navegador: Chromium de Playwright
// («npx playwright install chromium») o el de E2E_CHROME.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4317);
const launchOptions = process.env.E2E_CHROME ? { executablePath: process.env.E2E_CHROME } : {};

export default defineConfig({
  testDir: './e2e/eli/tests',
  // (4.12) en GitHub, las E2E nuevas de la versión ya se han pasado antes (E2E_SKIP = sus rutas)
  testIgnore: (process.env.E2E_SKIP || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((f) => '**/' + f.split('/').pop()),
  fullyParallel: true,
  retries: 0,
  timeout: 60 * 1000,
  // (3.35) en GitHub, los fallos salen también como anotaciones de la ejecución (se leen por API)
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  outputDir: 'test-results/e2e-eli',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    bypassCSP: true,
    actionTimeout: 10 * 1000,
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'ordenador', use: { ...devices['Desktop Chrome'], launchOptions } },
    {
      name: 'movil',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 780 },
        isMobile: true,
        hasTouch: true,
        launchOptions,
      },
    },
  ],
  webServer: {
    command: 'node e2e/eli/serve.js',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
