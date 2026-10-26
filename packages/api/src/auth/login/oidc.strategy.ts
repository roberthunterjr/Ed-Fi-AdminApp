import { Oidc, User } from '@edanalytics/models-server';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import config from 'config';
import * as client from 'openid-client';
import passport from 'passport';
import { Repository } from 'typeorm';
import { AuthService } from '../auth.service';
import { OidcProviderRegistry } from './oidc-provider.registry';
import { AdminAppOidcStrategy, OidcTokenset } from './oidc-passport.strategy';

export interface OidcLoginInfo {
  idToken?: string;
}

const DEFAULT_OIDC_DISCOVERY_TIMEOUT_MS = 10000;

/**
 * USE_PKCE arrives as the string "false" when set through an env var, which
 * is truthy. PKCE stays on unless it is explicitly disabled.
 */
const usePkceEnabled = (value: unknown): boolean => value !== false && value !== 'false';

/**
 * openid-client v5 requested the `openid` scope by default; v6 sends exactly
 * what it is given. Without `openid` the IdP's userinfo endpoint rejects the
 * access token (e.g. Keycloak: "Missing openid scope"), so always include it.
 */
const withOpenIdScope = (scope: string | null | undefined): string => {
  const scopes = (scope ?? '').split(/\s+/).filter(Boolean);
  return scopes.includes('openid') ? scopes.join(' ') : ['openid', ...scopes].join(' ');
};

/**
 * Picks the confidential-client authentication method from the discovered
 * metadata. client_secret_post is preferred whenever the IdP advertises it:
 * oauth4webapi's client_secret_basic encoder percent-encodes the client id and
 * secret more aggressively than standard form encoding (it also escapes `-`,
 * `_` and `.`), and IdPs such as Google and Microsoft Entra ID do not decode
 * the result, so they reject the client ("The OAuth client was not found").
 * Basic is used only when Post is unavailable. An absent list means
 * client_secret_basic per the OIDC spec. When the IdP lists methods but neither
 * Post nor Basic, Post is used as the openid-client v6 default.
 */
const withClientAuthentication = (
  discovered: client.Configuration,
  clientId: string,
  clientSecret: string
): client.Configuration => {
  const server = discovered.serverMetadata();
  const methods = server.token_endpoint_auth_methods_supported;
  const usePost = methods
    ? methods.includes('client_secret_post') || !methods.includes('client_secret_basic')
    : false;
  return new client.Configuration(
    server,
    clientId,
    { client_secret: clientSecret },
    usePost ? client.ClientSecretPost(clientSecret) : client.ClientSecretBasic(clientSecret)
  );
};

/**
 * Discovers and registers the configured OIDC providers at startup: it loads
 * the provider rows, runs discovery (bounded by a timeout), wires each one into
 * Passport, and populates the OidcProviderRegistry the rest of the app queries.
 */
@Injectable()
export class OidcIdpBootstrapper implements OnModuleInit {
  constructor(
    @InjectRepository(Oidc)
    private readonly oidcRepo: Repository<Oidc>,
    @Inject(AuthService)
    private readonly authService: AuthService,
    private readonly registry: OidcProviderRegistry
  ) {}

  async onModuleInit(): Promise<void> {
    let oidcConfigs: Oidc[];
    try {
      oidcConfigs = await this.oidcRepo.find();
    } catch (err) {
      Logger.error(`Error loading OIDC provider configurations: ${err}`);
      return;
    }
    this.registry.setConfiguredProviderCount(oidcConfigs.length);
    this.registry.clearFailures();
    await Promise.all(
      oidcConfigs.map((oidcConfig) =>
        this.registerIdp(oidcConfig).catch((err) => {
          this.registry.markFailed(oidcConfig.id);
          Logger.error(`Unexpected error registering OIDC provider ${oidcConfig.issuer}: ${err}`);
        })
      )
    );

    const failedIds = this.registry.getFailedProviderIds();
    if (failedIds.length > 0) {
      Logger.warn(
        `OIDC provider registration incomplete: ${failedIds.length} of ${this.registry.configuredProviderTotal} configured provider(s) failed to register (ids: ${failedIds.join(', ')}). Logout for sessions on those providers will be local-only.`
      );
    }
  }

