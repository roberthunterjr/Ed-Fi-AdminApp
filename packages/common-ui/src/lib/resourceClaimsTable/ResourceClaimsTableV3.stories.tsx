import { Meta } from '@storybook/react-vite';
import { GetClaimsetSingleDtoV3, GetResourceClaimDtoV3 } from '@edanalytics/models';
import { DeepPartial } from '@chakra-ui/react';
import { ResourceClaimsTableV3 } from './ResourceClaimsTableV3';

const meta: Meta<typeof ResourceClaimsTableV3> = {
  title: 'ResourceClaimsTableV3',
  component: ResourceClaimsTableV3,
};
export default meta;

const allowed = (name: string, ...actions: string[]): GetResourceClaimDtoV3 =>
  ({
    name,
    claimName: `http://ed-fi.org/ods/identity/claims/domains/${name}`,
    parentClaimName: null,
    actions: actions.map((a) => ({ name: a, enabled: true })),
    _defaultAuthorizationStrategies: actions.map((actionName) => ({
      actionName,
      authorizationStrategies: [{ authStrategyName: 'NoFurtherAuthorizationRequired' }],
    })),
    authorizationStrategyOverrides: [],
  }) as unknown as GetResourceClaimDtoV3;

// AC-439's merge adds entries like this for a resourceClaims item that has
// no actions associated at all — every action column renders "Denied".
const denied = (name: string, parentClaimName: string | null): GetResourceClaimDtoV3 =>
  ({
    name,
    claimName: `http://ed-fi.org/ods/identity/claims/domains/types/${name}`,
    parentClaimName,
    actions: [],
    _defaultAuthorizationStrategies: [],
    authorizationStrategyOverrides: [],
  }) as unknown as GetResourceClaimDtoV3;

// Enough root domains (> the old default page size of 10) plus one root with
// several denied children, so expanding it used to push rows onto a
// second, easy-to-miss pagination page.
const typesClaimName = 'http://ed-fi.org/ods/identity/claims/domains/types';
const exampleClaimset = {
  id: 2,
  resourceClaims: [
    allowed('types', 'Read'),
    allowed('identity', 'Create', 'Read', 'Update'),
    allowed('schools', 'Create', 'Read', 'Update', 'Delete'),
    allowed('students', 'Create', 'Read', 'Update', 'Delete'),
    allowed('staffs', 'Create', 'Read', 'Update', 'Delete'),
    allowed('courses', 'Create', 'Read', 'Update', 'Delete'),
    allowed('gradebookEntries', 'Create', 'Read', 'Update', 'Delete'),
    allowed('assessments', 'Create', 'Read', 'Update', 'Delete'),
    allowed('transportation', 'Create', 'Read', 'Update', 'Delete'),
    allowed('finance', 'Create', 'Read', 'Update', 'Delete'),
    allowed('calendar', 'Create', 'Read', 'Update', 'Delete'),
    allowed('discipline', 'Create', 'Read', 'Update', 'Delete'),
    denied('schoolYearType', typesClaimName),
    denied('gradeLevelDescriptor', typesClaimName),
    denied('academicSubjectDescriptor', typesClaimName),
    denied('interventionEffectivenessRatingDescriptor', typesClaimName),
  ],
  _isSystemReserved: true,
  _applications: [],
} as unknown as DeepPartial<GetClaimsetSingleDtoV3> as GetClaimsetSingleDtoV3;

export const Default = () => <ResourceClaimsTableV3 claimset={exampleClaimset} />;
