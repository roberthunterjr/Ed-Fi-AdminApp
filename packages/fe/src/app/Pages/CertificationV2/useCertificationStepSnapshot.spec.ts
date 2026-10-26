import 'reflect-metadata';
import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { CertificationStepSnapshotDto } from '@edanalytics/models';
import { methods } from '../../api';
import { certificationQueryKeys } from './useCertificationCatalog';
import { useCertificationStepSnapshot } from './useCertificationStepSnapshot';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../api', () => ({ methods: { getOne: jest.fn() } }));

type QueryOptions = { queryKey: unknown[]; enabled?: boolean; queryFn: () => unknown };

const args = {
  sbEnvironmentId: 1,
  edfiTenantId: 10 as number | undefined,
  odsId: 5 as number | undefined,
  sisVersion: 'v5' as string | undefined,
  stepId: 189 as number | undefined,
  ranAt: '2026-10-15T15:00:00.000Z' as string | undefined,
  enabled: true,
};

const render = (
  overrides: Partial<typeof args> = {},
  state: { data?: unknown; isPending: boolean; isError?: boolean } = { isPending: true },
) => {
  (useQuery as jest.Mock).mockReturnValue({ isError: false, ...state });
  const { result } = renderHook(() => useCertificationStepSnapshot({ ...args, ...overrides }));
  const options = (useQuery as jest.Mock).mock.calls.at(-1)[0] as QueryOptions;
  return { result: result.current, options };
};

describe('useCertificationStepSnapshot', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requests nothing until the panel is opened', () => {
    const { options, result } = render({ enabled: false });

    expect(options.enabled).toBe(false);
    expect(result.isPending).toBe(false);
  });

  it('reads the snapshot route with the chosen ODS', async () => {
    const { options } = render();
    await options.queryFn();

    expect(methods.getOne).toHaveBeenCalledWith(
      'sb-environments/1/edfi-tenants/10/certification/sis/v5/step-runs/189/snapshot',
      CertificationStepSnapshotDto,
      { params: { odsId: 5 } },
    );
    expect(options.enabled).toBe(true);
  });

  it('omits odsId when no ODS is chosen', async () => {
    const { options } = render({ odsId: undefined });
    await options.queryFn();

    expect(methods.getOne).toHaveBeenCalledWith(
      expect.any(String),
      CertificationStepSnapshotDto,
      undefined,
    );
  });

  it('refetches after a re-run, because the run time is part of the key', () => {
    const { options } = render();

    expect(options.queryKey).toEqual(
      certificationQueryKeys.stepSnapshot(1, 10, 5, 189, '2026-10-15T15:00:00.000Z'),
    );
    expect(options.queryKey).toEqual([
      'certification',
      1,
      'step-snapshot',
      10,
      5,
      189,
      '2026-10-15T15:00:00.000Z',
    ]);
  });

  it('stays disabled while the step or tenant is unknown', () => {
    expect(render({ stepId: undefined }).options.enabled).toBe(false);
    expect(render({ edfiTenantId: undefined }).options.enabled).toBe(false);
  });

  it('returns the snapshot and its loading and error state', () => {
    const snapshot = { state: 'none' };
    expect(render({}, { data: snapshot, isPending: false, isError: true }).result).toEqual({
      snapshot,
      isPending: false,
      isError: true,
    });
  });
});