  /**
   * Runs OIDC discovery with a bounded timeout so a slow or unresponsive
   * provider cannot stall application bootstrap. Rejects when the provider does
   * not answer within the configured budget.
   */
  private async discoverWithTimeout(oidcConfig: Oidc, timeoutMs: number): Promise<client.Configuration> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`OIDC discovery timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });
    try {
      const discovered = await Promise.race([
        client.discovery(new URL(oidcConfig.issuer), oidcConfig.clientId),
        timeout,
      ]);
      return oidcConfig.clientSecret
        ? withClientAuthentication(discovered, oidcConfig.clientId, oidcConfig.clientSecret)
        : discovered;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async registerIdp(oidcConfig: Oidc): Promise<void> {
    let oidcClient: client.Configuration;
    try {
      const timeoutMs = config.OIDC_DISCOVERY_TIMEOUT_MS ?? DEFAULT_OIDC_DISCOVERY_TIMEOUT_MS;
      oidcClient = await this.discoverWithTimeout(oidcConfig, timeoutMs);
    } catch (err) {
      this.registry.markFailed(oidcConfig.id);
      Logger.error(`Error registering OIDC provider ${oidcConfig.issuer}: ${err}`);
      return;
    }

    const strategy = new AdminAppOidcStrategy(
      {
        config: oidcClient,
        callbackURL: `${config.MY_URL_API_PATH}/auth/callback/${oidcConfig.id}`,
        scope: withOpenIdScope(oidcConfig.scope),
        usePKCE: usePkceEnabled(config.USE_PKCE),
        sessionKey: `oidc:${oidcConfig.id}`,
      },
      async (
        tokenset: OidcTokenset,
        done: (err: Error | null, user?: User | false, info?: OidcLoginInfo) => void
      ) => {
        if (typeof tokenset.access_token !== 'string' || tokenset.access_token === '') {
          throw new Error('Missing access token from IdP');
        }
        const userinfo = await client.fetchUserInfo(
          oidcClient,
          tokenset.access_token,
          tokenset.claims()?.sub ?? client.skipSubjectCheck
        );

        let username: string;
        if (typeof userinfo.email !== 'string' || userinfo.email === '') {
          throw new Error('Invalid email from IdP');
        } else {
          username = userinfo.email;
        }

        try {
          const user: User = await this.authService.validateUser({ username });
          const emailDomain = username.substring(username.lastIndexOf('@') + 1).toLowerCase();
          const isEaUser = emailDomain === 'edanalytics.org';
          if (user === null) {
            if (!isEaUser) {
              Logger.warn(`LOGIN_ERROR User [${username}] not found in database`);
            }
            return done(Object.assign(new Error(USER_NOT_FOUND), { username }), false);
          } else if (user.roleId === null || user.roleId === undefined) {
            if (!isEaUser) {
              Logger.warn(`LOGIN_ERROR No role assigned for User [${username}]`);
            }
            return done(Object.assign(new Error(NO_ROLE), { username }), false);
          } else {
            if (!user.userTeamMemberships || user.userTeamMemberships.length === 0) {
              if (!isEaUser) {
                Logger.warn(`LOGIN_ERROR No team memberships assigned for User [${username}]`);
              }
            }
            // Pass the id_token along so the login callback can store it on the
            // session for use as id_token_hint during RP-Initiated Logout
            return done(null, user, {
              idToken: typeof tokenset.id_token === 'string' ? tokenset.id_token : undefined,
            });
          }
        } catch (err) {
          Logger.error(`Database error during authentication for user [${username}]:`, err);
          // Return a database error to trigger appropriate error handling
          return done(new Error('Database connection error during authentication'), false);
        }
      },
      `oidc-${oidcConfig.id}`
    );
    Logger.log(`Registering OIDC provider ${oidcConfig.issuer} with id ${oidcConfig.id}`);
    this.registry.register(oidcConfig.id, oidcClient);
    passport.use(`oidc-${oidcConfig.id}`, strategy);
  }
}

export const USER_NOT_FOUND = 'User not found';
export const NO_ROLE = 'No role assigned for user';
export const NO_TEAM_MEMBERSHIPS = 'No team memberships assigned';
