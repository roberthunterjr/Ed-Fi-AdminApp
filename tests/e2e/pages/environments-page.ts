// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { Page, expect } from '@playwright/test'
import GrantOwnershipPage from './grant-ownership'
import {
  API_FETCH_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
  POLL_ATTEMPT_TIMEOUT_MS,
  SYNC_COMPLETE_TIMEOUT_MS,
  UI_RENDER_TIMEOUT_MS,
  clickNavLink,
  selectComboboxOptionIn,
} from './support'

class EnvironmentsPage {
  private readonly environmentOption
  private readonly connectButton
  private readonly nameInput
  private readonly edfiApiInput
  private readonly edfiManagementInput
  private readonly labelInput
  private readonly addOdsInstances
  private readonly odsName
  private readonly dbName
  private readonly eduOrgIdentifier
  private readonly saveButton
  private readonly cancelButton
  private readonly teamSection
  private readonly apiVersionElement
  private readonly environmentsMainContainer
  private readonly noDeletePopup
  private readonly yesDeletePopup
  private readonly editEnvDetails
  private readonly deleteEnvDetails
  private readonly grantownership
  private readonly tenantsSection
  private readonly syncQueueSection
  private readonly syncQueueSectionBody
  private readonly globalTeamDropdown
  private readonly syncQueueStatusBadge
  private readonly tableRows
  private readonly firstTableRowLink
  private readonly firstTenantSectionOnEnvironment
  private readonly odssTabLink
  private readonly syncQueueCompletedText
  private readonly odsAvailableText
  private readonly firstEnvironmentRowSpan
  private readonly searchInput
  private readonly searchInputEnvironment
  private readonly clearTenantSearchButton
  private readonly deleteMenuItem
  private readonly ownershipResourceTypesText
  private readonly ownershipFormSummaryText
  private readonly odsOption
  private readonly edOrgsOption
  private readonly vendorsOption
  private readonly applicationsOption
  private readonly profilesOption
  private readonly createButton
  private readonly newButton
  private readonly odsNameInput
  private readonly templateSelect
  private readonly vendorCompanyInput
  private readonly vendorPrefixesInput
  private readonly vendorContactNameInput
  private readonly vendorContactEmailInput
  private readonly profileFileInput
  private readonly profileDetails
  private readonly resourceTable
  private readonly teamsOption
  private readonly createTeamButton
  private readonly teamNameInput
  private readonly teamMembershipsOption
  private readonly createTeamMembershipButton
  private readonly claimsetImportPageLink
  private readonly claimsetFileInput
  private readonly claimsetImportButton
  private readonly importedClaimsetViewLink
  /**
   * The vendor and claimset that "a test application ... exists" scenarios build on.
   * Every scenario used to copy a claimset and create a vendor through the UI (about
   * 10s each); now the first one does and the rest reuse them. Per worker process, so a
   * worker restart after a failure simply recreates them. Scenarios that delete a vendor
   * or claimset must not use this: they go through `prepareApplicationDependencies`.
   */
  private static sharedApplicationDependencies?: { vendor: string; claimset: string }
  private readonly runSuffix = Date.now().toString(36)
  private rowCountBeforeDelete = 0
  private lastHoveredResource: string | undefined
  private readonly testResourceNames = new Map<string, string>()
  private resetCredentials: { key?: string; secret?: string; link?: string } | undefined

