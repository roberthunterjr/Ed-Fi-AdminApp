// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { createBdd } from 'playwright-bdd'
import EnvironmentsPage from '../pages/environments-page'

const { When, Then } = createBdd()

let environmentsPage: EnvironmentsPage

When('the user click on Environment option', async ({ page }) => {
  environmentsPage = new EnvironmentsPage(page)
  await environmentsPage.clickEnvironmentOption()
})

When('the user click on Connect button', async () => {
  await environmentsPage.clickConnectButton()
})

When(/^the user create a new team called '(.+)'$/, async ({ page }, team: string) => {
  environmentsPage = new EnvironmentsPage(page)
  await environmentsPage.createTeam(team)
})

When(
  /^the user create a membership to the team '(.+)' with user '(.+)' and role '(.+)'$/,
  async ({ page }, team: string, user: string, role: string) => {
    environmentsPage = new EnvironmentsPage(page)
    await environmentsPage.createTeamMembership(team, user, role)
  },
)

When(
  /^the user fill all the required fields on v1 ([^,]+), ([^,]+), ([^,]+), ([^,]+), ([^,]+), ([^,]+), (.+)$/,
  async ({}, name: string, edfiApi: string, edfiManagement: string, label: string, odsName: string, dbName: string, eduOrgIdentifier: string) => {
    await environmentsPage.fillAllRequiredFieldsV1(name, edfiApi, edfiManagement, label, odsName, dbName, eduOrgIdentifier)
  }
)

When(
  /^the user fill all the required fields on v2 ([^,]+), ([^,]+), ([^,]+), (.+)$/,
  async ({}, name: string, edfiApi: string, edfiManagement: string, label: string) => {
    await environmentsPage.fillAllRequiredFieldsV2(name, edfiApi, edfiManagement, label)
  }
)

When(/^the user fill all the required fields for environment of type (.+)$/, async ({}, type: string) => {
  await environmentsPage.fillAllRequiredFields(type)
})

When(/^the user fill the field (.*)$/, async ({}, fieldName: string) => {
  await environmentsPage.fillField(fieldName)
})

When(/^the user fill a list of field (.+)$/, async ({}, fieldNames: string) => {
  await environmentsPage.fillSeveralFields(fieldNames)
})

When('the user click on the first environment from the table', async () => {
  await environmentsPage.clickOnFirstEnvironment()
})

When(/^the user click on (edit|delete|grantownership) tab option$/, async ({}, option: string) => {
  const optionName = option.toLowerCase()
  await environmentsPage.clickOnTabOption(optionName)
})

When('the user update the name of the environment', async () => {
  await environmentsPage.renameEnvironment()
})

When('the user click on save button', async () => {
  await environmentsPage.clickSaveButton()
})

When('the user clicks on save button', async () => {
  await environmentsPage.clickSaveButton()
})

When('the user clicks on Save button', async () => {
  await environmentsPage.clickSaveButton()
})

When('the sync queue has a queued job', async () => {
  await environmentsPage.syncQueueHasStarted()
})

When(/^the user assign a grant ownership to the environment (.+) with team (.+)$/, async ({}, name: string, team: string) => {
  await environmentsPage.grantOwnershipToAdminUser('Whole environment', name, team, 'Full ownership')
})

When('the user click on cancel button', async () => {
  await environmentsPage.clickCancelButton()
})

When('the user clicks on cancel button', async () => {
  await environmentsPage.clickCancelButton()
})

When('the user clicks on ODS option', async () => {
  await environmentsPage.clickResourceOption('ods')
})

When('the user clicks on Ed-Orgs option', async () => {
  await environmentsPage.clickResourceOption('edorgs')
})

When('the user clicks on Vendor option', async () => {
  await environmentsPage.clickResourceOption('vendors')
})

When('the user clicks on Application option', async () => {
  await environmentsPage.clickResourceOption('applications')
})

When('the user clicks on Profile option', async () => {
  await environmentsPage.clickResourceOption('profiles')
})

When('the user clicks on Claimsets option', async () => {
  await environmentsPage.clickClaimsetsOption()
})

