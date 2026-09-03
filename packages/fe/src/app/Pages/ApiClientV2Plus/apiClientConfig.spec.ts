import 'reflect-metadata';

jest.mock('../../helpers', () => ({
  useTeamEdfiTenantNavContextLoaded: jest.fn(),
}));

// Importing the real './apiClientConfig' below transitively pulls in the real
// '../../api' barrel (that's the whole point of this spec — see comment
// below), which in turn loads api/methods.ts -> config/config.ts, whose
// `import.meta.env` Jest cannot parse. Mock just the config module (not
// '../../api' itself) to isolate that unrelated module-load-time failure
// without faking the queries this test needs to be real.
jest.mock('../../../config/config', () => ({
  config: { showRequestCertification: false, apiUrl: '/api' },
}));

// Same rationale as the config/config mock above: the real '../../api'
// barrel also re-exports queries.ts (unrelated to ApiClient), which imports
// the ESM-only 'kebab-case' package that Jest's transform can't parse.
// Stub it with an identity function so the real module graph can load.
jest.mock('kebab-case', () => (str: string) => str);

import {
  PostApiClientDtoV2,
  PostApiClientDtoV3,
  PostApiClientFormDtoV2,
  PostApiClientFormDtoV3,
  PutApiClientDtoV2,
  PutApiClientDtoV3,
  PutApiClientFormDtoV2,
  PutApiClientFormDtoV3,
} from '@edanalytics/models';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { apiClientQueriesV2, apiClientQueriesV3 } from '../../api';
import { useApiClientConfig } from './apiClientConfig';

const mockUseNavContext = useTeamEdfiTenantNavContextLoaded as jest.Mock;

const setVersion = (version: 'v2' | 'v3') => {
  mockUseNavContext.mockReturnValue({ edfiTenant: { sbEnvironment: { version } } });
};

// This spec deliberately does NOT mock './apiClientConfig' — every other
// ApiClient spec does, which means the real useApiClientConfig() -> version ->
// apiClientQueriesV2/V3 resolution built by createVersionedResource is never
// exercised anywhere else. createVersionedResource does not catch a
// mis-keyed branch at compile time (e.g. `{ v3: { version: 'v3', queries:
// apiClientQueriesV2, ... } }` would still type-check), so this test exists
// to catch that class of bug at runtime.
describe('useApiClientConfig', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves to the V2 queries and DTOs for a v2 tenant', () => {
    setVersion('v2');

    const config = useApiClientConfig();

    expect(config.queries).toBe(apiClientQueriesV2);
    expect(config.PostDto).toBe(PostApiClientDtoV2);
    expect(config.PutDto).toBe(PutApiClientDtoV2);
    expect(config.PostFormDto).toBe(PostApiClientFormDtoV2);
    expect(config.PutFormDto).toBe(PutApiClientFormDtoV2);
  });

  it('resolves to the V3 queries and DTOs for a v3 tenant', () => {
    setVersion('v3');

    const config = useApiClientConfig();

    expect(config.queries).toBe(apiClientQueriesV3);
    expect(config.PostDto).toBe(PostApiClientDtoV3);
    expect(config.PutDto).toBe(PutApiClientDtoV3);
    expect(config.PostFormDto).toBe(PostApiClientFormDtoV3);
    expect(config.PutFormDto).toBe(PutApiClientFormDtoV3);
  });

  it('throws for an unmapped version', () => {
    setVersion('v1' as 'v2');

    expect(() => useApiClientConfig()).toThrow(/No resource registered/);
  });
});
