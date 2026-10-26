jest.mock('openid-client', () => {
  class AuthorizationResponseError extends Error {
    constructor(
      readonly error: string,
      readonly error_description?: string
    ) {
      super(error);
    }
  }
  return {
    AuthorizationResponseError,
    authorizationCodeGrant: jest.fn(),
    buildAuthorizationUrl: jest.fn(
      (
        config: { serverMetadata: () => { authorization_endpoint: string } },
        params: URLSearchParams
      ) => {
        const url = new URL(config.serverMetadata().authorization_endpoint);
        params.forEach((value, key) => url.searchParams.set(key, value));
        url.searchParams.set('client_id', 'adminapp-client');
        url.searchParams.set('response_type', 'code');
        return url;
      }
    ),
    calculatePKCECodeChallenge: jest.fn(async (verifier: string) => `challenge-of-${verifier}`),
    randomPKCECodeVerifier: jest.fn(() => 'the-verifier'),
    randomState: jest.fn(() => 'random-state'),
  };
});

import * as client from 'openid-client';
import { Passport } from 'passport';
import { AdminAppOidcStrategy, OidcVerify } from './oidc-passport.strategy';

const callbackURL = 'http://adminapp/api/auth/callback/1';
const oidcConfig = {
  serverMetadata: () => ({ authorization_endpoint: 'http://keycloak/auth' }),
} as unknown as client.Configuration;

type Outcome = { redirect?: URL; error?: Error; user?: unknown; info?: unknown };

const setup = (
  usePKCE: boolean,
  verify: OidcVerify = (_t, done) => done(null, { id: 7 }, { idToken: 'the-id-token' })
) => {
  const passport = new Passport();
  passport.use(
    'oidc-1',
    new AdminAppOidcStrategy(
      { config: oidcConfig, callbackURL, scope: 'openid profile', usePKCE, sessionKey: 'oidc:1' },
      verify,
      'oidc-1'
    ) as never
  );

  const run = (req: Record<string, unknown>, options: Record<string, unknown> = {}) =>
    new Promise<Outcome>((resolve) => {
      const res = {
        statusCode: 200,
        setHeader: (name: string, value: string) => {
          if (name === 'Location') {
            resolve({ redirect: new URL(value) });
          }
        },
        end: () => undefined,
      };
      passport.authenticate(
        'oidc-1',
        options,
        (error: Error | null, user: unknown, info: unknown) =>
          resolve({ error: error ?? undefined, user, info })
      )(req as never, res as never, (error: Error) => resolve({ error }));
    });

  return { run };
};

const loginRequest = (session: Record<string, unknown> = {}) => ({
  method: 'GET',
  url: '/auth/login/1',
  originalUrl: '/auth/login/1',
  session,
});

const callbackRequest = (session: Record<string, unknown>, query = 'code=abc&state=the-state') => ({
  method: 'GET',
  url: `/auth/callback/1?${query}`,
  originalUrl: `/auth/callback/1?${query}`,
  session,
});