When(/^the user copies claimset (.+) as (.+)$/, async ({}, source: string, name: string) => {
  await environmentsPage.copyTestClaimset(source, name)
})

When('the user imports a claimset', async () => {
  await environmentsPage.importTestClaimset()
})

Then(/^claimset (.+) can be exported as a valid JSON file$/, async ({}, name: string) => {
  await environmentsPage.exportTestClaimset(name)
})

Then(/^the (Edit|Delete) action is unavailable for reserved claimset (.+)$/,
  async ({}, action: 'Edit' | 'Delete', name: string) => {
    await environmentsPage.reservedClaimsetActionShouldBeUnavailable(action, name)
  },
)

When(/^application dependencies with claimset (.+) exist$/, async ({}, claimset: string) => {
  await environmentsPage.prepareApplicationDependencies(claimset)
})

When(/^a test application (.+) with one credential exists$/, async ({}, name: string) => {
  await environmentsPage.prepareTestApplication(name)
})

When(/^the user fills the application fields (.+), (.+)$/, async ({}, name: string, claimset: string) => {
  await environmentsPage.fillApplicationFields(name, claimset)
})

When(/^the user opens test resource (.+)$/, async ({}, name: string) => {
  await environmentsPage.openTestResource(name)
})

When(/^the user clicks the (Edit|Delete|Manage creds) action for test resource (.+)$/,
  async ({}, action: string, name: string) => {
    await environmentsPage.clickTestResourceAction(action, name)
  },
)

When(/^the user clicks the (Edit|Manage creds|Reset creds) tab option$/, async ({}, action: string) => {
  await environmentsPage.clickTestResourceAction(action)
})

When(/^the user renames the (application|credential) to (.+)$/,
  async ({}, resource: 'application' | 'credential', name: string) => {
    await environmentsPage.renameTestResource(name, resource)
  },
)

Then(/^test resource (.+) details are displayed in (claimsets|applications|apiClients)$/,
  async ({}, name: string, resource: string) => {
    await environmentsPage.testResourceDetailsShouldBeDisplayed(name, resource)
  },
)

Then('the user can view the key and secret generated', async ({ page }) => {
  environmentsPage = new EnvironmentsPage(page)
  await environmentsPage.userCanViewKeyAndSecretGenerated()
})

Then(/^test resource (.+) is absent from the table$/, async ({}, name: string) => {
  await environmentsPage.testResourceShouldBeAbsent(name)
})

When('the user confirms test resource deletion', async () => {
  await environmentsPage.confirmResourceDeletion()
})

Then('the credentials table is displayed with one credential', async () => {
  await environmentsPage.credentialsShouldBeDisplayed(1)
})

Then('the credentials table is displayed with two credentials', async () => {
  await environmentsPage.credentialsShouldBeDisplayed(2)
})

When('the user opens the first credential', async () => {
  await environmentsPage.openFirstCredential()
})

When(/^the user clicks the (Edit|Delete|Reset creds) action for the first credential$/,
  async ({}, action: string) => {
    await environmentsPage.clickFirstCredentialAction(action)
  },
)

When(/^the user fills the credential fields (.+)$/, async ({}, name: string) => {
  await environmentsPage.fillCredentialFields(name)
})

When('the user returns to the credentials table', async () => {
  await environmentsPage.returnToCredentials()
})

Then(/^deleting the only credential is blocked from the (tab|row) option$/,
  async ({}, from: 'tab' | 'row') => {
    await environmentsPage.onlyCredentialDeletionShouldBeBlocked(from)
  },
)

When('the user confirms credential reset', async () => {
  await environmentsPage.confirmCredentialReset()
})

Then('the newly reset credentials are displayed', async () => {
  await environmentsPage.resetCredentialsShouldBeDisplayed()
})

When('the user clicks on Create button', async () => {
  await environmentsPage.clickCreateButton()
})

When('the user clicks on New button', async () => {
  await environmentsPage.clickNewButton()
})

When(/^the user fills the ODS fields (.+), (.+)$/, async ({}, name: string, template: string) => {
  await environmentsPage.fillOdsFields(name.trim(), template.trim())
})

