import 'reflect-metadata';
jest.mock('openid-client', () => {
  class MockConfiguration {
    constructor(
      private readonly server: Record<string, unknown>,
      private readonly clientId: string,
      readonly metadata?: unknown,
      readonly clientAuthentication?: unknown
    ) {}

    serverMetadata() {
      return this.server;
    }

    clientMetadata() {
      return { client_id: this.clientId };
    }
  }

  return {
    Configuration: MockConfiguration,
    buildEndSessionUrl: jest.fn((config, parameters = {}) => {
      const url = new URL(config.serverMetadata().end_session_endpoint);
      url.searchParams.set('client_id', config.clientMetadata().client_id);
      for (const [key, value] of Object.entries(parameters)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
      return url;
    }),
    ClientSecretBasic: jest.fn((secret: string) => ({ method: 'basic', secret })),
    ClientSecretPost: jest.fn((secret: string) => ({ method: 'post', secret })),
    discovery: jest.fn(),
    fetchUserInfo: jest.fn(),
    skipSubjectCheck: Symbol('skipSubjectCheck'),
  };
});

import * as client from 'openid-client';
import config from 'config';
import passport from 'passport';
import { OidcProviderRegistry } from './oidc-provider.registry';
import { NO_ROLE, OidcIdpBootstrapper, USER_NOT_FOUND } from './oidc.strategy';

jest.mock('config', () => ({
  FE_URL: 'http://frontend',
  MY_URL_API_PATH: 'http://adminapp/api',
  USE_PKCE: false,
  // Kept small so the discovery-timeout test resolves quickly
  OIDC_DISCOVERY_TIMEOUT_MS: 50,
}));

const keycloakOidcRow = {
  id: 1,
  issuer: 'http://keycloak/realms/edfi',
  clientId: 'adminapp-client',
  clientSecret: 'secret',
  scope: 'openid profile email',
};

const googleOidcRow = {
  id: 2,
  issuer: 'https://accounts.google.com',
  clientId: 'google-client',
  clientSecret: 'secret',
  scope: 'openid profile email',
};

const userinfo = { sub: 'user-1', email: 'teacher@example.org' };

const keycloakConfig = new client.Configuration(
  {
    issuer: 'http://keycloak/realms/edfi',
    authorization_endpoint: 'http://keycloak/realms/edfi/protocol/openid-connect/auth',
    token_endpoint: 'http://keycloak/realms/edfi/protocol/openid-connect/token',
    userinfo_endpoint: 'http://keycloak/realms/edfi/protocol/openid-connect/userinfo',
    jwks_uri: 'http://keycloak/realms/edfi/protocol/openid-connect/certs',
    end_session_endpoint: 'http://keycloak/realms/edfi/protocol/openid-connect/logout',
  },
  'adminapp-client',
  { client_secret: 'secret' }
);

// Google does not expose an end_session_endpoint in its discovery document
const googleConfig = new client.Configuration(
  {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  'google-client',
  { client_secret: 'secret' }
);

describe('OidcIdpBootstrapper', () => {
  let registry: OidcProviderRegistry;
  let passportUseSpy: jest.SpyInstance;

  const bootstrap = async (rows: unknown[], authService: unknown = {}): Promise<void> => {
    registry = new OidcProviderRegistry();
    const oidcRepo = { find: jest.fn().mockResolvedValue(rows) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bootstrapper = new OidcIdpBootstrapper(oidcRepo as any, authService as any, registry);
    await bootstrapper.onModuleInit();
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    passportUseSpy = jest.spyOn(passport, 'use').mockImplementation(() => passport);
    jest.spyOn(client, 'discovery').mockImplementation((url: URL) => {
      if (url.href.startsWith(keycloakOidcRow.issuer)) {
        return Promise.resolve(keycloakConfig);
      }
      if (url.href.startsWith(googleOidcRow.issuer)) {
        return Promise.resolve(googleConfig);
      }
      return Promise.reject(new Error(`Unexpected discovery URL: ${url}`));
    });
    jest.spyOn(client, 'fetchUserInfo').mockResolvedValue(userinfo);
  });

  it('registers a passport strategy per configured provider', async () => {
    await bootstrap([keycloakOidcRow, googleOidcRow]);

    expect(passportUseSpy).toHaveBeenCalledWith('oidc-1', expect.any(Object));
    expect(passportUseSpy).toHaveBeenCalledWith('oidc-2', expect.any(Object));
  });

  it('populates the registry so registered providers are queryable', async () => {
    await bootstrap([keycloakOidcRow, googleOidcRow]);

    expect(registry.getEndSessionUrl(keycloakOidcRow.id, 'token')).not.toBeNull();
    expect(registry.getEndSessionUrl(googleOidcRow.id, 'token')).toBeNull();
  });

  describe('scope', () => {
    const registeredScope = async (scope: string | null | undefined) => {
      await bootstrap([{ ...keycloakOidcRow, scope }]);
      return (passportUseSpy.mock.calls[0][1] as unknown as { options: { scope: string } }).options
        .scope;
    };

    it.each([
      ['empty', '', 'openid'],
      ['null', null, 'openid'],
      ['undefined', undefined, 'openid'],
      ['missing openid', 'profile email', 'openid profile email'],
      ['already containing openid', 'openid profile email', 'openid profile email'],
      ['irregular whitespace', ' profile   email ', 'openid profile email'],
    ])('sends openid for a %s configured scope', async (_label, configured, expected) => {
      expect(await registeredScope(configured)).toBe(expected);
    });
  });

  describe('client authentication', () => {
    const registeredClientAuth = async (methods: string[] | undefined, clientSecret = 'secret') => {
      const discovered = new client.Configuration(
        {
          ...(keycloakConfig.serverMetadata() as unknown as Record<string, unknown>),
          token_endpoint_auth_methods_supported: methods,
        } as never,
        'adminapp-client'
      );
      jest.spyOn(client, 'discovery').mockResolvedValue(discovered);
      await bootstrap([{ ...keycloakOidcRow, clientSecret }]);
      const strategy = passportUseSpy.mock.calls[0][1] as unknown as {
        options: { config: { clientAuthentication?: unknown } };
      };
      return strategy.options.config.clientAuthentication;
    };

    it('uses client_secret_basic when the methods are not advertised', async () => {
      expect(await registeredClientAuth(undefined)).toEqual({ method: 'basic', secret: 'secret' });
    });

    it('uses client_secret_basic when it is the only supported method', async () => {
      expect(await registeredClientAuth(['client_secret_basic'])).toEqual({
        method: 'basic',
        secret: 'secret',
      });
    });

    it.each([
      ['post only', ['client_secret_post']],
      ['post and basic (Google)', ['client_secret_post', 'client_secret_basic']],
      [
        'several incl. basic (Entra ID)',
        ['client_secret_post', 'private_key_jwt', 'client_secret_basic'],
      ],
      ['neither post nor basic', ['private_key_jwt']],
    ])('uses client_secret_post for %s', async (_label, methods) => {
      expect(await registeredClientAuth(methods)).toEqual({ method: 'post', secret: 'secret' });
    });

    it('leaves a public client unauthenticated', async () => {
      expect(await registeredClientAuth(undefined, '')).toBeUndefined();
    });
  });

  describe('USE_PKCE', () => {
    it.each([
      [true, true],
      [false, false],
      ['true', true],
      ['false', false],
    ])('passes USE_PKCE=%p to the strategy as %p', async (configured, usePKCE) => {
      (config as unknown as { USE_PKCE: unknown }).USE_PKCE = configured;
      await bootstrap([keycloakOidcRow]);
      const strategy = passportUseSpy.mock.calls[0][1] as unknown as {
        options: { usePKCE: boolean };
      };
      expect(strategy.options.usePKCE).toBe(usePKCE);
    });
  });

  describe('when discovery fails for one of several configured providers', () => {
    beforeEach(() => {
      jest.spyOn(client, 'discovery').mockImplementation((url: URL) => {
        if (url.href.startsWith(keycloakOidcRow.issuer)) {
          return Promise.resolve(keycloakConfig);
        }
        return Promise.reject(new Error('discovery unavailable'));
      });
    });

    it('still registers the providers that discovered successfully', async () => {
      await bootstrap([keycloakOidcRow, googleOidcRow]);

      expect(passportUseSpy).toHaveBeenCalledWith('oidc-1', expect.any(Object));
      expect(passportUseSpy).not.toHaveBeenCalledWith('oidc-2', expect.any(Object));
    });

    it('records the failed provider so it is not inferred as the sole one', async () => {
      await bootstrap([keycloakOidcRow, googleOidcRow]);

      expect(registry.getFailedProviderIds()).toEqual([googleOidcRow.id]);
      expect(registry.getSoleOidcId()).toBeUndefined();
    });
  });

  describe('when a provider hangs during discovery', () => {
    beforeEach(() => {
      jest.spyOn(client, 'discovery').mockImplementation((url: URL) => {
        if (url.href.startsWith(keycloakOidcRow.issuer)) {
          return Promise.resolve(keycloakConfig);
        }
        // Never resolves: exercises the per-provider discovery timeout
        return new Promise(() => undefined);
      });
    });

    it('skips the unresponsive provider and still registers the healthy one', async () => {
      await bootstrap([keycloakOidcRow, googleOidcRow]);

      expect(passportUseSpy).toHaveBeenCalledWith('oidc-1', expect.any(Object));
      expect(passportUseSpy).not.toHaveBeenCalledWith('oidc-2', expect.any(Object));
    });
  });

  describe('the verify callback', () => {
    const captureVerify = async (validateUser: jest.Mock) => {
      await bootstrap([keycloakOidcRow], { validateUser });
      const strategy = passportUseSpy.mock.calls.find((call) => call[0] === 'oidc-1')?.[1];
      // openid-client stores the verify function on the strategy instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (strategy as any)._verify as (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tokenset: any,
        done: jest.Mock
      ) => Promise<void>;
    };

    it('passes the id_token along when the user is valid', async () => {
      const verify = await captureVerify(
        jest.fn().mockResolvedValue({ roleId: 5, userTeamMemberships: [{}] })
      );
      const done = jest.fn();

      await verify(
        {
          access_token: 'the-access-token',
          id_token: 'the-id-token',
          claims: () => ({ sub: 'user-1' }),
        },
        done
      );

      expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ roleId: 5 }), {
        idToken: 'the-id-token',
      });
      expect(client.fetchUserInfo).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'adminapp-client' }),
        'the-access-token',
        'user-1'
      );
    });

    it('fails with USER_NOT_FOUND when the user does not exist', async () => {
      const verify = await captureVerify(jest.fn().mockResolvedValue(null));
      const done = jest.fn();

      await verify({ access_token: 'tok', claims: () => ({ sub: 'user-1' }) }, done);

      expect(done).toHaveBeenCalledWith(
        expect.objectContaining({ message: USER_NOT_FOUND, username: 'teacher@example.org' }),
        false
      );
    });

    it('fails with NO_ROLE when the user has no role assigned', async () => {
      const verify = await captureVerify(jest.fn().mockResolvedValue({ roleId: null }));
      const done = jest.fn();

      await verify({ access_token: 'tok', claims: () => ({ sub: 'user-1' }) }, done);

      expect(done).toHaveBeenCalledWith(
        expect.objectContaining({ message: NO_ROLE, username: 'teacher@example.org' }),
        false
      );
    });

    it('maps a validateUser failure to a database error', async () => {
      const verify = await captureVerify(
        jest.fn().mockRejectedValue(new Error('connection refused'))
      );
      const done = jest.fn();

      await verify({ access_token: 'tok', claims: () => ({ sub: 'user-1' }) }, done);

      expect(done).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Database connection error during authentication' }),
        false
      );
    });

    it('rejects when the IdP returns no email', async () => {
      const verify = await captureVerify(jest.fn());
      const done = jest.fn();

      jest.spyOn(client, 'fetchUserInfo').mockResolvedValueOnce({ sub: 'user-1', email: '' });

      await expect(
        verify({ access_token: 'tok', claims: () => ({ sub: 'user-1' }) }, done)
      ).rejects.toThrow('Invalid email from IdP');
      expect(done).not.toHaveBeenCalled();
    });
  });
});
