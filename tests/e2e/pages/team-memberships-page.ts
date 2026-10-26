// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { expect, Page } from '@playwright/test'
import {
  API_FETCH_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
  POLL_ATTEMPT_TIMEOUT_MS,
  UI_RENDER_TIMEOUT_MS,
  clickNavLink,
} from './support'

class TeamMembershipsPage {
  private readonly teamMembershipsOption
  private readonly createNewButton
  private readonly saveButton
  private readonly cancelButton
  private readonly pageHeading
  private readonly firstMembershipLink
  private readonly firstMembershipTeam

  private selectedMembershipName: string | null = null
  private selectedMembershipId: string | null = null
  private selectedRoleBeforeEdit: string | null = null
  private lastLinkOptionUsed: string | null = null

  constructor(private readonly page: Page) {
    this.teamMembershipsOption = this.page.locator('a[title="Team memberships"]')
    this.createNewButton = this.page.locator('a[title="Create new team membership."]')
    this.saveButton = this.page.getByRole('button', { name: 'Save' })
    this.cancelButton = this.page.getByRole('button', { name: 'Cancel' })
    this.pageHeading = this.page.locator('main h2')
    this.firstMembershipLink = this.page.locator('tbody td span').first()
    this.firstMembershipTeam = this.page.locator('a[title="Go to team"]').first()
  }

  async clickTeamMembershipsOption() {
    await clickNavLink(this.page, this.teamMembershipsOption, /\/adminapp\/user-team-memberships\/?$/)
  }

  async clickCreateNewButton() {
    await this.createNewButton.click()
  }

  async fillRequiredFields(team: string, user: string, role: string) {
    await this.selectComboboxOption('Team', team)
    await this.selectComboboxOption('User', user)
    await this.selectComboboxOption('Role', role)
  }

  async clickSaveButton() {
    await this.saveButton.click()
    // Create and edit both leave their form route once the write round-trips to the API.
    await expect(this.page).not.toHaveURL(/\/create|[?]edit=true/, { timeout: API_WRITE_TIMEOUT_MS })
  }

  async clickCancelButton() {
    await this.cancelButton.click()
    await expect(this.page).not.toHaveURL(/\/create|[?]edit=true/, { timeout: UI_RENDER_TIMEOUT_MS })
  }

  async newTeamMembershipDetailsShouldBeLoaded() {
    await expect(this.page).toHaveURL(/\/user-team-memberships\/\d+\/?$/)
    await this.teamMembershipDetailsShouldBeDisplayed()
  }

  async newTeamMembershipShouldNotBeCreated() {
    await expect(this.page).toHaveURL(/\/user-team-memberships\/?$/)
    await expect(this.page.getByRole('heading', { name: 'Team memberships' })).toBeVisible()
  }

  async clickOptionFromActions(option: 'view' | 'edit' | 'delete') {
    const firstRow = this.page.locator('tbody td span').first()
    await firstRow.hover()

    switch (option.trim().toLowerCase()) {
      case 'view':
        await this.page.getByRole('link', { name: 'View', exact: true }).click()
        break
      case 'edit':
        await this.page.getByRole('link', { name: 'Edit', exact: true }).click()
        break
      case 'delete':
        await this.page.getByRole('button', { name: 'Delete', exact: true }).click()
        break
      default:
        throw new Error(`Unsupported option name: ${option}`)
    }
  }

  async clickFirstTeamMembershipFromTable() {
    await this.filterToTestMemberships()
    await this.captureFirstMembershipName()
    await this.firstMembershipLink.click()
    await expect(this.page).toHaveURL(/\/user-team-memberships\/\d+\/?$/, { timeout: UI_RENDER_TIMEOUT_MS })
  }

  async clickEditTab() {
    await this.captureCurrentRole()
    await this.page.getByRole('link', { name: 'Edit' }).click()
  }

  async clickDeleteTab() {
    await this.page.getByRole('button', { name: 'Delete' }).click()
  }

