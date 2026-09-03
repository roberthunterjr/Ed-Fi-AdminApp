import 'reflect-metadata';

// builder.ts imports the ESM-only 'kebab-case' package that Jest's Babel
// transform can't parse (same reason applicationConfig.spec.ts and
// profileConfig.spec.ts mock it). EntityQueryBuilder only uses it to derive
// the URL segment name, which is irrelevant to what this spec asserts.
jest.mock('kebab-case', () => (str: string) => str);

// apiClientQueriesV3's mutation factories (`.post(...)`, `.put(...)`) call
// React's `useMutation`/`useQueryClient` internally, so invoking them
// requires those hooks to resolve synchronously outside of any component.
// Mocking '@tanstack/react-query' to hand back the raw config object (rather
// than a real mutation object) lets us call the captured `mutationFn`
// directly and assert on the URL/DTO it hands to `methods.post` — without a
// live QueryClient or React render tree.
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((config: unknown) => config),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

// Mocking '../methods' avoids pulling in methods.ts -> config/config.ts's
// `import.meta.env`, which Jest's Babel transform can't parse (same reason
// ClaimsetPage.spec.tsx mocks '../../api'). It also gives us a spy to inspect
// exactly what URL and ReqDto class each mutation posts with.
jest.mock('../methods', () => ({
  methods: {
    post: jest.fn().mockResolvedValue({ id: 1 }),
    put: jest.fn().mockResolvedValue({ id: 1 }),
    getOne: jest.fn(),
    getManyMap: jest.fn(),
  },
}));

import { instanceToPlain } from 'class-transformer';
import { GetEdfiTenantDto } from '@edanalytics/models';
import {
  GetApiClientDtoV2,
  GetApiClientDtoV3,
  PostApiClientDtoV2,
  PostApiClientDtoV3,
  toGetApiClientDtoV3,
} from '@edanalytics/models';
import { apiClientQueriesV3 } from './queries.v7';
import { methods } from '../methods';

const mockPost = methods.post as jest.Mock;
const mockPut = methods.put as jest.Mock;

// Minimal stub satisfying what `standardPath`/`EntityQueryBuilder` read off
// `edfiTenant` (`.id` and `.sbEnvironment.version`).
const edfiTenant = {
  id: 3,
  sbEnvironmentId: 2,
  sbEnvironment: { version: 'v3' },
} as unknown as GetEdfiTenantDto;

