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
  private readonly runSuffix = Date.now().toString(36)
  private rowCountBeforeDelete = 0

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
  }

  async clickEnvironmentOption() {
    await this.environmentOption.click()
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
    await this.nameInput.fill(`${names}-${this.runSuffix}`, {timeout: 700})
    await this.edfiApiInput.fill(edfiApi, {timeout: 1000})
    await this.edfiManagementInput.fill(edfiManagement, {timeout: 1000})
    await this.labelInput.fill(label, {timeout: 700})
    await this.addOdsInstances.click()
    await this.odsName.fill(odsName)
    await this.dbName.fill(dbName)
    await this.eduOrgIdentifier.fill(eduOrgIdentifier)
  }

  async fillAllRequiredFieldsV2(name: string, edfiApi: string, edfiManagement: string, label: string) {
    await this.nameInput.fill(`${name}-${this.runSuffix}`, {timeout: 700})
    await this.edfiApiInput.fill(edfiApi, {timeout: 1000})
    await this.edfiManagementInput.fill(edfiManagement, {timeout: 1000})
    await this.labelInput.fill(label, {timeout: 700})
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
    await this.page.reload({ waitUntil: 'networkidle' });
    await expect(this.environmentsMainContainer).toBeVisible()
    await expect(this.environmentsMainContainer).toContainText('UpdateName');
  }

  async clickOnTheFirstOptionFromThreeDots(optionName: string) {
    const firstRow = this.tableRows.first()
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
    if(!optionName){
      await this.noDeletePopup.click()
    } else {
      await this.yesDeletePopup.click()
    }
    await this.page.waitForLoadState('networkidle')
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
