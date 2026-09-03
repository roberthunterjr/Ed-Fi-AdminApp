// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { Locator, Page } from '@playwright/test'

/** Local page navigation or a client-side re-render. */
export const UI_RENDER_TIMEOUT_MS = 20000

/** A read that hits the Admin App API (list/detail fetch behind react-query). */
export const API_FETCH_TIMEOUT_MS = 30000

/** A write that round-trips to the Ed-Fi Admin API before the UI settles. */
export const API_WRITE_TIMEOUT_MS = 40000

/** A full environment sync job: Admin API discovery plus tenant/ODS/Ed-Org ingest. */
export const SYNC_COMPLETE_TIMEOUT_MS = 120000

/** How long a single attempt inside a reload-and-retry poll may block. */
export const POLL_ATTEMPT_TIMEOUT_MS = 3000

/**
 * Selects an option in a `chakra-react-select` combobox by typing and confirming.
 *
 * `exact` matters: the global nav team picker is labelled "Select a team (or global)
 * context", which substring-matches a bare `name: 'Team'` lookup and would otherwise
 * shadow the "Team" field inside a form.
 */
export async function selectComboboxOption(page: Page, label: string, optionText: string) {
  const combobox = page.getByRole('combobox', { name: label, exact: true })
  await selectComboboxOptionIn(page, combobox, optionText)
}

export async function selectComboboxOptionIn(page: Page, combobox: Locator, optionText: string) {
  await combobox.click()
  await page.keyboard.type(optionText)
  await page.keyboard.press('Enter')
}
