// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { createBdd } from 'playwright-bdd';
import OwnershipsPage from '../pages/ownerships-page';

const { When, Then } = createBdd();

let ownershipsPage: OwnershipsPage;

When('the user clicks the Ownerships option', async ({ page }) => {
  ownershipsPage = new OwnershipsPage(page);
  await ownershipsPage.clickOwnershipsOption();
});

When(/^the user creates a unique ownership team based on (.+)$/, async ({}, team: string) => {
  await ownershipsPage.createUniqueTeam(team.trim());
});

When('the user clicks the Grant new ownership button', async () => {
  await ownershipsPage.clickGrantNewButton();
});

When(
  /^the user fills the ownership fields ([^,]+), ([^,]+), ([^,]+), ([^,]+), (.+)$/,
  async ({}, resourceType: string, environment: string, tenant: string, team: string, role: string) => {
    await ownershipsPage.fillRequiredFields(
      resourceType.trim(),
      environment.trim(),
      tenant.trim(),
      team.trim(),
      role.trim(),
    );
  },
);

When('the user clicks the save ownership button', async () => {
  await ownershipsPage.clickSaveButton();
});

When('the user clicks the cancel ownership button', async () => {
  await ownershipsPage.clickCancelButton();
});

When(/^the user clicks the (View|Edit|Delete) ownership action$/, async ({}, action: string) => {
  await ownershipsPage.clickRowAction(action.toLowerCase() as 'view' | 'edit' | 'delete');
});

When('the user clicks the first ownership in the table', async () => {
  await ownershipsPage.clickFirstOwnership();
});

When('the user clicks the Edit ownership tab', async () => {
  await ownershipsPage.clickEditTab();
});

When('the user clicks the Delete ownership tab', async () => {
  await ownershipsPage.clickDeleteTab();
});

When(/^the user changes the ownership role to (.+)$/, async ({}, role: string) => {
  await ownershipsPage.changeRole(role.trim());
});

When('the user confirms ownership deletion', async () => {
  await ownershipsPage.confirmDelete('yes');
});

When('the user cancels ownership deletion', async () => {
  await ownershipsPage.confirmDelete('no');
});

Then('the new ownership details should be displayed', async () => {
  await ownershipsPage.newOwnershipDetailsShouldBeDisplayed();
});

Then('the resource ownerships table should be displayed', async () => {
  await ownershipsPage.ownershipsTableShouldBeDisplayed();
});

Then('the ownership details should be displayed', async () => {
  await ownershipsPage.ownershipDetailsShouldBeDisplayed();
});

Then('the ownership details should display the latest change', async () => {
  await ownershipsPage.ownershipDetailsShouldShowLatestChange();
});

Then('the ownership should not be changed', async () => {
  await ownershipsPage.ownershipShouldNotBeChanged();
});

Then('the ownership should be removed from the current table', async () => {
  await ownershipsPage.selectedOwnershipShouldBeRemoved();
});

Then('the ownership should not be removed from the current table', async () => {
  await ownershipsPage.selectedOwnershipShouldNotBeRemoved();
});
