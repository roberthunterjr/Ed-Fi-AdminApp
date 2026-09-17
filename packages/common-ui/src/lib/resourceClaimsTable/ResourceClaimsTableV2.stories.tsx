import { Meta } from '@storybook/react-vite';
import { GetClaimsetSingleDtoV2, GetResourceClaimDtoV2 } from '@edanalytics/models';
import { DeepPartial } from '@chakra-ui/react';
import { ResourceClaimsTableV2 } from './ResourceClaimsTableV2';

const meta: Meta<typeof ResourceClaimsTableV2> = {
  title: 'ResourceClaimsTableV2',
  component: ResourceClaimsTableV2,
};
export default meta;

let nextId = 1;
const allowed = (
  name: string,
  actions: string[],
  children: GetResourceClaimDtoV2[] = []
): GetResourceClaimDtoV2 =>
  ({
    id: String(nextId++),
    name,
    actions: actions.map((a) => ({ name: a, enabled: true })),
    _defaultAuthorizationStrategiesForCRUD: actions.map((actionName) => ({
      actionName,
      authorizationStrategies: [{ authStrategyName: 'NoFurtherAuthorizationRequired' }],
    })),
    authorizationStrategyOverridesForCRUD: [],
    children,
  }) as unknown as GetResourceClaimDtoV2;

// AC-439's merge adds entries like this for a resourceClaims item that has
// no actions associated at all — every action column renders "Denied".
const denied = (name: string, children: GetResourceClaimDtoV2[] = []): GetResourceClaimDtoV2 =>
  ({
    id: String(nextId++),
    name,
    actions: [],
    _defaultAuthorizationStrategiesForCRUD: [],
    authorizationStrategyOverridesForCRUD: [],
    children,
  }) as unknown as GetResourceClaimDtoV2;

// Enough root claims (> the old default page size of 10) plus one root with
// several denied children, so expanding it used to push rows onto a
// second, easy-to-miss pagination page.
const exampleClaimset = {
  id: 2,
  name: 'Ed-Fi Sandbox',
  resourceClaims: [
    allowed('types', ['Read'], [
      denied('schoolYearType'),
      denied('gradeLevelDescriptor'),
      denied('academicSubjectDescriptor'),
      denied('interventionEffectivenessRatingDescriptor'),
    ]),
    allowed('identity', ['Create', 'Read', 'Update']),
    allowed('schools', ['Create', 'Read', 'Update', 'Delete']),
    allowed('students', ['Create', 'Read', 'Update', 'Delete']),
    allowed('staffs', ['Create', 'Read', 'Update', 'Delete']),
    allowed('courses', ['Create', 'Read', 'Update', 'Delete']),
    allowed('gradebookEntries', ['Create', 'Read', 'Update', 'Delete']),
    allowed('assessments', ['Create', 'Read', 'Update', 'Delete']),
    allowed('transportation', ['Create', 'Read', 'Update', 'Delete']),
    allowed('finance', ['Create', 'Read', 'Update', 'Delete']),
    allowed('calendar', ['Create', 'Read', 'Update', 'Delete']),
    allowed('discipline', ['Create', 'Read', 'Update', 'Delete']),
  ],
  _isSystemReserved: true,
  _applications: [],
} as unknown as DeepPartial<GetClaimsetSingleDtoV2> as GetClaimsetSingleDtoV2;

export const Default = () => <ResourceClaimsTableV2 claimset={exampleClaimset} />;
