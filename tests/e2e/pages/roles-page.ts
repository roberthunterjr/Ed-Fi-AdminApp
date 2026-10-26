// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { expect, Page } from '@playwright/test';
import {
  API_FETCH_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
  UI_RENDER_TIMEOUT_MS,
  clickNavLink,
} from './support';

type RoleAction = 'view' | 'edit' | 'delete';
type DeleteConfirmation = 'yes' | 'no';

class RolesPage {
  private readonly rolesOption;
  private readonly createNewButton;
  private readonly nameInput;
  private readonly descriptionInput;
  private readonly typeOption;
  private readonly saveButton;
  private readonly cancelButton;
  private readonly rolesHeading;
  private readonly rolesTable;
  private readonly tableRows;
  private readonly firstRoleRow;
  private readonly searchInput;
  private readonly rowActionsViewButton;
  private readonly rowActionsEditButton;
  private readonly rowActionsDeleteButton;
  private readonly editTab;
  private readonly deleteTab;
  private readonly yesButton;
  private readonly noButton;
  private readonly roleDetails;

  private selectedRoleName: string | null = null;

  constructor(private readonly page: Page) {
    this.rolesOption = this.page.locator('a[title="Roles"]');
    this.createNewButton = this.page.getByRole('link', { name: 'Create new' });
    this.nameInput = this.page.locator('input[name="name"]');
    this.descriptionInput = this.page.locator('input[name="description"]');
    this.typeOption = this.page.getByRole('radiogroup');
    this.saveButton = this.page.locator('button:has-text("Save")');
    this.cancelButton = this.page.locator('button:has-text("Cancel")');
    this.rolesHeading = this.page.getByRole('heading', { name: 'Roles' });
    this.rolesTable = this.page.getByText('More optionsAdd sortNameTypeOwned byModified byCreatedCreated byAdd filterName');
    this.tableRows = this.page.locator('tbody tr');
    this.firstRoleRow = this.tableRows.first().getByRole('link').first();
    this.searchInput = this.page.getByPlaceholder('Search');
    this.rowActionsViewButton = this.page.getByRole('link', { name: 'View', exact: true });
    this.rowActionsEditButton = this.page.getByRole('link', { name: 'Edit', exact: true });
    this.rowActionsDeleteButton = this.page.getByRole('button', { name: 'Delete', exact: true });
    this.editTab = this.page.getByRole('link', { name: 'Edit' });
    this.deleteTab = this.page.getByRole('button', { name: 'Delete' });
    this.yesButton = this.page.getByRole('button', { name: 'Yes' });
    this.noButton = this.page.getByRole('button', { name: 'No' });
    this.roleDetails = this.page.locator('div').filter({ hasText: 'Home/Roles/' }).nth(4);
  }

  async navigate(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async clickRolesOption() {
    await clickNavLink(this.page, this.rolesOption, /\/adminapp\/roles\/?$/);
    await this.rolesPageShouldBeLoaded();
  }

  async clickCreateNewButton() {
    await this.createNewButton.click();
  }

  async fillRequiredFields(name: string, description: string, type: string, privileges: string) {
    await this.nameInput.fill(name);
    await this.descriptionInput.fill(description);
    await this.typeOption.getByText(type, { exact: true }).click();
    await expect(this.typeOption.getByRole('radio', { name: type, exact: true })).toBeChecked();
    await this.selectPrivilege(privileges);
  }

  async updateRequiredFields(name: string, description: string, privileges: string) {
    await this.nameInput.fill(name);
    await this.descriptionInput.fill(description);
    await this.selectPrivilege(privileges);
  }

  async clickSaveButton() {
    await this.saveButton.click();
    // The form (the only page with a name input) closes once the write round-trips to the API.
    await expect(this.nameInput).toBeHidden({ timeout: API_WRITE_TIMEOUT_MS });
  }

  async clickCancelButton() {
    await this.cancelButton.click();
    await expect(this.nameInput).toBeHidden({ timeout: UI_RENDER_TIMEOUT_MS });
  }

  async filterRoleCreated(roleName = 'userRole') {
    await this.searchInput.fill(roleName);
    await expect(this.tableRows.first()).toContainText(roleName, { ignoreCase: true });
  }

  async clickRoleAction(action: RoleAction) {
    await this.firstRoleRow.hover();

    switch (action) {
      case 'view':
        await this.rowActionsViewButton.click();
        break;
      case 'edit':
        await this.rowActionsEditButton.click();
        break;
      case 'delete':
        await this.captureSelectedRoleName();
        await this.rowActionsDeleteButton.click();
        break;
    }
  }

  async clickRole(roleName: string) {
    this.selectedRoleName = roleName;
    await this.firstRoleRow.filter({ hasText: roleName }).click();
  }

  async clickEditTab() {
    await this.editTab.click();
  }

  async clickDeleteTab() {
    await this.deleteTab.click();
  }

  async confirmDelete(answer: DeleteConfirmation) {
    const button = answer === 'yes' ? this.yesButton : this.noButton;
    await button.click();
    // Yes deletes through the API; No only closes the dialog.
    await expect(button).toBeHidden({
      timeout: answer === 'yes' ? API_WRITE_TIMEOUT_MS : UI_RENDER_TIMEOUT_MS,
    });
  }

  async newRoleDetailsShouldBeDisplayed(name: string, description: string, type: string) {
    await expect(this.roleDetails).toContainText(name, { timeout: API_FETCH_TIMEOUT_MS });
    await expect(this.roleDetails).toContainText(description);
    await expect(this.roleDetails).toContainText(type);
  }

  async updatedRoleDetailsShouldBeDisplayed(name: string, description: string) {
    await expect(this.roleDetails).toContainText(name, { timeout: API_FETCH_TIMEOUT_MS });
    await expect(this.roleDetails).toContainText('Type');
    await expect(this.roleDetails).toContainText(description);
  }

  async roleShouldNotBeCreated(name: string) {
    await this.rolesPageShouldBeLoaded();
    await expect(this.rolesTable).not.toContainText(name);
  }

  async roleDetailsShouldBeDisplayed() {
    await expect(this.roleDetails).toContainText('Description');
    await expect(this.roleDetails).toContainText('Type');

  }

  async selectedRoleShouldBeRemoved() {
    await this.rolesPageShouldBeLoaded();
    if (this.selectedRoleName) {
      await expect(this.rolesTable).not.toContainText(this.selectedRoleName);
    }
  }

  async selectedRoleShouldNotBeRemoved() {
    await this.rolesPageShouldBeLoaded();
    if (this.selectedRoleName) {
      await expect(this.rolesTable).toContainText(this.selectedRoleName);
    }
  }

  async rolesPageShouldBeLoaded() {
    await expect(this.rolesHeading).toBeVisible({ timeout: UI_RENDER_TIMEOUT_MS });
    await expect(this.rolesTable).toBeVisible({ timeout: API_FETCH_TIMEOUT_MS });
  }

  private async captureSelectedRoleName() {
    this.selectedRoleName = (await this.firstRoleRow.textContent())?.trim() ?? null;
  }

  private async selectPrivilege(privileges: string) {
    const privilegesRegion = this.page.locator(
      '.page-content-card'
    );
    await privilegesRegion.getByText(privileges, { exact: true }).nth(0).click();
  }
}

export default RolesPage;
