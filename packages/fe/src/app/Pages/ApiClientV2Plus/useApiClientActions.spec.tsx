import 'reflect-metadata';
import '@testing-library/jest-dom';
import { useQuery } from '@tanstack/react-query';
import { useSingleApiClientActions } from './useApiClientActions';
import { usePopBanner } from '../../Layout/FeedbackBanner';
import { ApiClientEntity, useApiClientConfig } from './apiClientConfig';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => jest.fn()),
  useParams: jest.fn(() => ({})),
}));

jest.mock('../../helpers', () => ({
  useAuthorize: jest.fn(() => true),
  useTeamEdfiTenantNavContext: jest.fn(() => ({ sbEnvironmentId: 2, edfiTenantId: 3 })),
  useTeamEdfiTenantNavContextLoaded: jest.fn(() => ({
    edfiTenantId: 3,
    asId: 1,
    teamId: 1,
    edfiTenant: { sbEnvironmentId: 2 },
  })),
}));

jest.mock('../../Layout/FeedbackBanner', () => {
  // One stable spy, so a test can assert what the delete mutation's error
  // path pushed to the global banner.
  const popBanner = jest.fn();
  return { usePopBanner: jest.fn(() => popBanner) };
});

jest.mock('../../helpers/useSearch', () => ({
  useSearchParamsObject: jest.fn(() => ({})),
}));

// See ViewApiClient.spec.tsx: './apiClientConfig' transitively pulls in the real
// '../../api/queries/queries.v7' chain, which Jest can't parse without extra config.
jest.mock('./apiClientConfig', () => ({
  useApiClientConfig: jest.fn(() => ({
    queries: {
      delete: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
      resetCreds: jest.fn(() => ({ isPending: false, mutateAsync: jest.fn() })),
      getAll: jest.fn(() => ({ queryKey: ['apiClients'] })),
    },
  })),
}));

const mockUseQuery = useQuery as jest.Mock;
const mockUseApiClientConfig = useApiClientConfig as jest.Mock;

const apiClient = { id: 4, name: 'Cred A', applicationId: 7 } as unknown as ApiClientEntity;

/** A fresh config mock. `useApiClientConfig` is called twice per render — once
 *  by useSingleApiClientActions and once by useApplicationApiClients — so any
 *  test overriding it must use mockReturnValue, not mockReturnValueOnce. */
const defaultConfig = () => ({
  queries: {
    delete: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
    resetCreds: jest.fn(() => ({ isPending: false, mutateAsync: jest.fn() })),
    getAll: jest.fn(() => ({ queryKey: ['apiClients'] })),
  },
});

/** Drive the hook with a given credential-list query result. */
const actionsFor = (queryResult: object) => {
  mockUseQuery.mockReturnValue(queryResult);
  return useSingleApiClientActions({ apiClient, applicationId: 7 });
};