  constructor(private readonly page: Page) {
    this.environmentOption = this.page.locator('a[title="Environments"]')
    this.connectButton = this.page.locator('a[title="Connect new environment."]')
    this.nameInput = this.page.locator('input[name="name"]')
    this.edfiApiInput = this.page.locator('input[name="odsApiDiscoveryUrl"]')
    this.edfiManagementInput = this.page.locator('input[name="adminApiUrl"]')
    this.labelInput = this.page.locator('input[name="environmentLabel"]')
    this.addOdsInstances = this.page.locator('button:has-text("Add ODS Instance")')
    this.odsName = this.page.locator('input[placeholder="ODS name"]')
    this.dbName = this.page.locator('input[placeholder="DB name"]')
    this.eduOrgIdentifier = this.page.locator('input[placeholder="1, 255901, 25590100"]')
    this.saveButton = this.page.locator('button:has-text("Save")')
    this.cancelButton = this.page.locator('button:has-text("Cancel")')
    this.noDeletePopup = this.page.locator('button:has-text("No")')
    this.yesDeletePopup = this.page.locator('button:has-text("Yes")')
    this.teamSection = this.page.locator('.css-ykczg1 > div:nth-child(3)')
    this.apiVersionElement = this.page.getByText('Ed-Fi API version')
    this.environmentsMainContainer = this.page.locator('.page-content-card').first()
    this.editEnvDetails = this.page.locator('a[title="Edit environment details"]')
    this.deleteEnvDetails = this.page.locator('button[title="Delete environment"]')
    this.grantownership = this.page.getByRole('link', { name: 'Grant ownership' })
    this.tenantsSection = this.page.getByRole('heading', { name: 'Tenants' })
    this.syncQueueSection = this.page.getByRole('heading', { name: 'Sync queue' })
    this.syncQueueSectionBody = this.page
      .locator('.content-section')
      .filter({ has: this.syncQueueSection })
    this.globalTeamDropdown = this.page.getByRole('combobox', {
      name: 'Select a team (or global) context',
    })
    this.syncQueueStatusBadge = this.syncQueueSectionBody.getByText(/^(active|completed)$/).first()
    this.tableRows = this.page.locator('tbody tr')
    this.firstTableRowLink = this.tableRows.first().getByRole('link').first()
    this.firstTenantSectionOnEnvironment = this.teamSection.first()
    this.odssTabLink = this.page.getByRole('link', { name: 'ODSs' })
    this.syncQueueCompletedText = this.syncQueueSectionBody.getByText('completed', { exact: true }).first()
    this.odsAvailableText = this.environmentsMainContainer.getByText('Available', { exact: true })
    this.firstEnvironmentRowSpan = this.page.locator('tbody td span').first()
    this.searchInput = this.page.getByPlaceholder('Search')
    this.searchInputEnvironment = this.page.getByRole('textbox', { name: 'Search' }).nth(1)
    this.clearTenantSearchButton = this.page.getByRole('button', { name: 'clear search' })
    this.deleteMenuItem = this.page.getByRole('menuitem', { name: 'Delete' })
    this.ownershipResourceTypesText = this.page.getByText('Ed-OrgOdsTenantWhole')
    this.ownershipFormSummaryText = this.page.getByText('EnvironmentUpdateNameTeamSelect an optionRoleSelect an optionSaveCancel')
    this.odsOption = this.page.getByRole('link', { name: /^ODS/ }).first()
    this.edOrgsOption = this.page.getByRole('link', { name: 'Ed-Orgs', exact: true })
    this.vendorsOption = this.page.getByRole('link', { name: 'Vendors', exact: true })
    this.applicationsOption = this.page.getByRole('link', { name: 'Applications', exact: true })
    this.profilesOption = this.page.locator('a[title="Profiles"]')
    this.createButton = this.page.getByRole('link', { name: 'Create', exact: true })
    this.newButton = this.page.getByRole('link', { name: 'New', exact: true })
    this.odsNameInput = this.page.getByRole('textbox', { name: 'Name', exact: true })
    this.templateSelect = this.page.getByRole('combobox', { name: 'Template', exact: true })
    this.vendorCompanyInput = this.page.getByRole('textbox', { name: 'Company', exact: true })
    this.vendorPrefixesInput = this.page.getByRole('textbox', { name: /Namespace prefixes/ })
    this.vendorContactNameInput = this.page.getByRole('textbox', { name: 'Contact name', exact: true })
    this.vendorContactEmailInput = this.page.getByRole('textbox', { name: 'Contact email address', exact: true })
    this.profileFileInput = this.page.getByRole('button', { name: 'Choose File' })
    this.claimsetImportPageLink = this.page.getByRole('link', { name: 'Import', exact: true })
    this.claimsetFileInput = this.page.locator('#claimset-import-file')
    this.claimsetImportButton = this.page.getByRole('button', { name: 'Import', exact: true })
    this.importedClaimsetViewLink = this.page.getByRole('link', { name: /View/ })
    this.profileDetails = this.page.getByText('NameTest-Profile42Definition<')
    this.resourceTable = this.page.locator('.page-content-card')
    this.teamsOption = this.page.locator('a[title="Teams"]')
    this.createTeamButton = this.page.locator('a[title="Create new team."]')
    this.teamNameInput = this.page.locator('input[name="name"]')
    this.teamMembershipsOption = this.page.locator('a[title="Team memberships"]')
    this.createTeamMembershipButton = this.page.locator('a[title="Create new team membership."]')
  }

  async clickEnvironmentOption() {
    await clickNavLink(this.page, this.environmentOption, /\/adminapp\/sb-environments\/?$/)
  }

  async selectGlobalTeam(teamName: string) {
    await selectComboboxOptionIn(this.page, this.globalTeamDropdown, teamName)
  }

  async clickConnectButton() {
    await this.connectButton.click()
  }

  async fillAllRequiredFieldsV1(
    names: string,
    edfiApi: string,
    edfiManagement: string,
    label: string,
    odsName: string,
    dbName: string,
    eduOrgIdentifier: string
  ) {
    await this.nameInput.fill(`${names}-${this.runSuffix}`)
    await this.edfiApiInput.fill(edfiApi)
    await this.edfiManagementInput.fill(edfiManagement)
    await this.labelInput.fill(label)
    await this.addOdsInstances.click()
    await this.odsName.fill(odsName)
    await this.dbName.fill(dbName)
    await this.eduOrgIdentifier.fill(eduOrgIdentifier)
  }

  async fillAllRequiredFieldsV2(name: string, edfiApi: string, edfiManagement: string, label: string) {
    await this.nameInput.fill(`${name}-${this.runSuffix}`)
    await this.edfiApiInput.fill(edfiApi)
    await this.edfiManagementInput.fill(edfiManagement)
    await this.labelInput.fill(label)
  }

  async fillAllRequiredFields(type: string) {
    const normalizedType = type.trim().toLowerCase()

    if (normalizedType === 'v2') {
      await this.fillAllRequiredFieldsV2('TEST', 'https://localhost/odsv7-adminv2-single-api', 'https://localhost/odsv7-adminv2-single-adminapi', 'TEST')
      return
    }

    if (normalizedType === 'v1') {
      await this.fillAllRequiredFieldsV1('TEST', 'https://localhost/v6-api', 'https://localhost/v6-adminapi', 'TEST', 'ODS', 'ODS', '100')
      return
    }

    throw new Error(`Unknown environment type: ${type}`)
  }

