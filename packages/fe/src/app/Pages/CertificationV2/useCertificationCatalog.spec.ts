import 'reflect-metadata';
import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { methods } from '../../api';
import {
  certificationQueryKeys,
  useCertificationCatalog,
  useCertificationSteps,
} from './useCertificationCatalog';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../api', () => ({
  methods: { getMany: jest.fn() },
  sbEnvironmentQueriesGlobal: { getOne: ({ id }: { id: number }) => ({ queryKey: ['env', id] }) },
}));

type QueryState = { data?: unknown; isPending: boolean };
type QueryOptions = { queryKey: unknown[]; enabled?: boolean; queryFn?: () => unknown };

const settled = (data: unknown): QueryState => ({ data, isPending: false });
const loading: QueryState = { data: undefined, isPending: true };

const versions = [
  { catalogVersionId: 1, artifactVersion: 'v2.1.0', dataStandardVersion: 'v4', isActive: true },
  { catalogVersionId: 2, artifactVersion: 'v2.1.0', dataStandardVersion: 'v5', isActive: true },
];
const area = (areaId: number, displayOrder: number) => ({
  areaId,
  displayOrder,
  scenarios: [
    { scenarioId: areaId * 10 + 2, displayOrder: 2 },
    { scenarioId: areaId * 10 + 1, displayOrder: 1 },
  ],
});

/** Answers each useQuery call by key; a disabled query never settles, as in TanStack Query v5. */
const mockQueries = (states: {
  env: QueryState;
  versions?: QueryState;
  scenarios?: QueryState;
  steps?: QueryState;
}) =>
  (useQuery as jest.Mock).mockImplementation((options: QueryOptions) => {
    if (options.enabled === false) return loading;
    if (options.queryKey[0] === 'env') return states.env;
    const byName: Record<string, QueryState | undefined> = {
      'catalog-versions': states.versions,
      scenarios: states.scenarios,
      steps: states.steps,
    };
    return byName[options.queryKey[2] as string] ?? loading;
  });

const optionsFor = (name: string) =>
  (useQuery as jest.Mock).mock.calls
    .map(([options]) => options as QueryOptions)
    .filter((options) => options.queryKey[2] === name)
    .at(-1);

