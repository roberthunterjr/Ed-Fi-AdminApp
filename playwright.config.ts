// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  features: 'tests/e2e/**/*.feature',
  steps: 'tests/e2e/**/*.steps.ts',
  featuresRoot: 'tests/e2e',
  outputDir: 'tests/e2e/.features-gen',
})

export default defineConfig({
  testDir,
  timeout: 120000,
  retries: 1,
  reporter: [
    [ 'line' ],
    [ 'allure-playwright', { resultsDir: 'test-results/allure-results' } ],
    [ 'junit', { outputFile: 'test-results/e2e/junit-e2e-bdd.xml' } ]
  ],
  use: {
    baseURL: 'https://localhost/adminapp',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    launchOptions: {
      slowMo: 250,
    },
  },
  projects: [
    {
      name: 'setup',
      testDir: 'tests/e2e',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        trace: 'on'
      }
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: [/login-page\/login\.feature\.spec\.js/, /environmentv2andApi\.feature\.spec\.js/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      name: 'chromium-login',
      testMatch: /login-page\/login\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
      }
    },
    {
      // Isolated from `chromium` because it drives a full environment sync (Admin API
      // discovery plus tenant/ODS ingest), which needs a longer per-test timeout than the
      // rest of the suite. It depends only on `setup`: depending on `chromium` would make
      // Playwright skip these tests whenever any unrelated spec fails, hiding sync
      // regressions. Declared last so that, with `workers: 1`, it still runs after the
      // rest of the suite.
      name: 'chromium-environmentv2andApi',
      dependencies: ['setup'],
      testMatch: /environmentv2andApi\.feature\.spec\.js/,
      timeout: 180000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    }
  ],
  webServer: {
    command: 'echo "Using existing server"',
    url: 'https://localhost/adminapp',
    reuseExistingServer: true,
    ignoreHTTPSErrors: true
  },
  concurrent: 1,
  workers: 1,

})
