Feature: Environments V2 with Api validation

  # The environments and teams used below are created by
  # environmentv2andApi-setup.feature, which runs first (see playwright.config.ts).

  Scenario Outline: Create ODS template
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on ODS option
    And the user clicks on Create button
    When the user fills the ODS fields <name>, <template>
    And the user clicks on save button
    Then a new ODS <name> should be displayed on the table with status create pending
    And the ODS contains the details

    Examples:
      | environment             | name              | template |
      | FullSingleEnvironmentv2 | MinimalTemplate   | Minimal  |
      | FullSingleEnvironmentv2 | PopulatedTemplate | Sample   |

  Scenario Outline: Cancel create ODS template
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on ODS option
    And the user clicks on Create button
    When the user fills the ODS fields <name>, <template>
    And the user clicks on cancel button
    Then the ODS <name> not should be displayed on the table

    Examples:
      | environment             | name           | template |
      | FullSingleEnvironmentv2 | CancelTemplate | Minimal  |

  Scenario Outline: ODS validation fields
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on ODS option
    And the user clicks on Create button
    When the user clicks on save button
    Then not should be possible create the ods
    And a warning message should be displayed on ods fields

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

    Examples:
      | environment             | name            |
      | FullSingleEnvironmentv2 | MinimalTemplate |

  Scenario Outline: View Education Organizations
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    When the user clicks on Ed-Orgs option
    Then the Ed-Orgs table should be displayed
    And is possible to enter to the first edorgs in order to see the details

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Create Vendor test
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks on New button
    When the user fills the vendor fields <company>, <prefixes>, <contactName>, <contactEmail>
    And the user clicks on save button
    Then the details of vendors should be displayed

    Examples:
      | environment             | company    | prefixes        | contactName | contactEmail        |
      | FullSingleEnvironmentv2 | Edfy       | uri://ed-fi.org | EdfyTest    | edfy@mail.com       |
      | FullSingleEnvironmentv2 | Automation | uri://ed-fi.org | EdfyTest    | automation@mail.com |

  Scenario Outline: Cancel create vendor
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks on New button
    When the user fills the vendor fields <company>, <prefixes>, <contactName>, <contactEmail>
    And the user clicks on cancel button
    Then the vendor <company> not should be displayed on the table

    Examples:
      | environment             | company            | prefixes        | contactName   | contactEmail    |
      | FullSingleEnvironmentv2 | NoVendorCreated    | uri://ed-fi.org | NoEdfyTest    | noedfy@mail.com |

  Scenario Outline: Vendor validation fields
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks on New button
    And the user clicks on save button
    Then warnings message should be displayed

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Edit vendor from row actions
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks the Edit vendor action
    When the user fills the vendor fields <company>, <prefixes>, <contactName>, <contactEmail>
    And the user clicks on save button
    Then the details of vendors should be displayed

    Examples:
      | environment             | company     | prefixes       | contactName | contactEmail         |
      | FullSingleEnvironmentv2 | EdfyUpdated | uri://edfi.org | Update Name | edfyUpdated@mail.com |

  Scenario Outline: Edit vendor from details
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks the first vendor in the table
    When the user fills the vendor fields <company>, <prefixes>, <contactName>, <contactEmail>
    And the user clicks on save button
    Then the details of vendors should be displayed

    Examples:
      | environment             | company       | prefixes       | contactName | contactEmail        |
      | FullSingleEnvironmentv2 | VendorUpdated | uri://edfi.org | Update Name | edfyVendor@mail.com |

  Scenario Outline: Delete vendor from row actions
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks the Delete vendor action
    When the user confirms vendor deletion
    Then the vendor <company> should be removed from the current table

    Examples:
      | environment             | company |
      | FullSingleEnvironmentv2 | Edfy    |

  Scenario Outline: Delete vendor from details
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Vendor option
    And the user clicks the first vendor in the table
    And the user clicks the Delete tab option
    When the user confirms vendor deletion
    Then the vendor <company> should be removed from the current table

    Examples:
      | environment             | company     |
      | FullSingleEnvironmentv2 | Automation  |

  Scenario Outline: Application validation fields
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Application option
    And the user clicks on New button
    When the user clicks on save button
    Then warnings message should be displayed on each field

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Delete ODS from row actions
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on ODS option
    And the user hover on the ods <name>
    And the user clicks the Delete ods action
    When the user confirms ods deletion
    Then the ods <name> should have the label Delete: Pending

    Examples:
      | environment             | name              |
      | FullSingleEnvironmentv2 | PopulatedTemplate |

  Scenario Outline: Delete ODS from details
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on ODS option
    And the user clicks on the ods <name>
    And the user clicks the Delete tab option
    When the user confirms ods deletion
    Then the ods <name> should have the label Delete: Pending

    Examples:
      | environment             | name            |
      | FullSingleEnvironmentv2 | MinimalTemplate |


  Scenario Outline: Import profiles
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Profile option
    And the user clicks on New button
    When the user import a valid profile
    And the user clicks on Save button
    Then the profile should be created

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Profiles validation fields
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Profile option
    And the user clicks on New button
    When the user clicks on Save button
    Then a warning message should be displayed on profiles fields

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Import invalid profile
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Profile option
    And the user clicks on New button
    When the user import an invalid profile
    And the user clicks on Save button
    Then an error message should be displayed that is not possible create the profile

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Clone Claimsets
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Claimsets option
    When the user copies claimset <source> as <name>
    Then test resource <name> details are displayed in claimsets

    Examples:
      | environment             | source        | name          |
      | FullSingleEnvironmentv2 | Ed-Fi Sandbox | E2EClonedClaimset |

  Scenario Outline: Import Claimsets
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Claimsets option
    When the user imports a claimset
    Then test resource <name> details are displayed in claimsets

    Examples:
      | environment             | name                       |
      | FullSingleEnvironmentv2 | Ed-Fi Automation Claimsets |

  Scenario Outline: Export Claimsets
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Claimsets option
    Then claimset <name> can be exported as a valid JSON file

    Examples:
      | environment             | name          |
      | FullSingleEnvironmentv2 | Ed-Fi Sandbox |

  Scenario Outline: Not possible edit the claimsets system reserved
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    When the user clicks on Claimsets option
    Then the Edit action is unavailable for reserved claimset <name>

    Examples:
      | environment             | name          |
      | FullSingleEnvironmentv2 | Ed-Fi Sandbox |

  Scenario Outline: Not possible delete the claimsets system reserved
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    When the user clicks on Claimsets option
    Then the Delete action is unavailable for reserved claimset <name>

    Examples:
      | environment             | name          |
      | FullSingleEnvironmentv2 | Ed-Fi Sandbox |

  Scenario Outline: Delete claimsets that is not system reserved
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Claimsets option
    And the user copies claimset <source> as <name>
    And the user clicks the Delete tab option
    When the user confirms test resource deletion
    Then test resource <name> is absent from the table

    Examples:
      | environment             | source        | name                |
      | FullSingleEnvironmentv2 | Ed-Fi Sandbox | E2EDeletableClaimset |

  Scenario Outline: Create an Application
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And application dependencies with claimset <claimset> exist
    And the user clicks on New button
    When the user fills the application fields <name>, <claimset>
    And the user clicks on save button
    Then test resource <name> details are displayed in applications
    And the user can view the key and secret generated

    Examples:
      | environment             | name           | claimset    |
      | FullSingleEnvironmentv2 | E2EApplication | E2EClaimset |

  Scenario Outline: Validation fields Application
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And the user clicks on Application option
    And the user clicks on New button
    When the user clicks on save button
    Then warnings message should be displayed on each field

    Examples:
      | environment             |
      | FullSingleEnvironmentv2 |

  Scenario Outline: Cancel application creation
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And application dependencies with claimset <claimset> exist
    And the user clicks on New button
    And the user fills the application fields <name>, <claimset>
    When the user clicks on cancel button
    Then test resource <name> is absent from the table

    Examples:
      | environment             | name                   | claimset    |
      | FullSingleEnvironmentv2 | E2ECanceledApplication | E2EClaimset |

  Scenario Outline: Edit application from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <name> with one credential exists
    And the user opens test resource <name>
    And the user clicks the Edit tab option
    When the user renames the application to <updatedName>
    And the user clicks on save button
    Then test resource <updatedName> details are displayed in applications

    Examples:
      | environment             | name               | updatedName              |
      | FullSingleEnvironmentv2 | E2EEditTabApplication | E2EUpdatedTabApplication |

  Scenario Outline: Edit application from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <name> with one credential exists
    And the user clicks the Edit action for test resource <name>
    When the user renames the application to <updatedName>
    And the user clicks on save button
    Then test resource <updatedName> details are displayed in applications

    Examples:
      | environment             | name               | updatedName              |
      | FullSingleEnvironmentv2 | E2EEditActionApplication | E2EUpdatedRowApplication |

  Scenario Outline: Manage credentials from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <name> with one credential exists
    And the user opens test resource <name>
    When the user clicks the Manage creds tab option
    Then the credentials table is displayed with one credential

    Examples:
      | environment             | name                 |
      | FullSingleEnvironmentv2 | E2EManageApplication |

  Scenario Outline: Manage credentials from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <name> with one credential exists
    When the user clicks the Manage creds action for test resource <name>
    Then the credentials table is displayed with one credential

    Examples:
      | environment             | name                 |
      | FullSingleEnvironmentv2 | E2EManageApplication |

  Scenario Outline: New manage credentials from tab option test
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user opens test resource <application>
    And the user clicks the Manage creds tab option
    And the user clicks on New button
    When the user fills the credential fields <name>
    And the user clicks on save button
    Then test resource <name> details are displayed in apiClients
    And the user returns to the credentials table
    And the credentials table is displayed with two credentials

    Examples:
      | environment             | application       | name             |
      | FullSingleEnvironmentv2 | E2ENewCredentials | E2ENewCredential |

  Scenario Outline: Edit manage credentials from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user clicks the Manage creds action for test resource <application>
    And the user opens the first credential
    And the user clicks the Edit tab option
    When the user renames the credential to <name>
    And the user clicks on save button
    Then test resource <name> details are displayed in apiClients

    Examples:
      | environment             | application        | name                    |
      | FullSingleEnvironmentv2 | E2EEditCredentials | E2EUpdatedTabCredential |

  Scenario Outline: Edit manage credentials from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user clicks the Manage creds action for test resource <application>
    And the user clicks the Edit action for the first credential
    When the user renames the credential to <name>
    And the user clicks on save button
    Then test resource <name> details are displayed in apiClients

    Examples:
      | environment             | application        | name                    |
      | FullSingleEnvironmentv2 | E2EEditCredentials | E2EUpdatedRowCredential |

  Scenario Outline: Reset manage credentials from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user clicks the Manage creds action for test resource <application>
    And the user opens the first credential
    And the user clicks the Reset creds tab option
    When the user confirms credential reset
    Then the newly reset credentials are displayed

    Examples:
      | environment             | application         |
      | FullSingleEnvironmentv2 | E2EResetCredentials |

  Scenario Outline: Reset manage credentials from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user clicks the Manage creds action for test resource <application>
    And the user clicks the Reset creds action for the first credential
    When the user confirms credential reset
    Then the newly reset credentials are displayed

    Examples:
      | environment             | application         |
      | FullSingleEnvironmentv2 | E2EResetCredentials |

  Scenario Outline: Not possible delete only one manage credentials from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    When the user clicks the Manage creds action for test resource <application>
    Then deleting the only credential is blocked from the tab option

    Examples:
      | environment             | application         |
      | FullSingleEnvironmentv2 | E2EOnlyCredential |

  Scenario Outline: Not possible delete only one manage credentials from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    When the user clicks the Manage creds action for test resource <application>
    Then deleting the only credential is blocked from the row option

    Examples:
      | environment             | application       |
      | FullSingleEnvironmentv2 | E2EOnlyCredential |

  Scenario Outline: Delete manage credentials from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user clicks the Manage creds action for test resource <application>
    And the user clicks on New button
    And the user fills the credential fields <name>
    And the user clicks on save button
    And test resource <name> details are displayed in apiClients
    And the user returns to the credentials table
    And the credentials table is displayed with two credentials
    And the user opens test resource <name>
    And the user clicks the Delete tab option
    When the user confirms test resource deletion
    Then test resource <name> is absent from the table
    And the credentials table is displayed with one credential

    Examples:
      | environment             | application          | name                     |
      | FullSingleEnvironmentv2 | E2EDeleteCredentials | E2EDeletableTabCredential |

  Scenario Outline: Delete manage credentials from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <application> with one credential exists
    And the user clicks the Manage creds action for test resource <application>
    And the user clicks on New button
    And the user fills the credential fields <name>
    And the user clicks on save button
    And test resource <name> details are displayed in apiClients
    And the user returns to the credentials table
    And the credentials table is displayed with two credentials
    And the user clicks the Delete action for test resource <name>
    When the user confirms test resource deletion
    Then test resource <name> is absent from the table
    And the credentials table is displayed with one credential

    Examples:
      | environment             | application          | name                     |
      | FullSingleEnvironmentv2 | E2EDeleteCredentials | E2EDeletableRowCredential |

  Scenario Outline: Delete application from tab option
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <name> with one credential exists
    And the user opens test resource <name>
    And the user clicks the Delete tab option
    When the user confirms test resource deletion
    Then test resource <name> is absent from the table

    Examples:
      | environment             | name                   |
      | FullSingleEnvironmentv2 | E2EDeleteTabApplication |

  Scenario Outline: Delete application from row action
    Given the user is logged with a valid user
    And the user click on Environment option
    And the user enter to environment using the team <environment> with team ApiTest
    And a test application <name> with one credential exists
    And the user clicks the Delete action for test resource <name>
    When the user confirms test resource deletion
    Then test resource <name> is absent from the table

    Examples:
      | environment             | name                    |
      | FullSingleEnvironmentv2 | E2EDeleteRowApplication |

