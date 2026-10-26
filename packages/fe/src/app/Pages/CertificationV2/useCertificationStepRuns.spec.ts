import 'reflect-metadata';
import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { CertificationStepRunsDto } from '@edanalytics/models';
import { methods } from '../../api';
import { certificationQueryKeys } from './useCertificationCatalog';
import { useCertificationStepRuns } from './useCertificationStepRuns';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../api', () => ({ methods: { getOne: jest.fn() } }));

type QueryOptions = {
  queryKey: unknown[];
  enabled?: boolean;
  queryFn: () => unknown;
  throwOnError: (error: unknown, query: { state: { data: unknown } }) => boolean;
};

const args = {
  sbEnvironmentId: 1,
  edfiTenantId: 10,
  odsId: 5 as number | undefined,
  sisVersion: 'v5' as string | undefined,
  scenarioId: 52 as number | undefined,
};
const refetch = jest.fn();

const render = (
  overrides: Partial<typeof args> = {},
  state: { data?: unknown; isPending: boolean } = { isPending: true },
) => {
  (useQuery as jest.Mock).mockReturnValue({ ...state, refetch });
  const { result } = renderHook(() => useCertificationStepRuns({ ...args, ...overrides }));
  const options = (useQuery as jest.Mock).mock.calls.at(-1)[0] as QueryOptions;
  return { result: result.current, options };
};

describe('useCertificationStepRuns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the step-runs route, omitting odsId when no ODS is chosen', async () => {
    const { options } = render({ odsId: undefined });
    await options.queryFn();

    expect(methods.getOne).toHaveBeenCalledWith(
      'sb-environments/1/edfi-tenants/10/certification/sis/v5/step-runs',
      CertificationStepRunsDto,
      { params: { scenarioId: 52 } },
    );
    expect(options.queryKey).toEqual(certificationQueryKeys.stepRuns(1, 10, undefined, 52));
    expect(options.queryKey).toEqual(['certification', 1, 'step-runs', 10, null, 52]);
  });

  it('sends odsId when an ODS is chosen', async () => {
    const { options } = render();
    await options.queryFn();

    expect(methods.getOne).toHaveBeenCalledWith(expect.any(String), CertificationStepRunsDto, {
      params: { scenarioId: 52, odsId: 5 },
    });
  });

  it.each([
    ['tenant', { edfiTenantId: undefined }],
    ['version', { sisVersion: undefined }],
    ['scenario', { scenarioId: undefined }],
  ])('is disabled until the %s is known', (_label, overrides) => {
    const { options, result } = render(overrides);
    expect(options.enabled).toBe(false);
    expect(result.isPending).toBe(false);
  });

  it('is enabled once tenant, version and scenario are known, with no token needed', () => {
    expect(render().options.enabled).toBe(true);
  });

  it('indexes the saved steps by stepId and exposes the scenario status', () => {
    const step = { stepId: 189, status: 'failed', ranAt: 'x', inputs: null, errors: [] };
    const { result } = render(
      {},
      { data: { scenarioStatus: 'failed', steps: [step] }, isPending: false },
    );

    expect(result.runsByStepId).toEqual({ 189: step });
    expect(result.scenarioStatus).toBe('failed');
    expect(result.isPending).toBe(false);
    expect(result.queryKey).toEqual(['certification', 1, 'step-runs', 10, 5, 52]);
  });

  it('has no saved steps while loading', () => {
    const { result } = render();
    expect(result.runsByStepId).toEqual({});
    expect(result.scenarioStatus).toBeNull();
    expect(result.isPending).toBe(true);
  });

  it('exposes refetch', () => {
    render().result.refetch();
    expect(refetch).toHaveBeenCalled();
  });

  it('sends a failed first load to the error page', () => {
    const { options } = render();
    expect(options.throwOnError(new Error('x'), { state: { data: undefined } })).toBe(true);
  });

  it('keeps the page and its saved results when a later refetch fails', () => {
    const { options } = render();
    expect(
      options.throwOnError(new Error('x'), {
        state: { data: { scenarioStatus: null, steps: [] } },
      }),
    ).toBe(false);
  });
});