describe('AdminAppOidcStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      access_token: 'access',
      id_token: 'the-id-token',
    });
  });

  describe('authorization request', () => {
    it('sends an S256 code challenge and stores the verifier when USE_PKCE is true', async () => {
      const session: Record<string, unknown> = {};
      const { redirect } = await setup(true).run(loginRequest(session), { state: 'the-state' });

      expect(redirect?.searchParams.get('code_challenge')).toBe('challenge-of-the-verifier');
      expect(redirect?.searchParams.get('code_challenge_method')).toBe('S256');
      expect(redirect?.searchParams.get('state')).toBe('the-state');
      expect(redirect?.searchParams.get('scope')).toBe('openid profile');
      expect(redirect?.searchParams.get('redirect_uri')).toBe(callbackURL);
      expect(session['oidc:1']).toEqual({ state: 'the-state', code_verifier: 'the-verifier' });
    });

    it('sends no PKCE parameters and stores no verifier when USE_PKCE is false', async () => {
      const session: Record<string, unknown> = {};
      const { redirect } = await setup(false).run(loginRequest(session), { state: 'the-state' });

      expect(redirect?.searchParams.has('code_challenge')).toBe(false);
      expect(redirect?.searchParams.has('code_challenge_method')).toBe(false);
      expect(redirect?.searchParams.get('state')).toBe('the-state');
      expect(session['oidc:1']).toEqual({ state: 'the-state' });
    });

    it('generates a state when none is supplied', async () => {
      const session: Record<string, unknown> = {};
      const { redirect } = await setup(false).run(loginRequest(session));

      expect(redirect?.searchParams.get('state')).toBe('random-state');
    });

    it('errors when the session middleware is missing', async () => {
      const { error } = await setup(true).run({ ...loginRequest(), session: undefined });

      expect(error?.message).toMatch(/session support/);
    });
  });

  describe('callback', () => {
    it.each([
      [
        true,
        { state: 'the-state', code_verifier: 'the-verifier' },
        { pkceCodeVerifier: 'the-verifier' },
      ],
      [false, { state: 'the-state' }, {}],
    ])(
      'exchanges the code with the matching checks when USE_PKCE is %s',
      async (usePKCE, sessionState, pkceChecks) => {
        const session: Record<string, unknown> = { 'oidc:1': sessionState };
        await setup(usePKCE).run(callbackRequest(session));

        const [, currentUrl, checks] = (client.authorizationCodeGrant as jest.Mock).mock.calls[0];
        expect((currentUrl as URL).origin + (currentUrl as URL).pathname).toBe(callbackURL);
        expect((currentUrl as URL).searchParams.get('code')).toBe('abc');
        expect(checks).toEqual({ expectedState: 'the-state', ...pkceChecks });
        expect(session['oidc:1']).toBeUndefined();
      }
    );

    it('hands the verify info (id_token) to the passport callback', async () => {
      const session = { 'oidc:1': { state: 'the-state', code_verifier: 'the-verifier' } };
      const { user, info, error } = await setup(true).run(callbackRequest(session));

      expect(error).toBeUndefined();
      expect(user).toEqual({ id: 7 });
      expect(info).toEqual({ idToken: 'the-id-token' });
    });

    it('fails when no authorization request state is in the session', async () => {
      const { user, info } = await setup(true).run(callbackRequest({}));

      expect(user).toBe(false);
      expect(info).toEqual({ message: 'Unable to verify authorization request state' });
      expect(client.authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it('fails when PKCE is on but the session has no verifier', async () => {
      const { user } = await setup(true).run(callbackRequest({ 'oidc:1': { state: 'the-state' } }));

      expect(user).toBe(false);
      expect(client.authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it('fails (not errors) when the user denies access', async () => {
      (client.authorizationCodeGrant as jest.Mock).mockRejectedValue(
        new client.AuthorizationResponseError('access_denied' as never, 'nope' as never)
      );
      const { user, info, error } = await setup(false).run(
        callbackRequest({ 'oidc:1': { state: 'the-state' } })
      );

      expect(error).toBeUndefined();
      expect(user).toBe(false);
      expect(info).toEqual({ message: 'nope' });
    });

    it('surfaces token exchange failures as errors', async () => {
      (client.authorizationCodeGrant as jest.Mock).mockRejectedValue(new Error('invalid_grant'));
      const { error } = await setup(false).run(
        callbackRequest({ 'oidc:1': { state: 'the-state' } })
      );

      expect(error?.message).toBe('invalid_grant');
    });

    it('surfaces verify errors', async () => {
      const verify: OidcVerify = (_t, done) => done(new Error('User not found'));
      const { error } = await setup(false, verify).run(
        callbackRequest({ 'oidc:1': { state: 'the-state' } })
      );

      expect(error?.message).toBe('User not found');
    });
  });
});
