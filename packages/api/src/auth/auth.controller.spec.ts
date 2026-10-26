import 'reflect-metadata';
jest.mock('openid-client', () => ({
  discovery: jest.fn(),
  fetchUserInfo: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  skipSubjectCheck: Symbol('skipSubjectCheck'),
}));

// The installed node_modules is stale, so these modules fail type-check; the controller only
// needs their runtime shape here.
jest.mock('./auth.service', () => ({ AuthService: class AuthService {} }));
jest.mock('./login/oidc-provider.registry', () => ({
  OidcProviderRegistry: class OidcProviderRegistry {},
}));
jest.mock('./login/oidc.strategy', () => ({
  USER_NOT_FOUND: 'User not found',
  NO_ROLE: 'No role assigned for user',
}));

import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import passport from 'passport';
import { AuditEventQueue } from '../audit/audit-event.queue';
import { AuditEventRecorder } from '../audit/audit-event.recorder';
import { AuthController, LOCAL_ONLY_LOGOUT_MESSAGE, SIGNED_OUT_MESSAGE } from './auth.controller';
import { NO_ROLE, USER_NOT_FOUND } from './login/oidc.strategy';

jest.mock('config', () => ({
  FE_URL: 'http://frontend',
  MY_URL_API_PATH: 'http://adminapp/api',
  USE_PKCE: false,
}));

