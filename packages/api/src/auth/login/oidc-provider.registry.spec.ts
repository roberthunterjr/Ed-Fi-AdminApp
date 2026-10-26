import 'reflect-metadata';
jest.mock('openid-client', () => {
  class MockConfiguration {
    constructor(
      private readonly server: Record<string, string>,
      private readonly clientId: string
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
  };
});

import * as client from 'openid-client';
import { OidcProviderRegistry } from './oidc-provider.registry';

jest.mock('config', () => ({
  MY_URL_API_PATH: 'http://adminapp/api',
}));

const keycloakConfig = new client.Configuration(
  {
    issuer: 'http://keycloak/realms/edfi',
    authorization_endpoint: 'http://keycloak/realms/edfi/protocol/openid-connect/auth',
    token_endpoint: 'http://keycloak/realms/edfi/protocol/openid-connect/token',
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
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  'google-client',
  { client_secret: 'secret' }
);

describe('OidcProviderRegistry', () => {
  let registry: OidcProviderRegistry;

  beforeEach(() => {
    registry = new OidcProviderRegistry();
  });

  describe('getIssuer', () => {
    it('returns the issuer of a registered provider, given a numeric or string id', () => {
      registry.register(1, keycloakConfig);

      expect(registry.getIssuer(1)).toBe('http://keycloak/realms/edfi');
      expect(registry.getIssuer('1')).toBe('http://keycloak/realms/edfi');
    });

    it.each([[2], [undefined], [null]])('returns null for %s', (id) => {
      registry.register(1, keycloakConfig);

      expect(registry.getIssuer(id)).toBeNull();
    });
  });

  describe('getSoleOidcId', () => {
    it('returns undefined when no providers are registered', () => {
      registry.setConfiguredProviderCount(0);

      expect(registry.getSoleOidcId()).toBeUndefined();
    });

    it('returns the sole provider id when exactly one is configured and registered', () => {
      registry.setConfiguredProviderCount(1);
      registry.register(1, keycloakConfig);

      expect(registry.getSoleOidcId()).toBe(1);
    });

    it('returns undefined when more than one provider is registered', () => {
      registry.setConfiguredProviderCount(2);
      registry.register(1, keycloakConfig);
      registry.register(2, googleConfig);

      expect(registry.getSoleOidcId()).toBeUndefined();
    });

    it('returns undefined when a second configured provider failed to register', () => {
      // One provider was configured but did not register; the survivor must not
      // be assumed to be the one a legacy (untracked) session logged in with.
      registry.setConfiguredProviderCount(2);
      registry.register(1, keycloakConfig);
      registry.markFailed(2);

      expect(registry.getSoleOidcId()).toBeUndefined();
    });
  });

  describe('getEndSessionUrl', () => {
    beforeEach(() => {
      registry.setConfiguredProviderCount(2);
      registry.register(1, keycloakConfig);
      registry.register(2, googleConfig);
    });

    it('builds the logout URL from the discovered end_session_endpoint', () => {
      const url = registry.getEndSessionUrl(1, 'the-id-token');

      expect(url).not.toBeNull();
      const parsed = new URL(url as string);
      expect(`${parsed.origin}${parsed.pathname}`).toBe(
        'http://keycloak/realms/edfi/protocol/openid-connect/logout'
      );
      expect(parsed.searchParams.get('id_token_hint')).toBe('the-id-token');
      expect(parsed.searchParams.get('post_logout_redirect_uri')).toBe(
        'http://adminapp/api/auth/post-logout'
      );
      expect(parsed.searchParams.get('client_id')).toBe('adminapp-client');
    });

    it('omits id_token_hint when no id_token is available', () => {
      const url = registry.getEndSessionUrl(1);

      const parsed = new URL(url as string);
      expect(parsed.searchParams.has('id_token_hint')).toBe(false);
      expect(parsed.searchParams.get('client_id')).toBe('adminapp-client');
    });

    it('returns null for a provider without an end_session_endpoint', () => {
      expect(registry.getEndSessionUrl(2, 'the-id-token')).toBeNull();
    });

    it('returns null for an unregistered provider id', () => {
      expect(registry.getEndSessionUrl(999, 'the-id-token')).toBeNull();
    });
  });

  describe('failure tracking', () => {
    it('reports failed provider ids and clears them', () => {
      registry.markFailed(3);
      registry.markFailed(4);
      expect(registry.getFailedProviderIds()).toEqual([3, 4]);

      registry.clearFailures();
      expect(registry.getFailedProviderIds()).toEqual([]);
    });
  });
});
