import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { SbEnvironmentEdfiTenantInterceptor } from '../app/sb-environment-edfi-tenant.interceptor';
import { AUTHORIZE_KEY } from '../auth/authorization/authorize.decorator';
import { CertificationSupportInterceptor } from './certification-support.interceptor';
import { CertificationTokenController } from './certification-token.controller';

describe('CertificationTokenController', () => {
  it('resolves the environment, then refuses unsupported data models', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, CertificationTokenController)).toEqual([
      SbEnvironmentEdfiTenantInterceptor,
      CertificationSupportInterceptor,
    ]);
  });

  it('passes the tenant, environment and body to the service and serializes the result', async () => {
    const service = {
      requestToken: jest.fn().mockResolvedValue({
        token: 't',
        expiresAt: '2026-10-06T20:30:00.000Z',
        oauthUrl: 'https://h/oauth/token',
        resourceBaseUrl: 'https://h/data/v3',
      }),
    };
    const controller = new CertificationTokenController(service as never);
    const sbEnvironment = { id: 1 } as never;
    const edfiTenant = { id: 10, name: 'tenant1' } as never;

    const result = await controller.requestToken(sbEnvironment, edfiTenant, {
      key: 'k',
      secret: 's',
      odsId: 5,
    });

    expect(service.requestToken).toHaveBeenCalledWith({
      sbEnvironment,
      edfiTenant,
      odsId: 5,
      key: 'k',
      secret: 's',
    });
    expect(result).toEqual({
      token: 't',
      expiresAt: '2026-10-06T20:30:00.000Z',
      oauthUrl: 'https://h/oauth/token',
      resourceBaseUrl: 'https://h/data/v3',
    });
  });

  it('is guarded by sb-environment:update on the environment', () => {
    expect(
      Reflect.getMetadata(AUTHORIZE_KEY, CertificationTokenController.prototype.requestToken),
    ).toEqual({ privilege: 'sb-environment:update', subject: { id: 'sbEnvironmentId' } });
  });
});