  async updateTeamMembershipRole() {
    await this.captureCurrentRole()
    const roleCombo = this.page.getByRole('combobox', { name: 'Role' })
    await roleCombo.click()
    await this.page.keyboard.press('ArrowDown')
    await this.page.keyboard.press('Enter')
  }

  async clickDeleteConfirmationButton(option: 'yes' | 'no') {
    if (option === 'yes') {
      await this.page.getByRole('button', { name: 'Yes' }).click()
      return
    }
    await this.page.getByRole('button', { name: 'No' }).click()
  }

  async teamMembershipDetailsShouldBeDisplayed() {
    await expect(this.page.getByText('Team', { exact: true })).toBeVisible()
    await expect(this.page.getByText('User', { exact: true })).toBeVisible()
    await expect(this.page.getByText('Role', { exact: true })).toBeVisible()
    await expect(this.page.getByText('UserName', { exact: true })).toBeVisible()
  }

  async newChangesShouldBeAppliedAndDisplayed() {
    await expect(this.page).toHaveURL(/\/user-team-memberships\/\d+\/?$/)
    await this.teamMembershipDetailsShouldBeDisplayed()
  }

  async teamInformationShouldNotBeUpdated() {
    await expect(this.page).toHaveURL(/\/user-team-memberships\/\d+\/?$/)
    await this.teamMembershipDetailsShouldBeDisplayed()
    if (this.selectedRoleBeforeEdit) {
      await expect(this.page.getByText(this.selectedRoleBeforeEdit, { exact: true })).toBeVisible()
    }
  }

  async prepareDeleteFromTable() {
    await this.filterToTestMemberships()
    await this.captureFirstMembershipName()
  }

  private async filterToTestMemberships() {
    const search = this.page.getByRole('textbox', { name: 'Search' }).first()
    await search.fill('teamMember')
    await search.press('Enter')
    // The filter lands after the keystroke. Capturing the first row before then grabs an
    // unfiltered row (a different membership than the one acted on next).
    await expect(this.firstMembershipTeam).toContainText('teamMember')
  }

  async prepareDeleteFromDetail() {
    await this.captureCurrentMembershipName()
  }

  async selectedTeamMembershipShouldBeRemoved() {
    await expect(this.page).toHaveURL(/\/user-team-memberships\/?$/, { timeout: API_WRITE_TIMEOUT_MS })
    await expect(this.page.getByRole('heading', { name: 'Team memberships' })).toBeVisible({
      timeout: API_FETCH_TIMEOUT_MS,
    })
    if (this.selectedMembershipId) {
      await expect(this.membershipRow(this.selectedMembershipId)).toHaveCount(0)
    } else if (this.selectedMembershipName) {
      await expect(this.page.locator('tbody')).not.toContainText(this.selectedMembershipName)
    }
  }

  async selectedTeamMembershipShouldNotBeRemoved() {
    await this.clickTeamMembershipsOption()
    await expect(this.page).toHaveURL(/\/user-team-memberships\/?$/)
    await expect(this.page.getByRole('heading', { name: 'Team memberships' })).toBeVisible()
    if (this.selectedMembershipId) {
      await expect(this.membershipRow(this.selectedMembershipId)).toHaveCount(1)
    } else if (this.selectedMembershipName) {
      await expect(this.page.locator('tbody')).toContainText(this.selectedMembershipName)
    }
  }

  async clickLinkOptionFromFirstRow(optionName: string) {
    this.lastLinkOptionUsed = optionName
    switch (optionName) {
      case 'team':
        await this.page.locator('a[title="Go to team"]').first().click()
        break
      case 'user':
      case 'username':
        await this.page.locator('a[title="Go to user"]').first().click()
        break
      case 'role':
        await this.page.locator('a[title="Go to role"]').first().click()
        break
      case 'created':
        await this.firstMembershipLink.click()
        break
      default:
        throw new Error(`Unsupported optionName: ${optionName}`)
    }
  }

