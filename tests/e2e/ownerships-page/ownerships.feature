Feature: Ownerships

  Rule: An environment, team, and role already exist

    Scenario Outline: Create ownership
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user creates a unique ownership team based on <team>
      And the user clicks the Grant new ownership button
      When the user fills the ownership fields <resourceType>, <environment>, <tenant>, <team>, <role>
      And the user clicks the save ownership button
      Then the new ownership details should be displayed

      Examples:
        | resourceType         | environment              | tenant  | team      | role                      |
        # For the time being, the EdOrgs type will not be tested, as our template does not have EdOrgs loaded by default.
        #| Ed-Org               | FullMultiEnvironmentv2   | tenant1 | TeamMemberC | Full ownership            |
        #| Ods                  | FullMultiEnvironmentv2   | tenant1 | teamA | Full ownership            |
        | Tenant               | FullMultiEnvironmentv2   | tenant1 | teamA | Full ownership            |
        | Whole environment    | FullMultiEnvironmentv2   | tenant1 | teamA | Full ownership            |
        #| Ed-Org               | FullMultiEnvironmentv2   | tenant1 | TeamMemberA | Shared-instance ownership |
        #| Ods                  | FullMultiEnvironmentv2   | tenant1 | teamB | Shared-instance ownership |
        | Tenant               | FullMultiEnvironmentv2   | tenant1 | teamB | Shared-instance ownership |
        | Whole environment    | FullMultiEnvironmentv2   | tenant1 | teamB | Shared-instance ownership |

    Scenario Outline: Cancel ownership creation
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the Grant new ownership button
      When the user fills the ownership fields <resourceType>, <environment>, <tenant>, <team>, <role>
      And the user clicks the cancel ownership button
      Then the resource ownerships table should be displayed

      Examples:
        | resourceType | environment              | tenant  | team        | role           |
        | Ed-Org       | FullMultiEnvironmentv2   | tenant1 | teamB | Full ownership |

  Rule: A team ownership already exists

    Scenario: View ownership
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      When the user clicks the View ownership action
      Then the ownership details should be displayed

    Scenario: Edit ownership from row actions
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the Edit ownership action
      When the user changes the ownership role to Shared-instance ownership
      And the user clicks the save ownership button
      Then the ownership details should display the latest change

    Scenario: Edit ownership from details
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the first ownership in the table
      And the user clicks the Edit ownership tab
      When the user changes the ownership role to Full ownership
      And the user clicks the save ownership button
      Then the ownership details should display the latest change

    Scenario: Cancel ownership edit
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the Edit ownership action
      When the user changes the ownership role to Shared-instance ownership
      And the user clicks the cancel ownership button
      Then the ownership should not be changed
      And the ownership details should be displayed

    Scenario: Delete ownership from row actions
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the Delete ownership action
      When the user confirms ownership deletion
      Then the ownership should be removed from the current table

    Scenario: Delete ownership from details
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the first ownership in the table
      And the user clicks the Delete ownership tab
      When the user confirms ownership deletion
      Then the ownership should be removed from the current table

    Scenario: Cancel ownership deletion
      Given the user is logged with a valid user
      And the user clicks the Ownerships option
      And the user clicks the Delete ownership action
      When the user cancels ownership deletion
      Then the ownership should not be removed from the current table
