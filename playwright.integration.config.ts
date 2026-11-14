import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Integration test config: drives the containerised webmail (+ Stalwart) stack
 * managed by integration/tests/global-setup.ts.
 *
 * Run:  npx playwright test -c playwright.integration.config.ts
 */
const WEBMAIL_URL = process.env.IT_WEBMAIL_URL ?? 'http://localhost:3000';

/**
 * The enterprise and multi-instance specs need their own throwaway rig (ent-*
 * accounts on a VM Stalwart, or three replicas reachable over ssh) and read it
 * from the environment. Without it every test throws from requireEntEnv,
 * requireHaEnv or requireOrgEnv and the suite fails, so those specs are left
 * out of a run that has no rig — they still run wherever the rig is configured.
 */
const ENT_RIG_CONFIGURED = Boolean(process.env.IT_ENT_PASSWORD && process.env.IT_ADMIN_PASSWORD);
const HA_RIG_CONFIGURED = Boolean(process.env.IT_HA_PASSWORD && process.env.IT_ADMIN_PASSWORD);
// The 19-org specs also need a server whose admin dashboard is configured; the
// CI stack runs without one, so they are rig-only in exactly the same way.
const ORG_RIG_CONFIGURED = Boolean(process.env.IT_ORG_PASSWORD && process.env.IT_ADMIN_PASSWORD);
const RIG_GATES = [
  ...(ENT_RIG_CONFIGURED ? [] : ['requireEntEnv']),
  ...(HA_RIG_CONFIGURED ? [] : ['requireHaEnv']),
  ...(ORG_RIG_CONFIGURED ? [] : ['requireOrgEnv']),
];
const ENT_SPECS = RIG_GATES.length === 0
  ? []
  : readdirSync('./integration/tests')
      .filter((file) => {
        if (!file.endsWith('.spec.ts')) return false;
        const source = readFileSync(path.join('./integration/tests', file), 'utf8');
        return RIG_GATES.some((gate) => source.includes(gate));
      })
      .map((file) => `**/${file}`);

/**
 * Video capture mode, overridable via IT_VIDEO. Default `retain-on-failure`
 * keeps a .webm only for tests that fail. Set `IT_VIDEO=on` to record every
 * test (e.g. for a demo or to inspect a passing flow), `off` to disable, or
 * `on-first-retry` to record only when a test is retried. Videos land next to
 * the other artefacts under `integration/test-results/<test>/video.webm`.
 */
type VideoMode = 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
const VIDEO_MODES: VideoMode[] = ['off', 'on', 'retain-on-failure', 'on-first-retry'];
const VIDEO: VideoMode = VIDEO_MODES.includes(process.env.IT_VIDEO as VideoMode)
  ? (process.env.IT_VIDEO as VideoMode)
  : 'retain-on-failure';

export default defineConfig({
  testDir: './integration/tests',
  testIgnore: ENT_SPECS,
  // next dev compiles routes lazily and each test logs in fresh, so give
  // individual tests and their polling assertions generous headroom.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'integration/playwright-report' }]],
  outputDir: 'integration/test-results',
  globalSetup: './integration/tests/global-setup.ts',
  globalTeardown: './integration/tests/global-teardown.ts',
  use: {
    baseURL: WEBMAIL_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: VIDEO,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