When(
  /^the user fills the vendor fields (.+), (.+), (.+), (.+)$/,
  async ({}, company: string, prefixes: string, contactName: string, contactEmail: string) => {
    await environmentsPage.fillVendorFields(
      company.trim(),
      prefixes.trim(),
      contactName.trim(),
      contactEmail.trim(),
    )
  },
)

When(/^the user import (?:a|an) (.+) profile$/, async ({}, name: string) => {
  await environmentsPage.importValidProfile(name)
})

When(/^the user (clicks|hover) on the (?:ods|vendor) (.+)$/, async ({}, action: string, name: string) => {
  if (action === 'hover') {
    await environmentsPage.hoverResourceRow(name.trim())
    return
  }

  await environmentsPage.clickResourceRow(name.trim())
})

When(/^the user clicks the (Delete|Edit) (ods|vendor) action$/, async ({}, action: string, resource: string) => {
  await environmentsPage.clickResourceAction(
    action as 'Delete' | 'Edit',
    resource as 'ods' | 'vendor',
  )
})

When('the user clicks the first vendor in the table', async () => {
  await environmentsPage.clickFirstResourceRow()
})

When('the user clicks the Delete tab option', async () => {
  await environmentsPage.clickDeleteControl()
})

When('the user confirms ods deletion', async () => {
  await environmentsPage.confirmResourceDeletion()
})

When('the user confirms vendor deletion', async () => {
  await environmentsPage.confirmResourceDeletion()
})

When(/^the user click on (edit|delete) option from three dots option$/, async ({}, option: string) => {
  const optionName = option.toLowerCase() === 'edit' ? 'Edit' : 'Delete'
  await environmentsPage.clickOnTheFirstOptionFromThreeDots(optionName)
})

When(/^the user click on (grantownership|delete) option from more three dots option$/, async ({}, option: string) => {
  const optionName = option.toLowerCase()
  await environmentsPage.clickOnTheOptionFromMoreThreeDots(optionName)
})

When(/^the user click on (no|yes) button from popup message$/, async ({}, option: string) => {
  const optionName = option.toLowerCase() === 'no' ? false : true
  await environmentsPage.clickOnDeletePopup(optionName)
})

When(/^the user set an eduction organization (.+)$/, async ({}, identifiers: string) => {
  await environmentsPage.setEducationOrganization(identifiers)
})

Then('the new environment details should be loaded in the main page', async () => {
  await environmentsPage.newEnvironmentDetailsLoaded()
})

Then('contains the Team with Tenants sections displayed', async () => {
  await environmentsPage.teamWithTenantsSectionsDisplayed()
})

Then(/^the environment displays the tenants by default ([^,]+), (.+)$/, async ({}, name: string, tenantName: string) => {
  await environmentsPage.clickEnvironmentOption()
  await environmentsPage.searchAndSelectEnvironment(name)
  await environmentsPage.tenantIsDisplayed(tenantName)
})

Then('the sync queue is already completed', async () => {
  await environmentsPage.syncQueueIsCompleted()
})

Then(/^the user enter to environment using the team (.+) with team (.+)$/, async ({}, name: string, team: string) => {
  await environmentsPage.selectGlobalTeam(team)
  await environmentsPage.searchAndSelectEnvironment(name, true)
  await environmentsPage.selectFirstLoadedTenantOnEnvironment()
})

Then('the default ods loaded', async () => {
  await environmentsPage.selectFirsOdsEnvironment()
  await environmentsPage.defaultOdsIsLoaded()
})

Then('the API version is detected according to the edfi api version', async () => {
  await environmentsPage.apiVersionDetected()
})

Then('the environment main page should be loaded without the environment created', async () => {
  await environmentsPage.environmentMainPageLoadedWithoutEnvironmentCreated()
})

Then('the environment name not should be updated', async () => {
  await environmentsPage.environmentMainPageLoadedWithoutEnvironmentCreated()
})

Then(/^the fields other than (.+) should be highlighted$/, async ({}, highlighted: string) => {
  await environmentsPage.requiredFieldsHighlighted(highlighted)
})

Then(/^the required field (.+) should be highlighted$/, async ({}, highlighted: string) => {
  await environmentsPage.requiredFieldHighlighted(highlighted)
})