  async redirectForLinkOptionShouldBeCorrect(optionName: string) {
    switch (optionName) {
      case 'team':
        await expect(this.page).toHaveURL(/\/teams\/\d+\/?$/)
        break
      case 'user':
      case 'username':
        await expect(this.page).toHaveURL(/\/users\/\d+\/?$/)
        break
      case 'role':
        await expect(this.page).toHaveURL(/\/roles\/\d+\/?$/)
        break
      case 'created':
        await expect(this.page).toHaveURL(/\/user-team-memberships\/\d+\/?$/)
        break
      default:
        throw new Error(`Unsupported optionName: ${optionName}`)
    }
  }

  async relatedInformationShouldBeDisplayed() {
    if (this.lastLinkOptionUsed === null) {
      await expect(this.pageHeading).toBeVisible()
      return
    }

    switch (this.lastLinkOptionUsed) {
      case 'team':
        await expect(this.page.getByText('Name', { exact: true })).toBeVisible()
        break
      case 'user':
      case 'username':
        await expect(this.page.getByText('Username', { exact: true })).toBeVisible()
        break
      case 'role':
        await expect(this.page.getByText('Description', { exact: true })).toBeVisible()
        break
      case 'created':
        await this.teamMembershipDetailsShouldBeDisplayed()
        break
      default:
        await expect(this.pageHeading).toBeVisible()
        break
    }
  }

  private mapActionLabel(option: 'view' | 'edit' | 'delete') {
    switch (option) {
      case 'view':
        return 'View'
      case 'edit':
        return 'Edit'
      case 'delete':
        return 'Delete'
      default:
        throw new Error(`Unsupported option: ${option}`)
    }
  }

  private async selectComboboxOption(label: string, preferredOptionText: string) {
    const combobox = this.page.getByText(label, { exact: true })
    await combobox.click()
    await this.page.keyboard.type(preferredOptionText)
    const preferredOption = this.page.getByRole('option', { name: preferredOptionText, exact: true })
    // The options filter asynchronously after typing, so an instant isVisible() could miss the
    // preferred one and fall back to whichever option happens to be first.
    const hasPreferredOption = await preferredOption
      .waitFor({ state: 'visible', timeout: POLL_ATTEMPT_TIMEOUT_MS })
      .then(() => true, () => false)
    if (hasPreferredOption) {
      await preferredOption.click()
      return
    }
    await this.page.keyboard.press('ArrowDown')
    await this.page.keyboard.press('Enter')
  }

  private async captureFirstMembershipName() {
    await expect(this.firstMembershipTeam).toBeVisible()
    this.selectedMembershipName = (await this.firstMembershipTeam.textContent())?.trim() ?? null
    // The team name is not unique (several memberships can share a team), so also keep the
    // membership's own id to tell afterwards whether this exact row is gone.
    const href = await this.page
      .locator('tbody tr')
      .first()
      .getByRole('link', { name: 'Membership', exact: true })
      .getAttribute('href')
    this.selectedMembershipId = href?.match(/user-team-memberships\/(\d+)/)?.[1] ?? null
  }

  /** The table row for one membership. Rows, not links: a row can hold several anchors with the same href. */
  private membershipRow(id: string) {
    return this.page.locator('tbody tr').filter({
      has: this.page.locator(`a[href$="/user-team-memberships/${id}"]`),
    })
  }

  private async captureCurrentMembershipName() {
    await expect(this.firstMembershipTeam).toBeVisible()
    this.selectedMembershipName = (await this.firstMembershipTeam.textContent())?.trim() ?? null
  }

  private async captureCurrentRole() {
    const roleValue = this.page.getByText('Role', { exact: true }).locator('xpath=following::a[1]')
    const hasRoleValue = await roleValue
      .waitFor({ state: 'visible', timeout: POLL_ATTEMPT_TIMEOUT_MS })
      .then(() => true, () => false)
    if (hasRoleValue) {
      this.selectedRoleBeforeEdit = (await roleValue.textContent())?.trim() ?? null
    }
  }
}

export default TeamMembershipsPage