describe('apiClientQueriesV3 wiring', () => {
  afterEach(() => jest.clearAllMocks());

  it('getAll builds the v3 admin-api path and appends the applicationId filter', () => {
    const query = apiClientQueriesV3.getAll(
      { edfiTenant, teamId: 1 },
      { applicationId: 7 }
    ) as unknown as { queryKey: unknown[]; queryFn: () => unknown };

    // getAll's URL is derived via standardPath the same way as its queryKey;
    // reach it the same way the other mutations expose theirs by invoking
    // queryFn, which calls through to methods.getManyMap with the built URL.
    const mockGetManyMap = methods.getManyMap as jest.Mock;
    mockGetManyMap.mockResolvedValue([]);
    query.queryFn();

    const [url, ResDto] = mockGetManyMap.mock.calls[0];
    expect(url).toContain('admin-api/v3/');
    // Guard the response DTO, not just the URL. `getAll` mis-wired to
    // GetApiClientDtoV2 would build an identical URL and pass every other
    // assertion here, while losing V3's `clientId` -> `key` mapping — i.e.
    // silently reproducing the blank Key column this ticket fixed, with all
    // tests green. Mirrors the ReqDto guard on `post` below.
    expect(ResDto).toBe(GetApiClientDtoV3);
    expect(ResDto).not.toBe(GetApiClientDtoV2);
    // standardPath appends the applicationId filter (built as the `id`
    // argument) directly after the pluralized resource segment, which
    // includes its own trailing slash — hence `apiClients/?applicationId=7`
    // rather than `apiClients?applicationId=7`. This matches the identical
    // construction in apiClientQueriesV2's `getAll`, which this builder
    // mirrors verbatim.
    expect(url).toContain('apiClients/?applicationId=7');
  });

  it('getOne uses the V3 response DTO, not the V2 one', () => {
    const query = apiClientQueriesV3.getOne({
      edfiTenant,
      teamId: 1,
      id: 5,
    }) as unknown as { queryFn: () => unknown };

    const mockGetOne = methods.getOne as jest.Mock;
    mockGetOne.mockResolvedValue({});
    query.queryFn();

    const [url, ResDto] = mockGetOne.mock.calls[0];
    expect(url).toContain('admin-api/v3/');
    expect(url).toContain('apiClients');
    // Same exposure as getAll: the detail page reads `key` off this DTO.
    expect(ResDto).toBe(GetApiClientDtoV3);
    expect(ResDto).not.toBe(GetApiClientDtoV2);
  });

  it('post uses the V3 request DTO, not the V2 one', () => {
    const mutation = apiClientQueriesV3.post({ edfiTenant, teamId: 1 }) as unknown as {
      mutationFn: (args: { entity: object }) => unknown;
    };

    mutation.mutationFn({ entity: {} });

    const [url, ReqDto] = mockPost.mock.calls[0];
    expect(url).toContain('admin-api/v3/');
    expect(url).toContain('apiClients');
    // A mis-wired builder (e.g. reusing PostApiClientDtoV2) would typecheck
    // and pass every other test — this is the guard against that.
    expect(ReqDto).toBe(PostApiClientDtoV3);
    expect(ReqDto).not.toBe(PostApiClientDtoV2);
  });

  // Guards the FULL serialization round trip, which is what actually broke the
  // Credentials table's `accessorKey: 'key'` column in the browser:
  //   upstream Admin API sends `clientId`
  //     -> API's plain->class     (toGetApiClientDtoV3)  => key
  //     -> API's class->plain     (the global ClassSerializerInterceptor
  //        configured in main.ts, which runs instanceToPlain with
  //        excludeExtraneousValues) => back to `clientId` on the wire
  //     -> FE's plain->class      (ResDto: GetApiClientDtoV3 in queries.v7.ts)
  //        => key, which the column reads.
  //
  // Testing only the first hop is NOT enough and gives false confidence:
  // `@Expose({ name: 'clientId', toClassOnly: true })` still passes a
  // plain->class-only assertion while breaking this chain at the FE hop (the
  // API would emit `key`, which the FE's plain->class pass then ignores,
  // leaving the column blank). Verified: this test fails with `toClassOnly`
  // added and passes without it.
  it('survives the API serialize -> FE deserialize round trip with `key` intact', () => {
    const fromUpstream = toGetApiClientDtoV3({
      id: 2,
      name: 'My Application Test 1',
      clientId: 'Ihu78396gvdt',
      isApproved: true,
      useSandbox: false,
      sandboxType: 0,
      applicationId: 2,
      keyStatus: 'Active',
      dataStoreIds: [1],
    });
    expect(fromUpstream.key).toBe('Ihu78396gvdt');

    // Mirrors main.ts's `new ClassSerializerInterceptor(reflector, {
    // excludeExtraneousValues: true })` — the API's outbound pass.
    const onTheWire = instanceToPlain(fromUpstream, { excludeExtraneousValues: true });

    // The FE's inbound pass, via the same DTO the query builder's ResDto names.
    const inTheBrowser = toGetApiClientDtoV3(onTheWire as never);

    expect(inTheBrowser.key).toBe('Ihu78396gvdt');
  });

  it('resetCreds targets the reset-credential sub-path', () => {
    const mutation = apiClientQueriesV3.resetCreds({ edfiTenant, teamId: 1 }) as unknown as {
      mutationFn: (args: { entity: { id: number } }) => unknown;
    };

    mutation.mutationFn({ entity: { id: 5 } });

    const [url] = mockPut.mock.calls[0];
    expect(url).toContain('admin-api/v3/');
    expect(url).toContain('apiClients/5/reset-credential');
  });
});