Then('the new environment should be loaded in the mains page of environments', async () => {
  await environmentsPage.newEnvironmentLoadedInMainPage()
})

Then('the environment name should be updated', async () => {
  await environmentsPage.environmentNameIsUpdated()
})

Then('the environment should still be available in the list of environments', async () => {
  await environmentsPage.environmentStillAvailableAfterCancel()
})

Then(/^the environment (updated|created) should removed from the table of environments$/, async ({}, option: string) => {
  const optionName = option.toLowerCase() === 'updated' ? 'UpdateNameV1' : 'EnvB'
  await environmentsPage.environmentShouldBeRemoved(optionName)
})

Then('the ownership form should be loaded', async () => {
  await environmentsPage.ownershipsFormIsDisplayed()
})

Then(/^a new ODS (.+) should be displayed on the table with status create pending$/, async ({}, name: string) => {
  await environmentsPage.odsShouldBeDisplayedWithPendingStatus(name.trim())
})

Then('the ODS contains the details', async () => {
  await environmentsPage.resourceDetailsShouldBeDisplayed()
})

Then(/^the ODS (.+) not should be displayed on the table$/, async ({}, name: string) => {
  await environmentsPage.resourceShouldNotBeDisplayed(name.trim())
})

Then('not should be possible create the ods', async () => {
  await environmentsPage.invalidResourceFormShouldShowWarnings()
})

Then('a warning message should be displayed on ods fields', async () => {
  await environmentsPage.invalidResourceFormShouldShowWarnings(
    'Name must only contain letters, numbers, spaces, and underscores.',
  )
})

Then(/^the ods (.+) should have the label Delete: Pending$/, async ({}, name: string) => {
  await environmentsPage.odsShouldHaveDeletePendingStatus(name.trim())
})

Then('the Ed-Orgs table should be displayed', async () => {
  await environmentsPage.resourceTableShouldBeDisplayed()
})

Then('is possible to enter to the first edorgs in order to see the details', async () => {
  await environmentsPage.firstEdorgDetailsShouldBeDisplayed()
})

Then('the details of vendors should be displayed', async () => {
  await environmentsPage.resourceDetailsShouldBeDisplayed()
})

Then(/^the vendor (.+) not should be displayed on the table$/, async ({}, name: string) => {
  await environmentsPage.resourceShouldNotBeDisplayed(name.trim())
})

Then('warnings message should be displayed', async () => {
  await environmentsPage.invalidResourceFormShouldShowWarnings('company should not be empty')
  await environmentsPage.invalidResourceFormShouldShowWarnings('contactName should not be empty')
  await environmentsPage.invalidResourceFormShouldShowWarnings('contactEmailAddress must be an email')
})

Then(/^the vendor (.+) should be removed from the current table$/, async ({}, name: string) => {
  await environmentsPage.resourceShouldBeRemoved(name.trim())
})

Then('warnings message should be displayed on each field', async () => {
  await environmentsPage.invalidResourceFormShouldShowWarnings('applicationName must be longer than or equal to 3 characters')
  await environmentsPage.invalidResourceFormShouldShowWarnings('odsInstanceId must be a number conforming to the specified constraints')
  await environmentsPage.invalidResourceFormShouldShowWarnings('educationOrganizationIds should not be empty')
  await environmentsPage.invalidResourceFormShouldShowWarnings('vendorId must be a number conforming to the specified constraints')
  await environmentsPage.invalidResourceFormShouldShowWarnings('claimsetId must be a number conforming to the specified constraints')
})

Then('the profile should be created', async () => {
  await environmentsPage.profileShouldBeCreated()
})

Then('a warning message should be displayed on profiles fields', async () => {
  await environmentsPage.invalidResourceFormShouldShowWarnings('name should not be empty')
  await environmentsPage.invalidResourceFormShouldShowWarnings('definition should not be empty')
})

Then('an error message should be displayed that is not possible create the profile', async () => {
  await environmentsPage.invalidResourceFormShouldShowWarnings("Invalid XML format for definition: The element 'Profile' has invalid child element 'Invalid'. List of possible elements expected: 'Resource'.")
})