describe('AuthController', () => {
  let controller: AuthController;
  let getEndSessionUrl: jest.Mock;
  let getSoleOidcId: jest.Mock;
  let getIssuer: jest.Mock;
  let response: Response;
  let record: jest.Mock;

  const buildRequest = (session: Record<string, unknown>): Request => {
    return {
      headers: {},
      session: {
        destroy: jest.fn((callback: (err?: Error) => void) => callback()),
        save: jest.fn((callback: (err?: Error) => void) => callback()),
        ...session,
      },
      logIn: jest.fn((_user: unknown, callback: (err?: Error) => void) => callback()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  };

  beforeEach(() => {
    getEndSessionUrl = jest.fn();
    getSoleOidcId = jest.fn();
    getIssuer = jest.fn((id: number | string) => `https://idp.example/realms/${id}`);
    record = jest.fn();
    controller = new AuthController(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { getEndSessionUrl, getSoleOidcId, getIssuer } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { record } as any,
    );
    response = {
      redirect: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logout', () => {
    it('rejects Bearer token authentication', async () => {
      const request = buildRequest({});
      request.headers['authorization'] = 'Bearer some-token';

      await expect(controller.logout(request, response)).rejects.toThrow(BadRequestException);
    });

    it('redirects to the end-session URL of the provider the user logged in with', async () => {
      const request = buildRequest({ oidcId: 3, idToken: 'the-id-token' });
      getEndSessionUrl.mockReturnValue('http://idp/end-session?id_token_hint=the-id-token');

      await controller.logout(request, response);

      expect(request.session.destroy).toHaveBeenCalled();
      expect(getEndSessionUrl).toHaveBeenCalledWith(3, 'the-id-token');
      expect(response.redirect).toHaveBeenCalledWith(
        'http://idp/end-session?id_token_hint=the-id-token',
      );
    });

    it('falls back to a local-only logout with a message when the provider has no end_session_endpoint', async () => {
      const request = buildRequest({ oidcId: 2, idToken: 'the-id-token' });
      getEndSessionUrl.mockReturnValue(null);

      await controller.logout(request, response);

      expect(request.session.destroy).toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        `http://frontend/unauthenticated?msg=${encodeURIComponent(LOCAL_ONLY_LOGOUT_MESSAGE)}`,
      );
    });

    it('falls back to the sole registered provider when the session has no provider tracked', async () => {
      const request = buildRequest({});
      getSoleOidcId.mockReturnValue(1);
      getEndSessionUrl.mockReturnValue('http://idp/end-session');

      await controller.logout(request, response);

      expect(getEndSessionUrl).toHaveBeenCalledWith(1, undefined);
      expect(response.redirect).toHaveBeenCalledWith('http://idp/end-session');
    });

    it('confirms the local sign-out when no provider is tracked and multiple providers are registered', async () => {
      const request = buildRequest({});
      getSoleOidcId.mockReturnValue(undefined);

      await controller.logout(request, response);

      expect(request.session.destroy).toHaveBeenCalled();
      expect(getEndSessionUrl).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        `http://frontend/unauthenticated?msg=${encodeURIComponent(SIGNED_OUT_MESSAGE)}`
      );
    });

    it('redirects to the frontend when destroying the session fails', async () => {
      const request = buildRequest({ oidcId: 1, idToken: 'the-id-token' });
      (request.session.destroy as jest.Mock).mockImplementation((callback: (err?: Error) => void) =>
        callback(new Error('session store unavailable')),
      );

      await controller.logout(request, response);

      expect(getEndSessionUrl).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith('http://frontend');
    });
  });

  describe('oidcLoginCallback', () => {
    const user = { id: 7 };

    const mockAuthenticate = (
      result: { error?: Error; user?: unknown; info?: { idToken?: string } } = {},
    ) => {
      jest
        .spyOn(passport, 'authenticate')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((_name: any, callback: any) => () => {
          callback(result.error ?? null, result.user ?? false, result.info);
        });
    };

    it('stores the login provider and id_token on the session after login', () => {
      mockAuthenticate({ user, info: { idToken: 'the-id-token' } });
      const request = buildRequest({});
      request.query = { state: JSON.stringify({ redirect: '/teams' }) };

      // Route params arrive as strings at runtime despite the number annotation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      controller.oidcLoginCallback('3' as any, request, response);

      expect(request.logIn).toHaveBeenCalledWith(user, expect.any(Function));
      expect(request.session.oidcId).toBe(3);
      expect(request.session.oidcIssuer).toBe('https://idp.example/realms/3');
      expect(request.session.idToken).toBe('the-id-token');
      expect(request.session.save).toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith('http://frontend/teams');
    });

    it('redirects to the mapped error message when authentication fails', () => {
      mockAuthenticate({ error: new Error(USER_NOT_FOUND) });
      const request = buildRequest({});
      request.query = {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      controller.oidcLoginCallback('3' as any, request, response);

      expect(request.logIn).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://frontend/unauthenticated?msg='),
      );
    });

    it('redirects to the unauthenticated page when the IdP reports no user', () => {
      mockAuthenticate({ user: false });
      const request = buildRequest({});
      request.query = {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      controller.oidcLoginCallback('3' as any, request, response);

      expect(request.logIn).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith('http://frontend/unauthenticated');
    });

    const errorBranches = [
      { name: 'NO_ROLE', message: NO_ROLE, fragment: 'quite complete' },
      {
        name: 'missing authorization request details',
        message: 'did not find expected authorization request details in session',
        fragment: 'There may be an issue',
      },
      {
        name: 'invalid_grant',
        message: 'invalid_grant (Code not valid)',
        fragment: 'hiccup during login',
      },
      {
        name: 'database connection error',
        message: 'Database connection error during authentication',
        fragment: 'temporarily unavailable',
      },
      { name: 'an unmapped error', message: 'something unexpected', fragment: 'was not successful' },
    ];

    it.each(errorBranches)(
      'redirects with the mapped message for $name',
      ({ message, fragment }) => {
        mockAuthenticate({ error: new Error(message) });
        const request = buildRequest({});
        request.query = {};

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controller.oidcLoginCallback('3' as any, request, response);

        expect(request.logIn).not.toHaveBeenCalled();
        expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining(fragment));
      }
    );

    it('redirects with the mapped message when request.logIn fails', () => {
      mockAuthenticate({ user });
      const request = buildRequest({});
      request.query = {};
      (request.logIn as jest.Mock).mockImplementation(
        (_user: unknown, callback: (err?: Error) => void) =>
          callback(new Error('session regeneration failed'))
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      controller.oidcLoginCallback('3' as any, request, response);

      expect(request.session.save).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('was not successful'));
    });

    it('fails the login instead of redirecting as success when the session cannot be saved', () => {
      mockAuthenticate({ user, info: { idToken: 'the-id-token' } });
      const request = buildRequest({});
      request.query = { state: JSON.stringify({ redirect: '/teams' }) };
      (request.session.save as jest.Mock).mockImplementation((callback: (err?: Error) => void) =>
        callback(new Error('session store unavailable'))
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      controller.oidcLoginCallback('3' as any, request, response);

      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/unauthenticated?msg=')
      );
      expect(response.redirect).not.toHaveBeenCalledWith('http://frontend/teams');
    });
  });

  describe('audit events', () => {
    const user = { id: 7, username: 'jane@example.org' };
    const mockAuthenticate = (error: Error | null, authUser: unknown, info?: unknown) => {
      jest
        .spyOn(passport, 'authenticate')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((_name: any, callback: any) => () => {
          callback(error, authUser, info);
        });
    };
    const callback = (request: Request) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      controller.oidcLoginCallback('3' as any, request, response);
    const callbackRequest = () => {
      const request = buildRequest({});
      request.query = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).ip = '10.0.0.5';
      return request;
    };

    it('records LoginSuccess with username, ip and oidcIssuer', () => {
      mockAuthenticate(null, user, { idToken: 'secret-id-token' });

      callback(callbackRequest());

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LoginSuccess',
          actorUsername: 'jane@example.org',
          actorType: 'user',
          sourceIpAddress: '10.0.0.5',
          oidcIssuer: 'https://idp.example/realms/3',
        })
      );
      expect(JSON.stringify(record.mock.calls)).not.toContain('secret-id-token');
    });

    it.each([
      ['an unexpected error', new Error('boom secret-token'), 'error'],
      ['USER_NOT_FOUND', new Error(USER_NOT_FOUND), 'user-not-found'],
      ['NO_ROLE', new Error(NO_ROLE), 'no-role'],
    ])('records LoginFailure with a reason code for %s', (_name, error, reason) => {
      mockAuthenticate(error, false);

      callback(callbackRequest());

      expect(record).toHaveBeenCalledTimes(1);
      const event = record.mock.calls[0][0];
      expect(event).toEqual(
        expect.objectContaining({
          eventType: 'LoginFailure',
          details: reason,
          sourceIpAddress: '10.0.0.5',
          oidcIssuer: 'https://idp.example/realms/3',
        })
      );
      expect(JSON.stringify(event)).not.toContain('secret-token');
    });

    it.each([
      ['USER_NOT_FOUND', USER_NOT_FOUND, 'user-not-found'],
      ['NO_ROLE', NO_ROLE, 'no-role'],
    ])('records the claimed username on a %s failure', (_name, message, reason) => {
      mockAuthenticate(Object.assign(new Error(message), { username: 'claim@example.org' }), false);

      callback(callbackRequest());

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LoginFailure',
          actorUsername: 'claim@example.org',
          details: reason,
        })
      );
      const redirectUrl = (response.redirect as jest.Mock).mock.calls[0][0];
      expect(redirectUrl).not.toContain('claim@example.org');
    });

    it('records LoginFailure when the IdP reports no user', () => {
      mockAuthenticate(null, false);

      callback(callbackRequest());

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'LoginFailure', details: 'error' })
      );
    });

    it('records only LoginFailure when the session cannot be saved', () => {
      mockAuthenticate(null, user, { idToken: 'secret-id-token' });
      const request = callbackRequest();
      (request.session.save as jest.Mock).mockImplementation((cb: (err?: Error) => void) =>
        cb(new Error('store down'))
      );

      callback(request);

      expect(record.mock.calls.map(([e]) => e.eventType)).toEqual(['LoginFailure']);
      expect(record.mock.calls[0][0].actorUsername).toBe(user.username);
    });

    it('records Logout with the username captured before the session is destroyed', async () => {
      const request = buildRequest({
        oidcId: 3,
        oidcIssuer: 'https://idp.example/realms/3',
        idToken: 'secret-id-token',
        id: 'sess-123',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).user = user;
      let callsAtDestroy = -1;
      (request.session.destroy as jest.Mock).mockImplementation((cb: (err?: Error) => void) => {
        callsAtDestroy = record.mock.calls.length;
        cb();
      });

      await controller.logout(request, response);

      // The event must already be recorded when the session is destroyed
      expect(callsAtDestroy).toBe(1);
      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'Logout',
          actorUsername: 'jane@example.org',
          actorType: 'user',
          oidcIssuer: 'https://idp.example/realms/3',
        })
      );
      const serialized = JSON.stringify(record.mock.calls);
      expect(serialized).not.toContain('secret-id-token');
      expect(serialized).not.toContain('sess-123');
    });

    it('records Logout with a null actor for an anonymous logout', async () => {
      await controller.logout(buildRequest({}), response);

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'Logout', actorUsername: null, actorType: null })
      );
    });

    it('stores an oversized username with newlines capped and clean via the real recorder', async () => {
      const queue = new AuditEventQueue(10);
      const realController = new AuthController(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { getEndSessionUrl, getSoleOidcId, getIssuer } as any,
        new AuditEventRecorder(queue, true)
      );
      const request = buildRequest({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).user = { username: `a\n${'x'.repeat(10000)}` };

      await realController.logout(request, response);

      const [event] = queue.drain(10);
      expect(event.actorUsername?.length).toBeLessThanOrEqual(256);
      expect(event.actorUsername).not.toMatch(/[\n\r]/);
    });

    it('stores an oversized claimed username on a failed login capped and clean', () => {
      const queue = new AuditEventQueue(10);
      const realController = new AuthController(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { getEndSessionUrl, getSoleOidcId, getIssuer } as any,
        new AuditEventRecorder(queue, true)
      );
      mockAuthenticate(
        Object.assign(new Error(USER_NOT_FOUND), { username: `a\n${'x'.repeat(10000)}` }),
        false
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realController.oidcLoginCallback('3' as any, callbackRequest(), response);

      const [event] = queue.drain(10);
      expect(event.eventType).toBe('LoginFailure');
      expect(event.actorUsername?.length).toBeGreaterThan(0);
      expect(event.actorUsername?.length).toBeLessThanOrEqual(256);
      expect(event.actorUsername).not.toMatch(/[\n\r]/);
    });
  });
});