  async fillField(fieldName: string) {
    const normalized = fieldName.trim().toLowerCase()

    if (normalized === 'none') {
      return
    }

    if (normalized === 'name') {
      await this.nameInput.fill('sample-name')
      return
    }

    if (normalized === 'ed-fi api') {
      await this.edfiApiInput.fill('https://localhost/v6-api')
      return
    }

    if (normalized === 'ed-fi management') {
      await this.edfiManagementInput.fill('https://localhost/v6-adminapi')
      return
    }

    if (normalized === 'env label' || normalized === 'label') {
      await this.labelInput.fill('production')
      return
    }

    if (normalized === 'educorgident') {
      await this.edfiApiInput.fill('https://localhost/v6-api')
      await this.edfiManagementInput.fill('https://localhost/v6-adminapi')
      await this.labelInput.click()
      await this.addOdsInstances.click()
      await this.odsName.fill('ODS')
      await this.dbName.fill('ODS')
      await this.eduOrgIdentifier.fill('1')
      return
    }
  }

  async fillSeveralFields(fieldNames: string) {
    const fields = fieldNames
      .split(',')
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean)

    for (const field of fields) {
      if (field === 'ods instance') {
        await this.addOdsInstances.click()
        await this.odsName.fill('ODS')
        await this.dbName.fill('ODS')
        await this.eduOrgIdentifier.fill('1')
        continue
      }

      await this.fillField(field)
    }
  }

  async clickSaveButton() {
    await this.saveButton.click()
    await expect(this.page.getByRole('button', { name: 'Loading... Cancel' })).not.toBeVisible({ timeout: API_WRITE_TIMEOUT_MS });
  }

  async clickCancelButton() {
    await this.cancelButton.click()
  }

  async createTeam(name: string) {
    await clickNavLink(this.page, this.teamsOption, /\/adminapp\/teams\/?$/)
    await this.createTeamButton.click()
    await this.teamNameInput.fill(name)
    await this.saveButton.click()
    // Wait for the redirect to the team's detail page, not just for the form to close: the
    // form unmounts before the app navigates, and the next step's nav click would be
    // overridden by the late redirect.
    await expect(this.page).toHaveURL(/\/teams\/\d+\/?$/, { timeout: API_WRITE_TIMEOUT_MS })
  }

  async createTeamMembership(team: string, user: string, role: string) {
    await clickNavLink(this.page, this.teamMembershipsOption, /\/adminapp\/user-team-memberships\/?$/)
    await this.createTeamMembershipButton.click()
    await selectComboboxOptionIn(
      this.page,
      this.page.getByRole('combobox', { name: 'Team', exact: true }),
      team,
    )
    await selectComboboxOptionIn(
      this.page,
      this.page.getByRole('combobox', { name: 'User', exact: true }),
      user,
    )
    await selectComboboxOptionIn(
      this.page,
      this.page.getByRole('combobox', { name: 'Role', exact: true }),
      role,
    )
    await this.saveButton.click()
    await expect(this.page).not.toHaveURL(/\/create/, { timeout: API_WRITE_TIMEOUT_MS })
  }

  async clickResourceOption(resource: 'ods' | 'edorgs' | 'vendors' | 'applications' | 'profiles') {
    const option = {
      ods: this.odsOption,
      edorgs: this.edOrgsOption,
      vendors: this.vendorsOption,
      applications: this.applicationsOption,
      profiles: this.profilesOption,
    }[resource]
    await option.first().click()
  }

  async clickClaimsetsOption() {
    await this.page.getByRole('link', { name: 'Claimsets', exact: true }).nth(0).click()
  }

  async clickClaimsetImportButton() {
    const importButton = this.page.getByRole('button', { name: 'Import', exact: true })
    await expect(importButton).toHaveCount(1)
    await importButton.click()
  }

  private testResourceName(name: string) {
    if (!this.testResourceNames.has(name)) {
      this.testResourceNames.set(name, `${name}-${this.runSuffix}`)
    }
    return this.testResourceNames.get(name)!
  }

  private namedTestResourceRow(name: string) {
    return this.page.locator('tbody tr').filter({
      has: this.page.getByRole('link', {
        name: this.testResourceNames.get(name) ?? name,
        exact: true,
      }),
    })
  }

  async openTestResource(name: string) {
    const row = this.namedTestResourceRow(name)
    await expect(row).toHaveCount(1, { timeout: API_FETCH_TIMEOUT_MS })
    await row.getByRole('link', {
      name: this.testResourceNames.get(name) ?? name,
      exact: true,
    }).click()
  }

  async clickTestResourceAction(action: string, name?: string) {
    const scope = name ? this.namedTestResourceRow(name) : this.page
    if (name) {
      await expect(this.namedTestResourceRow(name)).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
      await this.namedTestResourceRow(name).hover()
    }
    const control = scope.getByRole('link', { name: action, exact: true })
      .or(scope.getByRole('button', { name: action, exact: true }))
    await control.click()
  }

  async copyTestClaimset(source: string, name: string) {
    await this.openTestResource(source)
    await this.clickTestResourceAction('Copy')
    await this.page.locator('input[name="name"]').fill(this.testResourceName(name))
    await this.clickSaveButton()
    await this.testResourceDetailsShouldBeDisplayed(name, 'claimsets')
  }

  async exportTestClaimset(name: string) {
    await this.openTestResource(name)
    await this.clickTestResourceAction('Export')
    return this.readClaimsetExportPayload(name)
  }

  private async readClaimsetExportPayload(name: string) {
    const downloadLink = this.page.getByRole('link', { name: 'here', exact: true }).last()
    await expect(downloadLink).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
    const href = await downloadLink.getAttribute('href')
    expect(href).toBeTruthy()
    const response = await this.page.context().request.get(new URL(href!, this.page.url()).href)
    expect(response.ok()).toBeTruthy()
    const payload = await response.json()
    expect(Array.isArray(payload.template?.claimSets)).toBeTruthy()
    expect(payload.template.claimSets).toHaveLength(1)
    const exportedName = payload.template.claimSets[0].name ?? payload.template.claimSets[0].Name
    expect(exportedName).toBe(this.testResourceNames.get(name) ?? name)
    return payload
  }

  async importTestClaimset() {
    await this.claimsetImportPageLink.click()
    await this.claimsetFileInput.setInputFiles('tests/e2e/environments-page/fixtures/claimsets.json')
    await expect(this.claimsetImportButton).toBeVisible()
    await this.claimsetImportButton.click()
    await expect(this.importedClaimsetViewLink).toBeVisible()
    await this.importedClaimsetViewLink.click()
  }

  async reservedClaimsetActionShouldBeUnavailable(action: 'Edit' | 'Delete', source: string) {
    await this.openTestResource(source)
    const reservedAttribute = this.page.getByText('Is system-reserved', { exact: true }).locator('..')
    await expect(reservedAttribute.getByText('true', { exact: true })).toBeVisible({
      timeout: API_FETCH_TIMEOUT_MS,
    })
    await expect(this.page.getByRole('link', { name: action, exact: true })).toHaveCount(0)
    await expect(this.page.getByRole('button', { name: action, exact: true })).toHaveCount(0)
  }

  async prepareApplicationDependencies(claimset: string) {
    await this.clickClaimsetsOption()
    await this.copyTestClaimset('Ed-Fi Sandbox', claimset)
    await this.clickResourceOption('vendors')
    await this.clickNewButton()
    await this.fillVendorFields(
      this.testResourceName('E2EVendor'),
      'uri://ed-fi.org',
      'E2E Contact',
      'e2e@example.org',
    )
    await this.clickSaveButton()
    await expect(this.page.getByRole('heading', {
      name: this.testResourceName('E2EVendor'), exact: true,
    })).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
    await this.clickResourceOption('applications')
  }

  private async selectFirstFormOption(label: string) {
    const field = this.page.locator('form').getByText(label, { exact: true }).locator('..')
    const combobox = field.getByRole('combobox')
    const openMenu = this.page.locator('[id^="react-select-"][id$="-option-0"]')
    // The keystrokes can fire before the async options render and select nothing, so the
    // dependent field (Ed-org after ODS) never appears. Retry until the menu has closed.
    await expect(async () => {
      if (await openMenu.count()) {
        await this.page.keyboard.press('Escape')
      }
      await combobox.click({ timeout: POLL_ATTEMPT_TIMEOUT_MS })
      await this.page.keyboard.press('ArrowDown')
      // Enter without an open menu and a focused option submits the form, so only press it once
      // the options are on screen.
      await expect(openMenu).toBeVisible({ timeout: POLL_ATTEMPT_TIMEOUT_MS })
      await this.page.keyboard.press('Enter')
      await expect(openMenu).toBeHidden({ timeout: POLL_ATTEMPT_TIMEOUT_MS })
    }).toPass({ timeout: API_FETCH_TIMEOUT_MS })
  }

  private async selectNamedFormOption(label: string, name: string) {
    const field = this.page.locator('form').getByText(label, { exact: true }).locator('..')
    await selectComboboxOptionIn(this.page, field.getByRole('combobox'), this.testResourceName(name))
  }

  async fillApplicationFields(name: string, claimset: string) {
    await this.page.locator('input[name="applicationName"]').fill(this.testResourceName(name))
    await this.selectFirstFormOption('ODS')
    await this.selectFirstFormOption('Ed-org')
    await this.selectNamedFormOption('Vendor', 'E2EVendor')
    await this.selectNamedFormOption('Claimset', claimset)
  }

  async prepareTestApplication(name: string) {
    const shared = EnvironmentsPage.sharedApplicationDependencies
    if (shared) {
      this.testResourceNames.set('E2EVendor', shared.vendor)
      this.testResourceNames.set('E2EClaimset', shared.claimset)
      await this.clickResourceOption('applications')
    } else {
      await this.prepareApplicationDependencies('E2EClaimset')
      // Only remembered once the whole setup succeeded.
      EnvironmentsPage.sharedApplicationDependencies = {
        vendor: this.testResourceName('E2EVendor'),
        claimset: this.testResourceName('E2EClaimset'),
      }
    }
    await this.clickNewButton()
    await this.fillApplicationFields(name, 'E2EClaimset')
    await this.clickSaveButton()
    await this.testResourceDetailsShouldBeDisplayed(name, 'applications')
    await this.clickResourceOption('applications')
  }

  async renameTestResource(name: string, resource: 'application' | 'credential') {
    const inputName = resource === 'application' ? 'applicationName' : 'name'
    await this.page.locator(`input[name="${inputName}"]`).fill(this.testResourceName(name))
  }

  async testResourceDetailsShouldBeDisplayed(name: string, resource: string) {
    await expect(this.page).toHaveURL(new RegExp(`/${resource}/\\d+(?:\\?.*)?$`), {
      timeout: API_WRITE_TIMEOUT_MS,
    })
    await expect(this.page.getByRole('heading', {
      name: this.testResourceNames.get(name) ?? name, exact: true,
    })).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })

    if (resource === 'applications') {
      await expect(this.page.getByRole('link', { name: 'Manage creds', exact: true })).toBeVisible()
      await expect(this.page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible()
      await expect(this.page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
      await expect(this.page.getByText(this.testResourceNames.get(name) ?? name, { exact: true }).first())
        .toBeVisible()
      await expect(this.page.getByRole('link', {
        name: this.testResourceNames.get('E2EVendor') ?? 'E2EVendor', exact: true,
      })).toBeVisible()
      await expect(this.page.getByRole('link', {
        name: this.testResourceNames.get('E2EClaimset') ?? 'E2EClaimset', exact: true,
      })).toBeVisible()
      await expect(this.page.getByRole('listitem').filter({ hasText: 'Grand Bend High School' }))
        .toBeVisible()
      await expect(this.page.getByRole('link', { name: /^https:\/\/localhost\/odsv7-/ }))
        .toBeVisible()

      const credentialsCreated = this.page.getByRole('heading', {
        name: 'Credentials Created', exact: true,
      })
      if (await credentialsCreated.count() > 0) {
        await expect(credentialsCreated).toBeVisible()
        await expect(this.page.getByText(/The link below will take you to a page/)).toBeVisible()
        await expect(this.page.getByRole('link', {
          name: /^https:\/\/localhost\/adminapp\//,
        })).toBeVisible()
      }
    }
  }

  async userCanViewKeyAndSecretGenerated() {
    const credentialsLink = this.page.getByRole('link', {
      name: /^https:\/\/localhost\/adminapp\/secret\/#\//,
    })
    await expect(credentialsLink).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })

    const popupPromise = this.page.waitForEvent('popup')
    await credentialsLink.click()
    const credentialsPage = await popupPromise

    await expect(credentialsPage.getByRole('heading', {
      name: 'Retrieve credentials', exact: true,
    })).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await credentialsPage.getByText('KEY: 123abc123abc SECRET:').click()
    await credentialsPage.getByRole('button', { name: 'Yes, retrieve them.', exact: true }).click()

    for (const label of ['Key', 'Secret', 'URL']) {
      await expect(credentialsPage.getByText(label, { exact: true }))
        .toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    }
  }

  async testResourceShouldBeAbsent(name: string) {
    if (/\/claimsets\/?$/.test(new URL(this.page.url()).pathname)) {
      await this.searchInputEnvironment.click()
      await this.searchInputEnvironment.fill(this.testResourceNames.get(name) ?? name)
      await expect(this.page.locator('tbody tr')).toHaveCount(0, { timeout: API_WRITE_TIMEOUT_MS })
      return
    }
    await expect(this.namedTestResourceRow(name)).toHaveCount(0, { timeout: API_WRITE_TIMEOUT_MS })
  }

  async credentialsShouldBeDisplayed(count?: number) {
    await expect(this.page).toHaveURL(/\/applications\/\d+\/apiClients$/, {
      timeout: API_FETCH_TIMEOUT_MS,
    })
    await expect(this.page.getByRole('heading', { name: 'Credentials', exact: true })).toBeVisible()
    if (count !== undefined) {
      await expect(this.page.locator('tbody tr')).toHaveCount(count, { timeout: API_WRITE_TIMEOUT_MS })
    } else {
      await expect(this.page.locator('tbody tr').first()).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    }
  }

  async openFirstCredential() {
    await this.clickFirstResourceRow()
  }

  async clickFirstCredentialAction(action: string) {
    const row = this.page.locator('tbody tr').first()
    await expect(row).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await row.hover()
    await row.getByRole('link', { name: action, exact: true })
      .or(row.getByRole('button', { name: action, exact: true })).click()
  }

  async fillCredentialFields(name: string) {
    await this.page.locator('input[name="name"]').fill(this.testResourceName(name))
    await this.selectFirstFormOption('ODS')
  }

  async returnToCredentials() {
    const url = new URL(this.page.url())
    url.pathname = url.pathname.replace(/(\/apiClients)(\/.*)?$/, '$1')
    url.search = ''
    await this.page.goto(url.href)
    await this.credentialsShouldBeDisplayed()
  }

  async onlyCredentialDeletionShouldBeBlocked(from: 'tab' | 'row') {
    await this.credentialsShouldBeDisplayed(1)
    if (from === 'tab') {
      await this.openFirstCredential()
    } else {
      await this.page.locator('tbody tr').first().hover()
    }
    const scope = from === 'tab' ? this.page : this.page.locator('tbody tr').first()
    await expect(scope.getByRole('button', {
      name: "This is the Application's only credential and can't be deleted. Create another credential first.",
      exact: true,
    })).toBeDisabled({ timeout: API_FETCH_TIMEOUT_MS })
  }

  async confirmCredentialReset() {
    const responsePromise = this.page.waitForResponse((response) =>
      response.request().method() === 'PUT' &&
      /\/apiClients\/\d+\/reset-credential(?:\?.*)?$/.test(new URL(response.url()).pathname),
    )
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click()
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    this.resetCredentials = await response.json()
  }

  async resetCredentialsShouldBeDisplayed() {
    if (this.resetCredentials?.link) {
      await expect(this.page.getByRole('heading', { name: 'Credentials Created', exact: true }))
        .toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
      await expect(this.page.getByRole('link', {
        name: this.resetCredentials.link, exact: true,
      })).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
      return
    }
    const credentials = this.resetCredentials
    if (!credentials?.key || !credentials.secret) {
      throw new Error('Reset response did not contain direct credentials or a sharing link')
    }
    await expect(this.page.getByRole('heading', { name: 'Key and secret created', exact: true }))
      .toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
    await expect(this.page.getByText(credentials.key, { exact: true }).first())
      .toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
  }

  async clickCreateButton() {
    await this.createButton.click()
  }

  async clickNewButton() {
    await this.newButton.click()
  }

  async fillOdsFields(name: string, template: string) {
    await this.odsNameInput.fill(name)
    await this.templateSelect.selectOption({ label: template })
  }

  async fillVendorFields(company: string, prefixes: string, contactName: string, contactEmail: string) {
    const editLink = this.page.getByRole('link', { name: 'Edit', exact: true })
    // `isVisible()` does not wait, so settle on whichever of the form (create flow) or the
    // details page's Edit link (edit flow) actually rendered before deciding what to click.
    await expect(
      this.vendorCompanyInput.or(editLink).first(),
      'Neither the vendor form nor the vendor Edit link rendered'
    ).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS })
    if (!(await this.vendorCompanyInput.isVisible())) {
      await editLink.click()
    }
    await this.vendorCompanyInput.fill(company)
    await this.vendorPrefixesInput.fill(prefixes)
    await this.vendorContactNameInput.fill(contactName)
    await this.vendorContactEmailInput.fill(contactEmail)
  }

  async importValidProfile(type: string) {
    if (type === 'valid'){
      await this.profileFileInput.setInputFiles('tests/e2e/environments-page/fixtures/valid-profile.xml')
    }
    if (type === 'invalid'){
      await this.profileFileInput.setInputFiles('tests/e2e/environments-page/fixtures/invalid-profile.xml')
    }

  }

  async profileShouldBeCreated() {
    await expect(this.profileDetails).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
  }

  async resourceTableShouldBeDisplayed() {
    await expect(this.resourceTable.first()).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await expect(this.resourceTable.locator('tbody tr').first()).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
  }

  async odsShouldBeDisplayedWithPendingStatus(name: string) {
    const row = this.resourceTable.locator('tbody tr').filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await expect(row).toContainText(/Create: Pending|Create: In Progress|Available/)
  }

  async resourceDetailsShouldBeDisplayed() {
    await expect(this.page.locator('.page-content-card').first()).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
  }

  async resourceShouldNotBeDisplayed(name: string) {
    await expect(this.resourceTable.locator('tbody tr').filter({ hasText: name })).toHaveCount(0, {
      timeout: UI_RENDER_TIMEOUT_MS,
    })
  }

  async invalidResourceFormShouldShowWarnings(expectedMessage?: string) {
    if (expectedMessage) {
      await expect(this.page.getByText(expectedMessage, { exact: true })).toBeVisible({
        timeout: UI_RENDER_TIMEOUT_MS,
      })
    }
  }

  async clickResourceRow(name: string) {
    const row = this.resourceTable.locator('tbody tr').filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await row.getByRole('link').first().click()
  }

  async hoverResourceRow(name: string) {
    const row = this.resourceTable.locator('tbody tr').filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await row.hover()
    this.lastHoveredResource = name
  }

  async clickFirstResourceRow() {
    await expect(this.resourceTable.locator('tbody tr').first()).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await this.resourceTable.locator('tbody tr').first().getByRole('link').first().click()
  }

  async firstEdorgDetailsShouldBeDisplayed() {
    await this.clickFirstResourceRow()

    const expectedAttributes: Array<[string, string | RegExp]> = [
      ['Ed-Org ID', '255901107'],
      ['Type', 'edfi.School'],
      ['Environment', /^FullSingleEnvironmentv2-/],
      ['Tenant', 'default'],
    ]

    for (const [label, value] of expectedAttributes) {
      const attribute = this.page.getByText(label, { exact: true }).locator('..')
      await expect(attribute.getByText(value, { exact: true })).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    }
  }

  async clickResourceAction(
    action: 'Edit' | 'Delete',
    resource: 'ods' | 'vendor',
    resourceName?: string,
  ) {

    // Use the row hoverResourceRow() last targeted rather than asking the browser which row
    // is under the mouse: `:hover` is instant and silently falls back to the first row,
    // which can be a different resource (e.g. the wrong ODS getting deleted).
    const targetName = resourceName ?? this.lastHoveredResource
    const row = targetName
      ? this.resourceTable.locator('tbody tr').filter({ hasText: targetName }).first()
      : this.resourceTable.locator('tbody tr').first()
    await expect(row).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    if (resource === 'ods' && action === 'Delete') {
      // A row whose create job has not finished ("Create: Pending" / "Create: In Progress") only
      // offers View, and the list does not refresh itself, so reload until the row is Available.
      await expect(async () => {
        await this.page.reload()
        await expect(row).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
        await expect(row.getByRole('cell', { name: 'Available', exact: true })).toBeVisible({
          timeout: POLL_ATTEMPT_TIMEOUT_MS,
        })
      }).toPass({ timeout: SYNC_COMPLETE_TIMEOUT_MS })
    }
    const actionControl =
      action === 'Edit' && resource === 'vendor'
        ? row.getByRole('link', { name: action, exact: true })
        : row.getByRole('button', { name: action, exact: true })
    // The row actions appear on hover. If the table re-renders after the hover (a list refetch)
    // they vanish, so hover again until they show instead of waiting out the whole click timeout.
    await expect(async () => {
      await row.hover()
      await expect(actionControl).toBeVisible({ timeout: POLL_ATTEMPT_TIMEOUT_MS })
    }).toPass({ timeout: API_FETCH_TIMEOUT_MS })
    await actionControl.click()
  }

  async clickDeleteControl() {
    await this.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  }

  async confirmResourceDeletion() {
    const yesButton = this.page.getByRole('button', { name: 'Yes', exact: true })
    await yesButton.click()
    await expect(yesButton).toBeHidden({ timeout: API_WRITE_TIMEOUT_MS })
  }

  async resourceShouldBeRemoved(name: string) {
    await expect(this.resourceTable.locator('tbody tr td:nth-child(2)').filter({ hasText: name })).toHaveCount(0, {
      timeout: API_WRITE_TIMEOUT_MS,
    })
  }

  async odsShouldHaveDeletePendingStatus(name: string) {
    const row = this.resourceTable.locator('tbody tr').filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: API_WRITE_TIMEOUT_MS })
    await expect(row.getByText('Delete: Pending', { exact: true })).toBeVisible({
      timeout: API_WRITE_TIMEOUT_MS,
    })
  }

  async setEducationOrganization(identifiers: string) {
    await this.eduOrgIdentifier.fill(identifiers)
  }

  async newEnvironmentDetailsLoaded() {
    await expect(this.environmentsMainContainer).toBeVisible({ timeout: 10000 })
  }

  async teamWithTenantsSectionsDisplayed() {
    await expect(this.teamSection).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
  }

  async syncQueueHasStarted() {
    await expect(this.syncQueueSection, 'Sync queue section never rendered on the environment page')
      .toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    // A sync can finish before this check runs, so "completed" is as valid as "active";
    // this only proves the job was queued, not that it is still running.
    await expect(
      this.syncQueueStatusBadge,
      'Sync queue never reported an "active" or "completed" job, so the environment sync was never queued'
    ).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
  }

  async grantOwnershipToAdminUser(
    resourceType: string,
    environment: string,
    team: string,
    role: string
  ) {
    await expect(this.grantownership).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await this.grantownership.click()
    await new GrantOwnershipPage(this.page).assignEnvironmentAccess(
      resourceType,
      environment,
      team,
      role
    )
  }

  async tenantIsDisplayed(tenantName: string) {
    const tenantLink = this.page.getByRole('link', { name: tenantName, exact: true })

    // Tenants appear only once the background sync writes them, and the page does not
    // live-update, so a failed attempt reloads before the next one re-checks.
    await expect(async () => {
      try {
        await expect(tenantLink).toBeVisible({ timeout: POLL_ATTEMPT_TIMEOUT_MS })
      } catch (error) {
        await this.page.reload({ waitUntil: 'domcontentloaded' })
        throw error
      }
    }, `Tenant "${tenantName}" never appeared after the environment sync`).toPass({
      timeout: SYNC_COMPLETE_TIMEOUT_MS,
      intervals: [POLL_ATTEMPT_TIMEOUT_MS],
    })
  }

  async selectFirstLoadedTenantOnEnvironment() {
    await expect(this.firstTenantSectionOnEnvironment).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS })
    await this.selectFirstLoadedTenant()
  }

  async selectFirsOdsEnvironment() {
    await this.odssTabLink.click()
    await this.selectFirstLoadedTenant()
  }

  async cleanTenantFilter() {
    if (await this.clearTenantSearchButton.isVisible()) {
      await this.clearTenantSearchButton.click()
    }
  }

  async selectFirstLoadedTenant() {
    await this.cleanTenantFilter()
    await expect(this.firstTableRowLink).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS })
    await this.firstTableRowLink.click()
  }

  async syncQueueIsCompleted() {
    await expect(
      this.syncQueueCompletedText,
      'Environment sync never reached "completed" in the sync queue'
    ).toBeVisible({ timeout: SYNC_COMPLETE_TIMEOUT_MS })
  }

  async defaultOdsIsLoaded() {
    await expect(
      this.odsAvailableText,
      'The synced ODS never reported "Available"'
    ).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS })
  }

  async apiVersionDetected() {
    await expect(
      this.apiVersionElement,
      'The environment never reported a detected Ed-Fi API version'
    ).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS })
  }

  async environmentMainPageLoadedWithoutEnvironmentCreated() {
    await expect(this.environmentsMainContainer).toBeVisible()
    await expect(this.environmentsMainContainer).not.toContainText('TEST');
  }

  async requiredFieldsHighlighted(fieldName: string) {
    const normalized = fieldName.trim().toLowerCase()

    if (normalized === 'label') {
        await expect(this.page.getByText('Environment Label is required', { exact: false })).toBeVisible();
      return
    }
    if (normalized === 'ods instance') {
        await expect(this.page.getByText('At least one ODS instance is required', { exact: false })).toBeVisible();
      return
    }
    if (normalized === 'none') {
        await expect(this.page.getByText('Name is required')).toBeVisible();
        await expect(this.page.getByText('Ed-Fi API Discovery URL is')).toBeVisible();
        await expect(this.page.getByText('Management API Discovery URL is required')).toBeVisible();
        await expect(this.page.getByText('Environment Label is required')).toBeVisible();
      return
    }
    if (normalized === 'name') {
        await expect(this.page.getByText('Ed-Fi API Discovery URL is')).toBeVisible();
        await expect(this.page.getByText('Management API Discovery URL is required')).toBeVisible();
        await expect(this.page.getByText('Environment Label is required')).toBeVisible();
      return
    }
    if (normalized === 'ed-fi api') {
        await expect(this.page.getByText('Name is required')).toBeVisible();
        await expect(this.page.getByText('Management API Discovery URL is required')).toBeVisible();
        await expect(this.page.getByText('Environment Label is required')).toBeVisible();
      return
    }
    if (normalized === 'ed-fi management') {
        await expect(this.page.getByText('Name is required')).toBeVisible();
        await expect(this.page.getByText('Ed-Fi API Discovery URL is')).toBeVisible();
        await expect(this.page.getByText('Environment Label is required')).toBeVisible();
      return
    }
    if (normalized === 'env label') {
        await expect(this.page.getByText('Name is required')).toBeVisible();
        await expect(this.page.getByText('Ed-Fi API Discovery URL is')).toBeVisible();
        await expect(this.page.getByText('Management API Discovery URL is required')).toBeVisible();
      return
    }
    if (normalized === 'educorgident') {
        await expect(this.page.getByText('Name is required')).toBeVisible();
        await expect(this.page.getByText('Environment Label is required')).toBeVisible();
      return
    }
  }

  async requiredFieldHighlighted(fieldName: string) {
    const normalized = fieldName.trim().toLowerCase()
    if (normalized === 'ods instance') {
        await expect(this.page.getByText('At least one ODS instance is required', { exact: false })).toBeVisible();
      return
    }
    if (normalized === 'name') {
        await expect(this.page.getByText('Name is required')).toBeVisible();
        await expect(this.page.getByText('At least one ODS instance is required', { exact: false })).toBeVisible();
      return
    }
    if (normalized === 'ed-fi management') {
        await expect(this.page.getByText('Management API Discovery URL is required')).toBeVisible();
      return
    }
  }

  async newEnvironmentLoadedInMainPage() {
    await expect(this.environmentsMainContainer).toBeVisible()
  }

  async clickOnFirstEnvironment() {
    await this.firstEnvironmentRowSpan.click();
    // click() returns before the route changes.
    await expect(this.page).toHaveURL(/\/sb-environments\/\d+\/?$/, { timeout: UI_RENDER_TIMEOUT_MS })
  }

  async searchAndSelectEnvironment(environmentName: string, withinEnvironment = false) {
    const searchLocator = withinEnvironment ? this.searchInputEnvironment : this.searchInput
    await searchLocator.fill(environmentName)
    await expect(this.tableRows.first()).toContainText(environmentName)
    await this.clickOnFirstEnvironment()
  }

  async clickOnTabOption(optionName: string) {
    switch (optionName.trim().toLowerCase()) {
      case 'edit':
        // The URL changes before the detail page renders, and every list row has an "Edit
        // environment details" link. A strict mode violation is not retried, so wait until only
        // the detail page's link is left.
        await expect(this.editEnvDetails).toHaveCount(1, { timeout: UI_RENDER_TIMEOUT_MS })
        await this.editEnvDetails.click()
        break
      case 'delete':
        await this.deleteEnvDetails.click()
        break
      case 'grantownership':
        await this.grantownership.click()
        break
      default:
        throw new Error(`Unsupported option name: ${optionName}`)
    }
  }

  async renameEnvironment() {
    await this.nameInput.fill('UpdateName')
  }

  async environmentNameIsUpdated() {
    await this.clickEnvironmentOption()
    await this.page.reload()
    await expect(this.environmentsMainContainer).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS })
    await expect(this.environmentsMainContainer).toContainText('UpdateName', {
      timeout: API_FETCH_TIMEOUT_MS,
    })
  }

  async clickOnTheFirstOptionFromThreeDots(optionName: string) {
    const firstRow = this.tableRows.first()
    // count() below does not wait: without a loaded table it records 0 rows.
    await expect(firstRow).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await firstRow.hover()

    switch (optionName.trim().toLowerCase()) {
      case 'edit':
        await firstRow.getByRole('link', { name: optionName, exact: true }).click()
        break
      case 'delete':
        this.rowCountBeforeDelete = await this.tableRows.count()
        await firstRow.getByRole('button', { name: optionName, exact: true }).click()
        break
      default:
        throw new Error(`Unsupported option name: ${optionName}`)
    }
  }

  async clickOnTheOptionFromMoreThreeDots(optionName: string) {
    const firstRow = this.tableRows.first()
    await expect(firstRow).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS })
    await firstRow.hover()
    switch (optionName.trim().toLowerCase()) {
      case 'delete':
        this.rowCountBeforeDelete = await this.tableRows.count()
        await firstRow.getByRole('button', { name: 'more', exact: true }).click()
        await this.deleteMenuItem.click()
        break
      case 'grantownership':
        await this.grantownership.click()
        break
      default:
        throw new Error(`Unsupported option name: ${optionName}`)
    }
  }

  async clickOnDeletePopup(optionName: boolean) {
    const popupButton = optionName ? this.yesDeletePopup : this.noDeletePopup
    await popupButton.click()
    // Yes deletes through the API; No only closes the dialog.
    await expect(popupButton).toBeHidden({
      timeout: optionName ? API_WRITE_TIMEOUT_MS : UI_RENDER_TIMEOUT_MS,
    })
  }

  async environmentShouldBeRemoved(environmentName: string) {
    await expect(this.environmentsMainContainer).toBeVisible()
    await expect(this.environmentsMainContainer).not.toContainText(environmentName);
  }

  async environmentStillAvailableAfterCancel() {
    await expect(this.environmentsMainContainer).toBeVisible()
    await expect(this.tableRows).toHaveCount(this.rowCountBeforeDelete)
  }

  async ownershipsFormIsDisplayed() {
    await expect(this.ownershipResourceTypesText).toBeVisible();
    await expect(this.ownershipFormSummaryText).toBeVisible();
  }
}

export default EnvironmentsPage
