import { defineConfig } from '@playwright/test';

// Real-Chromium certification harness for editable regions. The fixture page
// loads the real built extension content bundle (extension-dist) behind a
// minimal chrome.* shim, so the controller, renderer, and exclusions under
// test are the shipped artifacts, running in a real browser engine.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8931' },
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:8931/fixture/editor.html',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
