import 'reflect-metadata';
import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { CertificationScenarioStatusDto } from '@edanalytics/models';
import { methods } from '../../api';
import { certificationQueryKeys } from './useCertificationCatalog';
import { useCertificationScenarioStatuses } from './useCertificationScenarioStatuses';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../api', () => ({ methods: { getMany: jest.fn() } }));

type QueryOptions = {
  queryKey: unknown[];
  enabled?: boolean;
  refetchOnMount?: unknown;
  queryFn: () => unknown;
  throwOnError?: unknown;
};

const args = {
  sbEnvironmentId: 1,
  edfiTenantId: 10,
  odsId: 5 as number | undefined,
  sisVersion: 'v5' as string | undefined,
  enabled: true,
};

type QueryState = { data?: unknown; isPending: boolean; isError?: boolean };

const render = (overrides: Partial<typeof args> = {}, state: QueryState = { isPending: true }) => {
  (useQuery as jest.Mock).mockReturnValue({ refetch: jest.fn(), ...state });
  const { result } = renderHook(() => useCertificationScenarioStatuses({ ...args, ...overrides }));
  const options = (useQuery as jest.Mock).mock.calls.at(-1)[0] as QueryOptions;
  return { result: result.current, options };
};

describe('useCertificationScenarioStatuses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the scenario-statuses route, omitting odsId when no ODS is chosen', async () => {
    const { options } = render({ odsId: undefined });
    await options.queryFn();

    expect(methods.getMany).toHaveBeenCalledWith(
      'sb-environments/1/edfi-tenants/10/certification/sis/v5/scenario-statuses',
      CertificationScenarioStatusDto,
      { params: {} },
    );
    expect(options.queryKey).toEqual(
      certificationQueryKeys.scenarioStatuses(1, 10, undefined, 'v5'),
    );
    expect(options.queryKey).toEqual(['certification', 1, 'scenario-statuses', 10, null, 'v5']);
  });

  it('sends odsId when an ODS is chosen, and includes it in the query key', async () => {
    const { options } = render();
    await options.queryFn();

    expect(methods.getMany).toHaveBeenCalledWith(
      expect.any(String),
      CertificationScenarioStatusDto,
      {
        params: { odsId: 5 },
      },
    );
    expect(options.queryKey).toEqual(['certification', 1, 'scenario-statuses', 10, 5, 'v5']);
  });

  it('keys the query by data standard version', () => {
    expect(render({ sisVersion: 'v6' }).options.queryKey).toEqual([
      'certification',
      1,
      'scenario-statuses',
      10,
      5,
      'v6',
    ]);
  });

  it('always refetches on mount so a saved run elsewhere is reflected', () => {
    expect(render().options.refetchOnMount).toBe('always');
  });

  it('does not send a failed load to the error page', () => {
    expect(render().options.throwOnError).toBeUndefined();
  });

  it.each([
    ['disabled by the caller', { enabled: false }],
    ['missing a tenant', { edfiTenantId: undefined }],
    ['missing a sis version', { sisVersion: undefined }],
  ])('is disabled when %s', (_label, overrides) => {
    const { options, result } = render(overrides);
    expect(options.enabled).toBe(false);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
    expect(result.isUnknown).toBe(true);
  });

  it('is enabled once the caller enables it with a tenant and version known', () => {
    expect(render().options.enabled).toBe(true);
  });

  it('indexes the statuses by scenarioId', () => {
    const { result } = render(
      {},
      {
        data: [
          { scenarioId: 52, status: 'completed' },
          { scenarioId: 51, status: 'failed' },
        ],
        isPending: false,
      },
    );

    expect(result.statusByScenarioId).toEqual({ 52: 'completed', 51: 'failed' });
    expect(result.isLoading).toBe(false);
    expect(result.isUnknown).toBe(false);
  });

  it('treats a loaded empty list as known, not unknown', () => {
    const { result } = render({}, { data: [], isPending: false });
    expect(result.isUnknown).toBe(false);
  });

  it('is loading and unknown with no statuses while the first load runs', () => {
    const { result } = render();
    expect(result.statusByScenarioId).toEqual({});
    expect(result.isLoading).toBe(true);
    expect(result.isUnknown).toBe(true);
  });

  it('reports a failed first load as an error with unknown statuses', () => {
    const { result } = render({}, { isPending: false, isError: true });
    expect(result.isError).toBe(true);
    expect(result.isStale).toBe(false);
    expect(result.isUnknown).toBe(true);
  });

  it('reports a failed refresh as stale and keeps the old statuses', () => {
    const { result } = render(
      {},
      { data: [{ scenarioId: 52, status: 'completed' }], isPending: false, isError: true },
    );
    expect(result.isError).toBe(true);
    expect(result.isStale).toBe(true);
    expect(result.isUnknown).toBe(false);
    expect(result.statusByScenarioId).toEqual({ 52: 'completed' });
  });
});
