import 'reflect-metadata';

// builder.ts imports the ESM-only 'kebab-case' package that Jest's Babel transform can't parse
// (same reason claimsetQueriesV3.spec.ts mocks it).
jest.mock('kebab-case', () => (str: string) => str);

// Hand back the raw mutation config so its onSuccess can be called directly, with one shared
// invalidateQueries spy standing in for the QueryClient.
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((config: unknown) => config),
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

// Avoids methods.ts -> config/config.ts's `import.meta.env`, which Jest can't parse.
jest.mock('../methods', () => ({
  apiClient: {},
  methods: {
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    getOne: jest.fn(),
    getManyMap: jest.fn(),
  },
}));

// queries.ts only needs authCacheKey from helpers; the real module pulls in react-router (ESM).
jest.mock('../../helpers', () => ({ authCacheKey: jest.fn(() => ['auth-cache']) }));

import { teamQueries, userTeamMembershipQueries } from './queries';

type MutationConfig = { onSuccess: (data: unknown, variables: unknown) => void };

// The team context picker reads ['me', 'teams'] (useMyTeams). Creating, editing or deleting a
// team or a membership changes that list, so the picker must refetch instead of showing a stale
// list until a reload.
describe('team and membership mutations refresh the team context picker', () => {
  afterEach(() => jest.clearAllMocks());

  const cases: Array<[string, () => MutationConfig, unknown]> = [
    [
      'team post',
      () => teamQueries.post({}) as unknown as MutationConfig,
      { entity: { name: 't' } },
    ],
    [
      'team put',
      () => teamQueries.put({}) as unknown as MutationConfig,
      { entity: { id: 1, name: 't' } },
    ],
    ['team delete', () => teamQueries.delete({}) as unknown as MutationConfig, { id: 1 }],
    [
      'membership post',
      () => userTeamMembershipQueries.post({}) as unknown as MutationConfig,
      { entity: { teamId: 1, userId: 1 } },
    ],
    [
      'membership put',
      () => userTeamMembershipQueries.put({}) as unknown as MutationConfig,
      { entity: { id: 1, teamId: 1, userId: 1 } },
    ],
    [
      'membership delete',
      () => userTeamMembershipQueries.delete({}) as unknown as MutationConfig,
      { id: 1 },
    ],
  ];

  it.each(cases)('%s invalidates the my-teams query', (_name, makeMutation, variables) => {
    makeMutation().onSuccess({ id: 1 }, variables);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['me', 'teams'] });
  });
});
