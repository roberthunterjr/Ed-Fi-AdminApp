import { resolveOdsApiUrls } from './resolve-ods-api-urls';

describe('resolveOdsApiUrls', () => {
  it('returns the root URLs unchanged for a single-tenant environment', () => {
    const result = resolveOdsApiUrls(
      {
        oauth: 'https://certification.ed-fi.org/v7.3/api/oauth/token',
        dataManagementApi: 'https://certification.ed-fi.org/v7.3/api/data/v3/',
      },
      'default',
    );
    expect(result).toEqual({
      status: 'resolved',
      oauthUrl: 'https://certification.ed-fi.org/v7.3/api/oauth/token',
      resourceBaseUrl: 'https://certification.ed-fi.org/v7.3/api/data/v3',
    });
  });

  it('substitutes the tenant name into {tenantIdentifier}', () => {
    const result = resolveOdsApiUrls(
      {
        oauth: 'https://localhost/odsv7-adminv2-multi-api/{tenantIdentifier}/oauth/token',
        dataManagementApi: 'https://localhost/odsv7-adminv2-multi-api/{tenantIdentifier}/data/v3/',
      },
      'tenant1',
    );
    expect(result).toEqual({
      status: 'resolved',
      oauthUrl: 'https://localhost/odsv7-adminv2-multi-api/tenant1/oauth/token',
      resourceBaseUrl: 'https://localhost/odsv7-adminv2-multi-api/tenant1/data/v3',
    });
  });

  it('URL-encodes the tenant name', () => {
    const result = resolveOdsApiUrls(
      {
        oauth: 'https://h/{tenantIdentifier}/oauth/token',
        dataManagementApi: 'https://h/{tenantIdentifier}/data/v3/',
      },
      'a b/c',
    );
    expect(result).toMatchObject({
      status: 'resolved',
      oauthUrl: 'https://h/a%20b%2Fc/oauth/token',
    });
  });

  it('reports context routing when another placeholder remains', () => {
    const result = resolveOdsApiUrls(
      {
        oauth: 'https://localhost/odsv7-adminv2-single-api/oauth/token',
        dataManagementApi: 'https://localhost/odsv7-adminv2-single-api/{instanceId}/data/v3/',
      },
      'default',
    );
    expect(result).toEqual({ status: 'context-routing', placeholders: ['{instanceId}'] });
  });

  it('reports missing URLs when discovery has none', () => {
    expect(resolveOdsApiUrls(undefined, 'default')).toEqual({ status: 'missing-urls' });
    expect(resolveOdsApiUrls({ oauth: '', dataManagementApi: '' }, 'default')).toEqual({
      status: 'missing-urls',
    });
  });
});
