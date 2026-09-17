import axios from 'axios';
import {
  fetchAdminApiTenancy,
  AdminApiTenancyError,
} from './admin-api-tenancy';

jest.mock('axios');
jest.mock('config', () => ({ EDFI_URLS_TIMEOUT_MS: 5000 }));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const infoWithTenancy = { specificationVersion: 'v2', urls: { tenancy: 'https://host/v2/tenancy' } };

describe('fetchAdminApiTenancy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not-supported and makes no HTTP call when urls is absent (v1)', async () => {
    const result = await fetchAdminApiTenancy({ specificationVersion: 'v1' });

    expect(result).toEqual({ supported: false });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('returns not-supported and makes no HTTP call when urls.tenancy is an empty string (v1)', async () => {
    const result = await fetchAdminApiTenancy({ specificationVersion: 'v1', urls: { tenancy: '' } });

    expect(result).toEqual({ supported: false });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('returns MultiTenant with the tenant list when tenants is non-empty', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: { tenants: ['tenant1', 'tenant2'] } });

    const result = await fetchAdminApiTenancy(infoWithTenancy);

    expect(result).toEqual({ supported: true, tenants: ['tenant1', 'tenant2'], mode: 'MultiTenant' });
    expect(mockedAxios.get).toHaveBeenCalledWith('https://host/v2/tenancy', {
      headers: { Accept: 'application/json' },
      timeout: 5000,
      maxRedirects: 0,
    });
  });

  it('returns SingleTenant with an empty list when tenants is empty', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: { tenants: [] } });

    const result = await fetchAdminApiTenancy(infoWithTenancy);

    expect(result).toEqual({ supported: true, tenants: [], mode: 'SingleTenant' });
  });

  it('throws UNAVAILABLE when a 200 response is missing the tenants array', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: {} });

    await expect(fetchAdminApiTenancy(infoWithTenancy)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
    });
  });

  it('throws UNAVAILABLE when tenants is not an array of strings', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: { tenants: [{ name: 'tenant1' }] } });

    await expect(fetchAdminApiTenancy(infoWithTenancy)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
    });
  });

  it('throws MISCONFIGURED with the V3 problem-details detail text on a 503', async () => {
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 503,
        data: {
          type: 'urn:ed-fi:management-api:service-unavailable',
          title: 'Error',
          status: 503,
          detail: 'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.',
          correlationId: '0HNO9PVAK5HPV:00000005',
        },
      },
    });

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error).toBeInstanceOf(AdminApiTenancyError);
    expect(error.kind).toBe('MISCONFIGURED');
    expect(error.detail).toBe(
      'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.'
    );
  });

  it('throws MISCONFIGURED with the V2 message text on a 503', async () => {
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 503,
        data: {
          message: 'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.',
        },
      },
    });

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error.kind).toBe('MISCONFIGURED');
    expect(error.detail).toBe(
      'MultiTenancy is enabled but no tenants are configured. Check the Tenants section of appsettings.'
    );
  });

  it('throws UNAVAILABLE with no detail on a bodiless 503 (proxy or stopped container)', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 503, data: '<html>503 Service Unavailable</html>' } });

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error.kind).toBe('UNAVAILABLE');
    expect(error.detail).toBeUndefined();
  });

  it('throws UNAVAILABLE on a 500 and does not expose the response text as detail', async () => {
    mockedAxios.get.mockRejectedValue({
      response: { status: 500, data: { detail: 'NullReferenceException at Internal.Thing' } },
    });

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error.kind).toBe('UNAVAILABLE');
    expect(error.detail).toBeUndefined();
  });

  it('returns not-supported on a 404 rather than throwing', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404, data: {} } });

    const result = await fetchAdminApiTenancy(infoWithTenancy);

    expect(result).toEqual({ supported: false });
  });

  it('throws UNAVAILABLE on a 401', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 401, data: {} } });

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error.kind).toBe('UNAVAILABLE');
  });

  it('throws UNAVAILABLE on a 403', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 403, data: {} } });

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error).toBeInstanceOf(AdminApiTenancyError);
    expect(error.kind).toBe('UNAVAILABLE');
  });

  it('throws UNAVAILABLE when the request fails with no response at all', async () => {
    mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await fetchAdminApiTenancy(infoWithTenancy).catch((e) => e);

    expect(error).toBeInstanceOf(AdminApiTenancyError);
    expect(error.kind).toBe('UNAVAILABLE');
  });

  describe('SSRF guard — tenancy URL origin must match the configured Admin API URL', () => {
    it('refuses to call the tenancy endpoint when its origin differs from adminApiUrl, without making an HTTP call', async () => {
      const error = await fetchAdminApiTenancy(infoWithTenancy, 'https://attacker.example').catch(
        (e) => e
      );

      expect(error).toBeInstanceOf(AdminApiTenancyError);
      expect(error.kind).toBe('UNAVAILABLE');
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('allows the call when the tenancy URL origin matches adminApiUrl exactly', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200, data: { tenants: [] } });

      const result = await fetchAdminApiTenancy(infoWithTenancy, 'https://host');

      expect(result).toEqual({ supported: true, tenants: [], mode: 'SingleTenant' });
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it('allows the call when the tenancy URL differs only by path (same origin)', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200, data: { tenants: [] } });

      const result = await fetchAdminApiTenancy(infoWithTenancy, 'https://host/some/other/path');

      expect(result).toEqual({ supported: true, tenants: [], mode: 'SingleTenant' });
    });

    it('skips the origin check when no adminApiUrl is supplied (backward-compatible callers)', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200, data: { tenants: [] } });

      const result = await fetchAdminApiTenancy(infoWithTenancy);

      expect(result).toEqual({ supported: true, tenants: [], mode: 'SingleTenant' });
    });
  });
});
