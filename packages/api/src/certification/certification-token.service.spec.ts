import 'reflect-metadata';
// packages/api/src/certification/certification-token.service.spec.ts
import axios from 'axios';
import { CertificationTokenService, CERT_TOKEN_MESSAGES } from './certification-token.service';
import { CertificationTargetService } from './certification-target.service';
import { fetchOdsApiMetadata } from '../utils';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    __esModule: true,
    default: { ...actual.default, post: jest.fn() },
    isAxiosError: actual.isAxiosError,
  };
});
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  fetchOdsApiMetadata: jest.fn(),
}));

const mockedPost = axios.post as jest.Mock;
const mockedDiscovery = fetchOdsApiMetadata as jest.Mock;

const multiTenantMeta = {
  urls: {
    oauth: 'https://localhost/multi/{tenantIdentifier}/oauth/token',
    dataManagementApi: 'https://localhost/multi/{tenantIdentifier}/data/v3/',
  },
};

const sbEnvironment = { id: 1, domain: 'https://localhost/multi/' } as never;
const edfiTenant = { id: 10, name: 'tenant1', sbEnvironmentId: 1 } as never;

const axiosError = (status: number | undefined, data?: unknown) =>
  Object.assign(new Error('fail'), {
    isAxiosError: true,
    response: status ? { status, data } : undefined,
    config: { data: 'client_secret=SHOULD_NOT_LEAK' },
  });

describe('CertificationTokenService', () => {
  let odsRepository: { findOneByOrFail: jest.Mock; countBy: jest.Mock };
  let service: CertificationTokenService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    odsRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 5, edfiTenantId: 10 }),
      countBy: jest.fn().mockResolvedValue(2),
    };
    service = new CertificationTokenService(new CertificationTargetService(odsRepository as never));
    mockedDiscovery.mockResolvedValue(multiTenantMeta);
  });

  it('re-fetches discovery, resolves the tenant URL and returns the token', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T20:00:00.000Z'));
    mockedPost.mockResolvedValue({ data: { access_token: 'tok', expires_in: 1800 } });

    const result = await service.requestToken({
      sbEnvironment,
      edfiTenant,
      odsId: 5,
      key: 'k',
      secret: 's',
    });

    expect(mockedDiscovery).toHaveBeenCalledWith({
      odsApiDiscoveryUrl: 'https://localhost/multi/',
    });
    expect(odsRepository.findOneByOrFail).toHaveBeenCalledWith({ id: 5, edfiTenantId: 10 });
    const [url, body, options] = mockedPost.mock.calls[0];
    expect(options).toMatchObject({ maxRedirects: 0 });
    expect(url).toBe('https://localhost/multi/tenant1/oauth/token');
    expect(body.toString()).toBe('grant_type=client_credentials&client_id=k&client_secret=s');
    expect(result).toEqual({
      token: 'tok',
      expiresAt: '2026-10-06T20:30:00.000Z',
      oauthUrl: 'https://localhost/multi/tenant1/oauth/token',
      resourceBaseUrl: 'https://localhost/multi/tenant1/data/v3',
    });
  });

  it('proceeds without an odsId when the tenant has no ODSs (v1, or none synced)', async () => {
    odsRepository.countBy.mockResolvedValue(0);
    mockedPost.mockResolvedValue({ data: { access_token: 'tok', expires_in: 60 } });
    const result = await service.requestToken({ sbEnvironment, edfiTenant, key: 'k', secret: 's' });
    expect(odsRepository.countBy).toHaveBeenCalledWith({ edfiTenantId: 10 });
    expect(odsRepository.findOneByOrFail).not.toHaveBeenCalled();
    expect(result.token).toBe('tok');
  });

  it('requires an odsId when the tenant has ODSs, before any network call', async () => {
    await expect(
      service.requestToken({ sbEnvironment, edfiTenant, key: 'k', secret: 's' }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        data: { errors: { 'root.serverError': { message: CERT_TOKEN_MESSAGES.odsRequired } } },
      },
    });
    expect(mockedDiscovery).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('returns 404 when the ODS is not in the tenant', async () => {
    odsRepository.findOneByOrFail.mockRejectedValue(
      Object.assign(new Error(), { name: 'EntityNotFoundError' }),
    );
    await expect(
      service.requestToken({ sbEnvironment, edfiTenant, odsId: 99, key: 'k', secret: 's' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('refuses context-routed environments without calling the token endpoint', async () => {
    mockedDiscovery.mockResolvedValue({
      urls: {
        oauth: 'https://h/oauth/token',
        dataManagementApi: 'https://h/{instanceId}/data/v3/',
      },
    });
    await expect(
      service.requestToken({ sbEnvironment, edfiTenant, odsId: 5, key: 'k', secret: 's' }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        data: { errors: { 'root.serverError': { message: CERT_TOKEN_MESSAGES.contextRouting } } },
      },
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('refuses an environment without a discovery URL', async () => {
    await expect(
      service.requestToken({
        sbEnvironment: { id: 1, domain: undefined } as never,
        edfiTenant,
        key: 'k',
        secret: 's',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockedDiscovery).not.toHaveBeenCalled();
  });

  it.each([
    [400, { error: 'invalid_client' }],
    [401, { error: 'invalid_client' }],
  ])('maps %s invalid_client to a 400 "invalid credentials" (never 401)', async (status, data) => {
    mockedPost.mockRejectedValue(axiosError(status, data));
    await expect(
      service.requestToken({ sbEnvironment, edfiTenant, odsId: 5, key: 'k', secret: 's' }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        data: {
          errors: { 'root.serverError': { message: CERT_TOKEN_MESSAGES.invalidCredentials } },
        },
      },
    });
  });

  it('maps 404 to "no token endpoint"', async () => {
    mockedPost.mockRejectedValue(axiosError(404));
    await expect(
      service.requestToken({ sbEnvironment, edfiTenant, odsId: 5, key: 'k', secret: 's' }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        data: {
          errors: {
            'root.serverError': {
              message: CERT_TOKEN_MESSAGES.noTokenEndpoint(
                'https://localhost/multi/tenant1/oauth/token',
              ),
            },
          },
        },
      },
    });
  });

  it('maps network errors to "unreachable" and never echoes the secret', async () => {
    mockedPost.mockRejectedValue(axiosError(undefined));
    const error = await service
      .requestToken({ sbEnvironment, edfiTenant, odsId: 5, key: 'k', secret: 'SHOULD_NOT_LEAK' })
      .catch((e) => e);
    expect(error.status).toBe(400);
    expect(JSON.stringify(error.response)).not.toContain('SHOULD_NOT_LEAK');
    expect(error.response.data.errors['root.serverError'].message).toBe(
      CERT_TOKEN_MESSAGES.unreachable('https://localhost/multi/tenant1/oauth/token'),
    );
  });

  it.each([
    ['an http token URL', 'http://localhost/multi/{tenantIdentifier}/oauth/token'],
    [
      'a token URL on a different host',
      'https://evil.example/multi/{tenantIdentifier}/oauth/token',
    ],
  ])('refuses %s without sending the credentials', async (_label, oauth) => {
    mockedDiscovery.mockResolvedValue({ urls: { ...multiTenantMeta.urls, oauth } });
    await expect(
      service.requestToken({ sbEnvironment, edfiTenant, odsId: 5, key: 'k', secret: 's' }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        data: {
          errors: { 'root.serverError': { message: CERT_TOKEN_MESSAGES.untrustedTokenUrl } },
        },
      },
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
