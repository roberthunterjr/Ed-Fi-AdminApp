import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import {
  CERT_TARGET_MESSAGES,
  CertificationTargetService,
  isTrustedTokenUrl,
} from './certification-target.service';
import { fetchOdsApiMetadata } from '../utils';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  fetchOdsApiMetadata: jest.fn(),
}));

const mockedDiscovery = fetchOdsApiMetadata as jest.Mock;
const sbEnvironment = { id: 1, domain: 'https://localhost/multi/' } as never;
const edfiTenant = { id: 10, name: 'tenant1', sbEnvironmentId: 1 } as never;

const meta = (oauth: string, dataManagementApi: string) => ({ urls: { oauth, dataManagementApi } });

describe('CertificationTargetService', () => {
  let odsRepository: { findOneByOrFail: jest.Mock; countBy: jest.Mock };
  let service: CertificationTargetService;

  beforeEach(() => {
    jest.resetAllMocks();
    odsRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 5, edfiTenantId: 10 }),
      countBy: jest.fn().mockResolvedValue(2),
    };
    service = new CertificationTargetService(odsRepository as never);
    mockedDiscovery.mockResolvedValue(
      meta(
        'https://localhost/multi/{tenantIdentifier}/oauth/token',
        'https://localhost/multi/{tenantIdentifier}/data/v3/',
      ),
    );
  });

  it('resolves both tenant URLs from a fresh discovery document', async () => {
    await expect(service.resolve({ sbEnvironment, edfiTenant, odsId: 5 })).resolves.toEqual({
      oauthUrl: 'https://localhost/multi/tenant1/oauth/token',
      resourceBaseUrl: 'https://localhost/multi/tenant1/data/v3',
    });
    expect(odsRepository.findOneByOrFail).toHaveBeenCalledWith({ id: 5, edfiTenantId: 10 });
  });

  it('returns 404 when the ODS is not in the tenant', async () => {
    odsRepository.findOneByOrFail.mockRejectedValue(
      Object.assign(new Error(), { name: 'EntityNotFoundError' }),
    );
    await expect(service.resolve({ sbEnvironment, edfiTenant, odsId: 99 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  const validationError = (message: string) => ({
    status: 400,
    response: { data: { errors: { 'root.serverError': { message } } } },
  });

  it('requires an odsId when the tenant has ODSs, before any network call', async () => {
    await expect(service.resolve({ sbEnvironment, edfiTenant })).rejects.toMatchObject(
      validationError(CERT_TARGET_MESSAGES.odsRequired),
    );
    expect(mockedDiscovery).not.toHaveBeenCalled();
  });

  it('treats a null odsId like an omitted one, before any lookup or network call', async () => {
    await expect(service.resolve({ sbEnvironment, edfiTenant, odsId: null })).rejects.toMatchObject(
      validationError(CERT_TARGET_MESSAGES.odsRequired),
    );
    expect(odsRepository.findOneByOrFail).not.toHaveBeenCalled();
    expect(mockedDiscovery).not.toHaveBeenCalled();
  });

  it('refuses a data URL that is not on the discovery host, so the token is never sent there', async () => {
    mockedDiscovery.mockResolvedValue(
      meta(
        'https://localhost/multi/{tenantIdentifier}/oauth/token',
        'https://evil.example/data/v3/',
      ),
    );
    await expect(service.resolve({ sbEnvironment, edfiTenant, odsId: 5 })).rejects.toMatchObject(
      validationError(CERT_TARGET_MESSAGES.untrustedResourceUrl),
    );
  });

  it('refuses context-routed environments', async () => {
    mockedDiscovery.mockResolvedValue(
      meta('https://localhost/{instanceId}/oauth/token', 'https://localhost/{instanceId}/data/v3/'),
    );
    await expect(service.resolve({ sbEnvironment, edfiTenant, odsId: 5 })).rejects.toMatchObject(
      validationError(CERT_TARGET_MESSAGES.contextRouting),
    );
  });
});

describe('isTrustedTokenUrl', () => {
  const discovery = 'https://localhost/multi/';
  it.each([
    ['the same https host', 'https://localhost/multi/t/oauth/token', discovery, true],
    ['the same https host and port', 'https://h:8443/o', 'https://h:8443/', true],
    ['http', 'http://localhost/multi/t/oauth/token', discovery, false],
    ['a different host', 'https://other/multi/t/oauth/token', discovery, false],
    ['the same host on a different port', 'https://localhost:8443/o', discovery, false],
    ['an unparsable token URL', 'not a url', discovery, false],
    ['an unparsable discovery URL', 'https://localhost/o', 'not a url', false],
    ['a userinfo trick where the host is evil', 'https://localhost@evil/o', discovery, false],
    [
      'an uppercase host with the default port',
      'https://LOCALHOST:443/multi/oauth/token',
      discovery,
      true,
    ],
    ['credentials in the token URL', 'https://user:pw@localhost/o', discovery, false],
    ['an IDN host in punycode', 'https://xn--bcher-kva.de/o', 'https://bücher.de/', true],
    ['a trailing-dot host', 'https://localhost./o', 'https://localhost/', false],
  ])('%s -> %s', (_label, tokenUrl, discoveryUrl, expected) => {
    expect(isTrustedTokenUrl(tokenUrl, discoveryUrl)).toBe(expected);
  });
});