describe('useCertificationCatalog', () => {
  beforeEach(() => jest.resetAllMocks());

  it('for data standard 5.2.0 picks the v5 catalog version and loads its areas', () => {
    mockQueries({
      env: settled({ odsDsVersion: '5.2.0' }),
      versions: settled(versions),
      scenarios: settled([area(2, 2), area(1, 1)]),
    });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(result.current.unsupportedMessage).toBeUndefined();
    expect(result.current.catalogVersion?.catalogVersionId).toBe(2);
    expect(result.current.isPending).toBe(false);
    expect(optionsFor('scenarios')).toMatchObject({
      queryKey: certificationQueryKeys.scenarios(7, 2),
      enabled: true,
    });
    // Areas and their scenarios come back sorted by displayOrder.
    expect(result.current.areas.map((a) => a.areaId)).toEqual([1, 2]);
    expect(result.current.areas[0].scenarios.map((s) => s.scenarioId)).toEqual([11, 12]);
  });

  // The API refuses these environments with a 400; asking would land on the route error page.
  it('does not request the catalog for data standard 4.0.0 and says why', () => {
    mockQueries({ env: settled({ odsDsVersion: '4.0.0' }), versions: settled(versions) });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(optionsFor('catalog-versions')?.enabled).toBe(false);
    expect(result.current.unsupportedMessage).toBe(
      "Certification requires Ed-Fi Data Standard 5.0.0 or later. This environment's data standard version is 4.0.0, as recorded when it was connected to Admin App. If its Ed-Fi API has been upgraded since then, Admin App doesn't detect the new version yet.",
    );
    expect(result.current.catalogVersion).toBeUndefined();
    expect(result.current.areas).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });

  it('does not request the catalog when the data standard is unknown and says why', () => {
    mockQueries({ env: settled({ odsDsVersion: undefined }), versions: settled(versions) });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(optionsFor('catalog-versions')?.enabled).toBe(false);
    expect(result.current.unsupportedMessage).toMatch(/couldn't read this environment's data standard version/);
    expect(result.current.isPending).toBe(false);
  });

  it('waits for the environment before requesting the catalog or judging support', () => {
    mockQueries({ env: loading, versions: settled(versions) });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(optionsFor('catalog-versions')?.enabled).toBe(false);
    expect(result.current.isSupported).toBe(false);
    expect(result.current.unsupportedMessage).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });

  it.each([
    ['5.2.0', true],
    ['4.0.0', false],
  ])('reports whether data standard %s supports certification', (odsDsVersion, isSupported) => {
    mockQueries({ env: settled({ odsDsVersion }), versions: settled(versions) });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(result.current.isSupported).toBe(isSupported);
  });

  it('ignores a catalog list cached while the environment was supported', () => {
    // TanStack Query keeps a disabled query's cached data. "5.0.0-pre" maps to the v5 catalog,
    // so without the guard it would select it and request areas the API refuses (400).
    (useQuery as jest.Mock).mockImplementation((options: QueryOptions) => {
      if (options.queryKey[0] === 'env') return settled({ odsDsVersion: '5.0.0-pre' });
      if (options.queryKey[2] === 'catalog-versions') return settled(versions);
      return loading;
    });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(result.current.catalogVersion).toBeUndefined();
    expect(optionsFor('scenarios')?.enabled).toBe(false);
    expect(result.current.unsupportedMessage).toBeDefined();
    expect(result.current.isPending).toBe(false);
  });

  it('requests only the matched catalog version', () => {
    mockQueries({
      env: settled({ odsDsVersion: '5.2.0' }),
      versions: settled(versions),
      scenarios: settled([]),
    });
    renderHook(() => useCertificationCatalog(7));

    optionsFor('scenarios')?.queryFn?.();

    expect(methods.getMany).toHaveBeenCalledWith(
      'sb-environments/7/certification/scenarios',
      expect.anything(),
      { params: { catalogVersionId: 2 } },
    );
  });

  it('is not pending and loads no areas when no catalog version matches', () => {
    mockQueries({ env: settled({ odsDsVersion: '6.1.0' }), versions: settled(versions) });

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(optionsFor('scenarios')?.enabled).toBe(false);
    expect(result.current.dataStandardVersion).toBe('v6');
    expect(result.current.catalogVersion).toBeUndefined();
    expect(result.current.areas).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });

  it.each([
    ['the environment', { env: loading, versions: settled(versions) }],
    ['the catalog versions', { env: settled({ odsDsVersion: '5.2.0' }), versions: loading }],
    [
      'the areas',
      { env: settled({ odsDsVersion: '5.2.0' }), versions: settled(versions), scenarios: loading },
    ],
  ])('is pending while %s load', (_, states) => {
    mockQueries(states);

    const { result } = renderHook(() => useCertificationCatalog(7));

    expect(result.current.isPending).toBe(true);
  });
});

describe('useCertificationSteps', () => {
  beforeEach(() => jest.resetAllMocks());

  it('loads the scenario steps in display order', () => {
    mockQueries({
      env: loading,
      steps: settled([
        { stepId: 2, displayOrder: 2 },
        { stepId: 1, displayOrder: 1 },
      ]),
    });

    const { result } = renderHook(() => useCertificationSteps(7, 52));
    optionsFor('steps')?.queryFn?.();

    expect(result.current.steps.map((s) => s.stepId)).toEqual([1, 2]);
    expect(result.current.isPending).toBe(false);
    expect(methods.getMany).toHaveBeenCalledWith(
      'sb-environments/7/certification/steps',
      expect.anything(),
      { params: { scenarioId: 52 } },
    );
  });

  it('is not pending and does not query without a scenario', () => {
    mockQueries({ env: loading });

    const { result } = renderHook(() => useCertificationSteps(7, undefined));

    expect(optionsFor('steps')?.enabled).toBe(false);
    expect(result.current).toEqual({ steps: [], isPending: false });
  });
});