describe('useSingleApiClientActions — last-credential delete guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks resets call history but keeps implementations, so a test
    // that overrides the config would otherwise leak into every later test.
    mockUseApiClientConfig.mockReturnValue(defaultConfig());
  });

  it('enables Delete when the Application has more than one credential', () => {
    const actions = actionsFor({
      isPending: false,
      isSuccess: true,
      data: { 4: apiClient, 5: { ...apiClient, id: 5 } },
    });
    expect(actions.Delete).toBeDefined();
    expect(actions.Delete.isDisabled).toBe(false);
    expect(actions.Delete.title).toBe('Delete API client credentials');
  });

  it("disables Delete when it is the Application's only credential", () => {
    const actions = actionsFor({ isPending: false, isSuccess: true, data: { 4: apiClient } });
    expect(actions.Delete.isDisabled).toBe(true);
  });

  it('explains why in the tooltip when it is the only credential', () => {
    const actions = actionsFor({ isPending: false, isSuccess: true, data: { 4: apiClient } });
    expect(actions.Delete.title).toBe(
      "This is the Application's only credential and can't be deleted. Create another credential first.",
    );
  });

  it('disables Delete while the credential count is still loading', () => {
    const actions = actionsFor({ isPending: true, data: undefined });
    expect(actions.Delete.isDisabled).toBe(true);
  });

  // The query builder (packages/fe/src/app/api/queries/builder.ts) defaults
  // `throwOnError` to true. NameCell relies on that, but this hook also backs
  // ApiClientPageActions on the credential detail page, which is not wrapped
  // in an ErrorBoundary — a thrown error there took down the whole page. The
  // hook overrides `throwOnError: false` and must fail closed instead: an
  // errored count is treated the same as "count unknown", keeping Delete
  // blocked rather than defaulting it open.
  it('disables Delete when the credential count query errors', () => {
    const actions = actionsFor({ isPending: false, isError: true, data: undefined });
    expect(actions.Delete.isDisabled).toBe(true);
  });

  // The count is unknown in these states, so claiming this is the only
  // credential would be false. But a generic tooltip on a disabled button
  // reads as broken, so each transient state says what it is.
  it('says the count could not be checked when the query errors', () => {
    const actions = actionsFor({ isPending: false, isError: true, data: undefined });
    expect(actions.Delete.title).toBe(
      "Couldn't check the credential count — try refreshing the page.",
    );
  });

  it('says it is checking while the credential count is still loading', () => {
    const actions = actionsFor({ isPending: true, data: undefined });
    expect(actions.Delete.title).toBe('Checking credential count…');
  });

  // `title` alone is announced to nobody on the icon-button variant, because
  // its `aria-label` (from `text`) outranks `title` in accessible-name
  // computation. The reason has to ride on the accessible name too.
  it('carries the reason into the accessible name whenever Delete is blocked', () => {
    const only = actionsFor({ isPending: false, isSuccess: true, data: { 4: apiClient } });
    expect(only.Delete.ariaLabel).toBe(
      "This is the Application's only credential and can't be deleted. Create another credential first.",
    );

    const errored = actionsFor({ isPending: false, isError: true, data: undefined });
    expect(errored.Delete.ariaLabel).toBe(
      "Couldn't check the credential count — try refreshing the page.",
    );
  });

  it('leaves the accessible name alone when Delete is enabled', () => {
    const actions = actionsFor({
      isPending: false,
      isSuccess: true,
      data: { 4: apiClient, 5: { ...apiClient, id: 5 } },
    });
    expect(actions.Delete.isDisabled).toBe(false);
    expect(actions.Delete.ariaLabel).toBeUndefined();
  });

  // The BFF's 409 is the actual enforcement; the disabled button is only a
  // hint. Nothing previously covered the client receiving that rejection.
  it('surfaces a 409 from the delete mutation in the global banner', () => {
    const mutate = jest.fn();
    mockUseApiClientConfig.mockReturnValue({
      ...defaultConfig(),
      queries: {
        ...defaultConfig().queries,
        delete: jest.fn(() => ({ isPending: false, mutate })),
      },
    });

    const actions = actionsFor({
      isPending: false,
      isSuccess: true,
      data: { 4: apiClient, 5: { ...apiClient, id: 5 } },
    });
    (actions.Delete as { onClick: () => void }).onClick();

    const conflict = {
      type: 'Error',
      title: 'Cannot delete the only credential',
      message:
        'An Application needs at least one credential to work. Create another credential before deleting this one.',
    };
    const options = mutate.mock.calls[0][1] as { onError: (e: unknown) => void };
    options.onError(conflict);

    const popBanner = (usePopBanner as jest.Mock)();
    expect(popBanner).toHaveBeenCalledWith(conflict);
  });

  // The count query is deliberately built with the same arguments as
  // NameCell's `queries.getAll` call so the query key matches and TanStack
  // Query serves both from one cache entry instead of firing a request per
  // table row. Assert the arguments so a future edit (e.g. swapping `asId`
  // for something else) can't silently reintroduce a per-row request without
  // a test failing. Mirrors the equivalent assertion in ApiClientsPage.spec.tsx.
  it('queries the credential count with the same arguments NameCell uses, so both share one cache entry', () => {
    const getAllSpy = jest.fn(() => ({ queryKey: ['apiClients'] }));
    mockUseApiClientConfig.mockReturnValue({
      ...defaultConfig(),
      queries: { ...defaultConfig().queries, getAll: getAllSpy },
    });

    actionsFor({
      isPending: false,
      isSuccess: true,
      data: { 4: apiClient, 5: { ...apiClient, id: 5 } },
    });

    expect(getAllSpy).toHaveBeenCalledWith(
      { teamId: 1, edfiTenant: { sbEnvironmentId: 2 } },
      { applicationId: 7 },
    );
  });
});
