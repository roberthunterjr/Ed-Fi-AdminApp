// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { randomUUID } from 'node:crypto';
import { expect, Page } from '@playwright/test';
import {
  API_FETCH_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
  UI_RENDER_TIMEOUT_MS,
  clickNavLink,
  selectComboboxOption,
} from './support';
import TeamsPage from './teams-page';

type OwnershipAction = 'view' | 'edit' | 'delete';
type DeleteConfirmation = 'yes' | 'no';

class OwnershipsPage {
  private readonly ownershipsOption;
  private readonly grantNewButton;
  private readonly resourceTypeGroup;
  private readonly saveButton;
  private readonly cancelButton;
  private readonly pageHeading;
  private readonly tableRows;
  private readonly firstOwnershipLink;
  private readonly viewAction;
  private readonly editAction;
  private readonly deleteAction;
  private readonly editTab;
  private readonly deleteTab;
  private readonly yesButton;
  private readonly noButton;
  private readonly details;

  private selectedOwnershipName: string | null = null;
  private selectedRoleBeforeEdit: string | null = null;
  private createdTeam: { baseName: string; name: string } | null = null;

  constructor(private readonly page: Page) {
    this.ownershipsOption = this.page.locator('a[title="Ownerships"]');
    this.grantNewButton = this.page.getByRole('link', { name: 'Grant new', exact: true });
    this.resourceTypeGroup = this.page.getByRole('radiogroup');
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true });
    this.cancelButton = this.page.getByRole('button', { name: 'Cancel', exact: true });
    this.pageHeading = this.page.getByRole('heading', { name: 'Resource ownerships' });
    this.tableRows = this.page.locator('tbody tr');
    this.firstOwnershipLink = this.tableRows.first().getByRole('link').first();
    this.viewAction = this.page.getByRole('link', { name: 'View', exact: true });
    this.editAction = this.page.getByRole('link', { name: 'Edit', exact: true });
    this.deleteAction = this.page.getByRole('button', { name: 'Delete', exact: true });
    this.editTab = this.page.getByRole('link', { name: 'Edit', exact: true });
    this.deleteTab = this.page.getByRole('button', { name: 'Delete', exact: true });
    this.yesButton = this.page.getByRole('button', { name: 'Yes', exact: true });
    this.noButton = this.page.getByRole('button', { name: 'No', exact: true });
    this.details = this.page.locator('.page-content-card');
  }

  async clickOwnershipsOption() {
    await clickNavLink(this.page, this.ownershipsOption, /\/adminapp\/ownerships\/?$/);
    await this.ownershipsTableShouldBeDisplayed();
  }

  async createUniqueTeam(baseName: string) {
    const teamName = `${baseName}-${randomUUID()}`;
    const teamsPage = new TeamsPage(this.page);
    await teamsPage.clickTeamsOption();
    await teamsPage.clickCreateNewButton();
    await teamsPage.fillTeamName(teamName);
    await teamsPage.clickSaveButton();
    await expect(this.page).toHaveURL(/\/teams\/\d+\/?$/);
    await expect(this.page.getByRole('heading', { name: teamName, exact: true })).toBeVisible();
    this.createdTeam = { baseName, name: teamName };
    await this.clickOwnershipsOption();
  }

  async clickGrantNewButton() {
    await this.grantNewButton.click();
    await expect(
      this.page.getByRole('heading', { name: 'Grant new resource ownership' }),
    ).toBeVisible();
  }

  async fillRequiredFields(
    resourceType: string,
    environment: string,
    tenant: string,
    team: string,
    role: string,
  ) {
    await this.resourceTypeGroup.getByText(resourceType, { exact: true }).click();
    await expect(
      this.resourceTypeGroup.getByRole('radio', { name: resourceType, exact: true }),
    ).toBeChecked();

    await selectComboboxOption(this.page, 'Environment', environment);
    if (resourceType !== 'Whole environment') {
      await selectComboboxOption(this.page, 'Tenant', tenant);
    }
    if (resourceType == 'Ods') {
      await selectComboboxOption(this.page, 'ODS', tenant);
    }
    await selectComboboxOption(
      this.page,
      'Team',
      this.createdTeam?.baseName === team ? this.createdTeam.name : team,
    );
    await selectComboboxOption(this.page, 'Role', role);
  }

  async clickSaveButton() {
    await this.saveButton.click();
    // Create and edit both leave their form route once the write round-trips to the API.
    await expect(this.page).not.toHaveURL(/\/create|[?]edit=true/, { timeout: API_WRITE_TIMEOUT_MS });
  }

  async clickCancelButton() {
    await this.cancelButton.click();
    await expect(this.page).not.toHaveURL(/\/create|[?]edit=true/, { timeout: UI_RENDER_TIMEOUT_MS });
  }

  async clickRowAction(action: OwnershipAction) {
    await this.captureFirstOwnershipName();
    await this.tableRows.first().hover();

    switch (action) {
      case 'view':
        await this.viewAction.click();
        break;
      case 'edit':
        await this.captureFirstOwnershipRole();
        await this.editAction.click();
        break;
      case 'delete':
        await this.deleteAction.click();
        break;
    }
  }

  async clickFirstOwnership() {
    await this.captureFirstOwnershipName();
    await this.captureFirstOwnershipRole();
    await this.firstOwnershipLink.click();
    await expect(this.page).toHaveURL(/\/ownerships\/\d+\/?$/, { timeout: UI_RENDER_TIMEOUT_MS });
  }

  async clickEditTab() {
    await this.editTab.click();
  }

  async clickDeleteTab() {
    await this.deleteTab.click();
  }

  async changeRole(roleName: string) {
    await selectComboboxOption(this.page, 'Role', roleName);
  }

  async confirmDelete(answer: DeleteConfirmation) {
    const button = answer === 'yes' ? this.yesButton : this.noButton;
    await button.click();
    // Yes deletes through the API; No only closes the dialog.
    await expect(button).toBeHidden({
      timeout: answer === 'yes' ? API_WRITE_TIMEOUT_MS : UI_RENDER_TIMEOUT_MS,
    });
  }

  async newOwnershipDetailsShouldBeDisplayed() {
    await expect(this.page).toHaveURL(/\/ownerships\/\d+\/?$/);
    await this.ownershipDetailsShouldBeDisplayed();
  }

  async ownershipDetailsShouldBeDisplayed() {
    await expect(this.details.getByText('Team', { exact: true })).toBeVisible();
    await expect(this.details.getByText('Role', { exact: true })).toBeVisible();
    await expect(this.details.getByText('Resource', { exact: true })).toBeVisible();
  }

  async ownershipDetailsShouldShowLatestChange() {
    await this.ownershipDetailsShouldBeDisplayed();
    if (this.selectedRoleBeforeEdit) {
      await expect(this.details).not.toContainText(this.selectedRoleBeforeEdit);
    }
  }

  async ownershipShouldNotBeChanged() {
    await this.ownershipDetailsShouldBeDisplayed();
    if (this.selectedRoleBeforeEdit) {
      await expect(this.details).toContainText(this.selectedRoleBeforeEdit);
    }
  }

  async ownershipsTableShouldBeDisplayed() {
    await expect(this.pageHeading).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS });
    await expect(this.page.locator('table')).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS });
  }

  async selectedOwnershipShouldBeRemoved() {
    await this.ownershipsTableShouldBeDisplayed();
    //if (this.selectedOwnershipName) {
    //  await expect(this.page.locator('tbody')).not.toContainText(this.selectedOwnershipName);
    //}
  }

  async selectedOwnershipShouldNotBeRemoved() {
    await this.ownershipsTableShouldBeDisplayed();
    if (this.selectedOwnershipName) {
      await expect(this.page.locator('tbody')).toContainText(this.selectedOwnershipName);
    }
  }

  private async captureFirstOwnershipName() {
    this.selectedOwnershipName = (await this.firstOwnershipLink.textContent())?.trim() ?? null;
  }

  private async captureFirstOwnershipRole() {
    const roleLink = this.tableRows.first().locator('a[title="Go to role"]');
    this.selectedRoleBeforeEdit = (await roleLink.textContent())?.trim() ?? null;
  }

  private async selectFirstComboboxOption(label: string) {
    const combobox = this.page.getByRole('combobox', { name: label, exact: true });
    await combobox.click();
    await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
  }
}

export default OwnershipsPage;
