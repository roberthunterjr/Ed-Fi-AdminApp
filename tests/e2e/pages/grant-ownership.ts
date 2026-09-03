// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { Page } from '@playwright/test'
import { selectComboboxOption } from './support'

class GrantOwnershipPage {
  private readonly saveButton

  constructor(private readonly page: Page) {
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true })
  }

  async assignEnvironmentAccess(
    resourceType: string,
    environment: string,
    team: string,
    role: string
  ) {
    await this.page.getByRole('radio', { name: resourceType, exact: true }).check()
    await selectComboboxOption(this.page, 'Environment', environment)
    await selectComboboxOption(this.page, 'Team', team)
    await selectComboboxOption(this.page, 'Role', role)
    await this.saveButton.click()
  }
}

export default GrantOwnershipPage
