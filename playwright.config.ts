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

// `--grep-invert` is not applied to projects that run as dependencies of other projects,
// so the @v1 exclusion is also set on the projects that contain @v1 tests. Set by
// run-e2e-ui.ps1 -SkipV1; `--grep-invert @v1`, `--grep-invert=@v1`, `-gv @v1` and `-gv=@v1`
// on the command line are honoured too.
const grepInvertFlags = ['--grep-invert', '-gv']
const cliInvertsV1 = process.argv.some((arg, index) => {
  const flag = grepInvertFlags.find((f) => arg === f || arg.startsWith(`${f}=`))
  if (!flag) return false
  const value = arg === flag ? process.argv[index + 1] : arg.slice(flag.length + 1)
  return value?.includes('@v1') === true
})
const skipV1 = process.env.E2E_SKIP_V1 === '1' || cliInvertsV1
const skipV1Grep = skipV1 ? { grepInvert: /@v1/ } : {}

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
    // A click/fill on an element that never appears (wrong page state, missing
    // privilege) otherwise waits until the whole test timeout. Waits that are really
    // slow, like the environment sync, use explicit `expect` timeouts instead.
    actionTimeout: 30000,
    navigationTimeout: 30000,
    launchOptions: {
      // No artificial delay by default. Set PW_SLOW_MO (milliseconds) to slow the browser
      // down when debugging.
      slowMo: Number(process.env.PW_SLOW_MO ?? 0),
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
      // Independent of the other specs. It depends on `setup` only for scheduling: with no
      // dependencies it shares the first phase with `setup` and everything else waits for
      // its 5 tests (about 15s) to finish; one phase later it runs next to longer projects.
      name: 'chromium-login',
      dependencies: ['setup'],
      testMatch: /login-page\/login\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
      }
    },

    // The suite runs as a few independent "lanes" in parallel (see `workers` below).
    // Playwright spreads the files of one project across workers, so a lane that must
    // run in order is a chain of single-file projects linked with `dependencies`.
    // Specs mutate shared global tables and several act on "the first row", so only
    // files that never touch each other's data may sit in different lanes. Keep that in
    // mind before moving a file between lanes. A failure in one link skips the links
    // after it, which is the cost of keeping the order.

    // Lane A: everything that creates or deletes environments, strictly in order.
    // environmentV1/V2 delete "the first environment", so they must not overlap with
    // the Full*Environmentv2 environments the later projects create and rely on.
    {
      name: 'chromium-environments-v1',
      dependencies: ['setup'],
      testMatch: /environmentV1\.feature\.spec\.js/,
      ...skipV1Grep,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      name: 'chromium-environments-v2',
      dependencies: ['chromium-environments-v1'],
      testMatch: /environmentV2\.feature\.spec\.js/,
      ...skipV1Grep,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      // Creates the teams and Full*Environmentv2 environments the next two projects use.
      // These drive a full environment sync (Admin API discovery plus tenant/ODS ingest),
      // hence the longer per-test timeout.
      name: 'chromium-environmentv2andApi-setup',
      dependencies: ['chromium-environments-v2'],
      testMatch: /environmentv2andApi-setup\.feature\.spec\.js/,
      timeout: 180000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      name: 'chromium-environmentv2andApi',
      dependencies: ['chromium-environmentv2andApi-setup'],
      testMatch: /environmentv2andApi\.feature\.spec\.js/,
      // No sync wait here (the setup project covers that); the slowest passing scenario
      // takes about 25s, so a stuck one should fail fast instead of burning 3 minutes.
      timeout: 90000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      // Must run after `chromium-environmentv2andApi`, not alongside it: these specs
      // change and delete ownerships through the first row of the global ownerships
      // table, which includes the ApiTest ownership the other project depends on
      // (running them together left ApiTest without its environment or privileges).
      name: 'chromium-ownerships',
      dependencies: ['chromium-environmentv2andApi'],
      testMatch: /ownerships\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },

    // Lane B: users, teams and memberships share the same teams/users tables, so they
    // keep their original relative order.
    {
      name: 'chromium-team-memberships',
      dependencies: ['setup'],
      testMatch: /team-memberships\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      name: 'chromium-teams',
      dependencies: ['chromium-team-memberships'],
      testMatch: /teams\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      name: 'chromium-users',
      dependencies: ['chromium-teams'],
      testMatch: /users\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },

    // Lane C: read-only pages and roles.
    {
      name: 'chromium-roles',
      dependencies: ['setup'],
      testMatch: /roles\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },
    {
      name: 'chromium-pages',
      dependencies: ['setup'],
      testMatch: /(account|home|main)\.feature\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      }
    },

    {
      // Asserts that every task in the (global) sync queue has completed, so it has to
      // run once every other lane that triggers syncs has finished.
      name: 'chromium-sync-queue',
      dependencies: [
        'chromium-environmentv2andApi',
        'chromium-ownerships',
        'chromium-users',
        'chromium-roles',
        'chromium-pages',
      ],
      testMatch: /sync-queue\.feature\.spec\.js/,
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
  // One worker per project that can be running at once (see the lanes in `projects`):
  // chromium-login plus lanes A (environments, environmentv2andApi setup, environmentv2andApi,
  // then ownerships, one after the other), B (team-memberships, teams, users) and C (roles,
  // pages). Four workers hit the API from one IP, so a stack started outside run-e2e-ui.ps1
  // needs a raised RATE_LIMIT_LIMIT (see eng/testing/README.md).
  workers: 4,

})
