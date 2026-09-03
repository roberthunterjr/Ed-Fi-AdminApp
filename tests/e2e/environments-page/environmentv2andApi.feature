Feature: Environments V2 with Api validation

  Scenario Outline: Environment Management v2 with Api
    Given the user is logged with a valid user
    When the user click on Environment option
    And the user click on Connect button
    And the user fill all the required fields on v2 <name>, <edfiApi>, <edfiManagement>, <label>
    And the user click on save button
    And the API version is detected according to the edfi api version
    And the sync queue has a queued job
    And the user assign a grant ownership to the environment <name>
    Then the environment displays the tenants by default <name>, <tenantName>
    And the sync queue is already completed
    And the user enter to environment using the team <name>
    And the default ods loaded

    Examples:
      | name                    | edfiApi                                    | edfiManagement                                  | label      | tenantName |
      | FullSingleEnvironmentv2 | https://localhost/odsv7-adminv2-single-api | https://localhost/odsv7-adminv2-single-adminapi | production | default    |
      | FullMultiEnvironmentv2  | https://localhost/odsv7-adminv2-multi-api  | https://localhost/odsv7-adminv2-multi-adminapi  | production | tenant1    |

