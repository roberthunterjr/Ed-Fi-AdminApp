import type * as express from 'express';
import * as client from 'openid-client';

export type OidcTokenset = client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;

export type OidcVerifyCallback = (err: Error | null, user?: unknown, info?: unknown) => void;

export type OidcVerify = (tokenset: OidcTokenset, done: OidcVerifyCallback) => Promise<void> | void;

export interface AdminAppOidcStrategyOptions {
  config: client.Configuration;
  callbackURL: string;
  scope: string;
  /** Send an S256 PKCE challenge on the authorization request and verify it on exchange. */
  usePKCE: boolean;
  /** Where the per-login state (verifier, state) lives on the express session. */
  sessionKey: string;
}

interface OidcSessionState {
  state: string;
  code_verifier?: string;
}

/** Methods passport attaches to the per-request strategy instance. */
interface PassportCallbacks {
  success(user: unknown, info?: unknown): void;
  fail(challenge?: unknown): void;
  redirect(url: string): void;
  error(err: Error): void;
}

/**
 * Passport strategy for the OIDC authorization code flow, built on the
 * openid-client v6 core functions.
 *
 * The strategy shipped in `openid-client/passport` always uses PKCE and drops
 * the `info` argument of `done(null, user, info)`. This one keeps the
 * `USE_PKCE` setting working (including `false`, for IdPs that reject PKCE
 * parameters) and hands `info` to passport so the login callback can read the
 * id_token.
 */
export class AdminAppOidcStrategy {
  readonly name: string;

  constructor(
    private readonly options: AdminAppOidcStrategyOptions,
    private readonly _verify: OidcVerify,
    name: string
  ) {
    this.name = name;
  }

  authenticate(req: express.Request, authOptions?: { state?: string }): void {
    // passport invokes this on a per-request clone that carries the callbacks
    const callbacks = this as unknown as PassportCallbacks;
    if (!req.session) {
      return callbacks.error(
        new Error('OIDC authentication requires session support. Did you forget express-session?')
      );
    }

    const query = new URL(req.originalUrl ?? req.url, 'http://localhost').searchParams;
    const isCallback = req.method !== 'GET' || query.has('code') || query.has('error');
    const run = isCallback
      ? this.authorizationCodeGrant(req, query)
      : this.authorizationRequest(req, authOptions);
    run.catch((err) => callbacks.error(err instanceof Error ? err : new Error(String(err))));
  }

  private async authorizationRequest(
    req: express.Request,
    authOptions?: { state?: string }
  ): Promise<void> {
    const callbacks = this as unknown as PassportCallbacks;
    const { config, callbackURL, scope, usePKCE, sessionKey } = this.options;

    const state =
      typeof authOptions?.state === 'string' && authOptions.state !== ''
        ? authOptions.state
        : client.randomState();
    const params = new URLSearchParams({ redirect_uri: callbackURL, scope, state });
    const sessionState: OidcSessionState = { state };

    if (usePKCE) {
      sessionState.code_verifier = client.randomPKCECodeVerifier();
      params.set(
        'code_challenge',
        await client.calculatePKCECodeChallenge(sessionState.code_verifier)
      );
      params.set('code_challenge_method', 'S256');
    }

    (req.session as unknown as Record<string, unknown>)[sessionKey] = sessionState;
    callbacks.redirect(client.buildAuthorizationUrl(config, params).href);
  }

  private async authorizationCodeGrant(
    req: express.Request,
    query: URLSearchParams
  ): Promise<void> {
    const callbacks = this as unknown as PassportCallbacks;
    const { config, callbackURL, usePKCE, sessionKey } = this.options;

    const session = req.session as unknown as Record<string, OidcSessionState | undefined>;
    const sessionState = session[sessionKey];
    delete session[sessionKey];
    if (!sessionState?.state || (usePKCE && !sessionState.code_verifier)) {
      return callbacks.fail({ message: 'Unable to verify authorization request state' });
    }

    const currentUrl = new URL(callbackURL);
    for (const [key, value] of query.entries()) {
      currentUrl.searchParams.append(key, value);
    }

    let tokenset: OidcTokenset;
    try {
      tokenset = await client.authorizationCodeGrant(config, currentUrl, {
        expectedState: sessionState.state,
        ...(usePKCE ? { pkceCodeVerifier: sessionState.code_verifier } : {}),
      });
    } catch (err) {
      if (err instanceof client.AuthorizationResponseError && err.error === 'access_denied') {
        return callbacks.fail({ message: err.error_description || err.error });
      }
      throw err;
    }

    await this._verify(tokenset, (err, user, info) => {
      if (err) {
        return callbacks.error(err);
      }
      if (!user) {
        return callbacks.fail(info);
      }
      return callbacks.success(user, info);
    });
  }
}
