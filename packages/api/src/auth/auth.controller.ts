import {
  AuthorizationCache,
  GetSessionDataDto,
  PrivilegeCode,
  isBaseTeamPrivilege,
  isGlobalPrivilege,
  isCachedByEdfiTenant,
  toGetSessionDataDto,
  toGetTeamDto,
  isCachedBySbEnvironment,
} from '@edanalytics/models';
import { Team, User } from '@edanalytics/models-server';
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Request as Req, // TODO: can Req just be used here?
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import config from 'config';
import { randomUUID } from 'crypto';
import type { Response, Request } from 'express';
import passport from 'passport';
import { Repository } from 'typeorm';
import { AuditEvent, AuditEventType } from '../audit/audit-event';
import { AuditEventRecorder } from '../audit/audit-event.recorder';
import { resolveActor } from '../audit/audit-actor.resolver';
import { setAuditOidcIssuer } from '../audit/audit-request-context';
import { Authorize, NoAuthorization } from './authorization';
import { Public } from './authorization/public.decorator';
import { AuthCache } from './helpers/inject-auth-cache';
import { ReqUser } from './helpers/user.decorator';
import { NO_ROLE, OidcLoginInfo, USER_NOT_FOUND } from './login/oidc.strategy';
import { OidcProviderRegistry } from './login/oidc-provider.registry';
import { AuthService } from './auth.service';

export const LOCAL_ONLY_LOGOUT_MESSAGE =
  "You've been signed out of Admin App. You may still be signed in through your organization's sign-in provider. To fully sign out, also sign out of that account.";

export const SIGNED_OUT_MESSAGE = "You've been signed out of Admin App.";

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(Team)
    private readonly teamsRepository: Repository<Team>,
    private readonly authService: AuthService,
    private readonly oidcProviderRegistry: OidcProviderRegistry,
    private readonly auditEventRecorder: AuditEventRecorder,
  ) {}

  throwOnBearerToken({ request, route }: { request: Request; route: string }) {
    const [type] = request.headers['authorization']?.split(' ') ?? [];
    if (type === 'Bearer') {
      throw new BadRequestException(`Bearer token authentication is not supported for ${route}.`);
    }
  }

  @Public()
  @Get('/login/:oidcId')
  oidcLogin(@Param('oidcId') oidcId: number, @Req() request: Request, @Res() response: Response) {
    this.throwOnBearerToken({ request, route: 'oidc login' });

    // Validate and whitelist redirect URL
    const requestedRedirect = request.query?.redirect as string;
    const safeRedirect = this.validateRedirectUrl(requestedRedirect);
    Logger.log(`Using safe redirect URL: ${safeRedirect}`);
    passport.authenticate(`oidc-${oidcId}`, {
      state: JSON.stringify({
        redirect: safeRedirect,
        random: randomUUID(),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })(request, response, (error: any) => {
      Logger.error(error);
      if (error?.message.includes('Unknown authentication strategy')) {
        throw new NotFoundException();
      } else {
        throw new InternalServerErrorException();
      }
    });
  }

  @Public()
  @Get('/callback/:oidcId')
  oidcLoginCallback(
    @Param('oidcId') oidcId: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.throwOnBearerToken({ request, route: 'oidc callback' });

    let redirect = '/';
    try {
      const state = JSON.parse(request.query.state as string);
      // Validate redirect URL again in callback for extra security
      redirect = this.validateRedirectUrl(state.redirect);
    } catch (_error) {
      // Use default redirect
    }
    passport.authenticate(
      `oidc-${oidcId}`,
      (error: Error | null, user: User | false, info?: OidcLoginInfo) => {
        if (error) {
          return this.redirectLoginFailure(error, request, response, oidcId);
        }
        if (!user) {
          this.recordLoginEvent(AuditEventType.LoginFailure, request, this.issuerOf(oidcId), {
            details: 'error',
          });
          return response.redirect(`${config.FE_URL}/unauthenticated`);
        }
        request.logIn(user, (loginError: Error | null) => {
          if (loginError) {
            return this.redirectLoginFailure(loginError, request, response, oidcId, user.username);
          }
          // Track which provider the user authenticated with, and keep the
          // id_token for use as id_token_hint during RP-Initiated Logout.
          // Must happen after logIn, which regenerates the session.
          request.session.oidcId = Number(oidcId);
          // The issuer, unlike the numeric id, still identifies the provider in the audit log after its row is deleted
          request.session.oidcIssuer = this.issuerOf(oidcId) ?? undefined;
          request.session.idToken = info?.idToken;
          request.session.save((saveError: Error | null) => {
            if (saveError) {
              // The provider/id_token failed to persist: a later logout could
              // not do a provider-aware IdP logout. Fail the login instead of
              // redirecting as if it succeeded.
              Logger.error(
                `Failed to persist session after login for provider ${oidcId}: ${saveError}`,
              );
              return this.redirectLoginFailure(
                saveError,
                request,
                response,
                oidcId,
                user.username,
              );
            }
            this.recordLoginEvent(AuditEventType.LoginSuccess, request, this.issuerOf(oidcId), {
              actorUsername: user.username,
              actorType: 'user',
            });
            return response.redirect(`${config.FE_URL}${redirect}`);
          });
        });
      },
    )(request, response, (error: Error) =>
      this.redirectLoginFailure(error, request, response, oidcId),
    );
  }

  private issuerOf(oidcId: number | string | undefined | null): string | null {
    return this.oidcProviderRegistry.getIssuer(oidcId);
  }

  private recordLoginEvent(
    eventType: AuditEventType,
    request: Request,
    oidcIssuer: string | null | undefined,
    extra: Pick<AuditEvent, 'actorUsername' | 'actorType' | 'details'> = {},
  ) {
    this.auditEventRecorder.record({
      eventType,
      timestamp: new Date(),
      sourceIpAddress: request.ip,
      oidcIssuer: oidcIssuer ?? null,
      ...extra,
    });
  }

  private redirectLoginFailure(
    error: Error,
    request: Request,
    response: Response,
    oidcId: number | string,
    knownUsername?: string,
  ) {
    Logger.error(error);
    // Only a short reason code is audited, never the raw error message
    const reason =
      error.message === USER_NOT_FOUND
        ? 'user-not-found'
        : error.message === NO_ROLE
          ? 'no-role'
          : 'error';
    this.recordLoginEvent(AuditEventType.LoginFailure, request, this.issuerOf(oidcId), {
      // The unverified claim, attached to the error by the strategy; never surfaced to the browser
      actorUsername: knownUsername ?? (error as { username?: string }).username ?? null,
      details: reason,
    });

    if (error.message === USER_NOT_FOUND) {
      response.redirect(
        `${config.FE_URL}/unauthenticated?msg=Oops, it looks like your user hasn't been created yet. We'll let you know when you can log in.`,
      );
    } else if (error.message === NO_ROLE) {
      response.redirect(
        `${config.FE_URL}/unauthenticated?msg=Your login worked, but it looks like your setup isn't quite complete. We'll let you know when everything's ready.`,
      );
    } else if (
      error.message?.startsWith('did not find expected authorization request details in session')
    ) {
      response.redirect(
        `${config.FE_URL}/unauthenticated?msg=Login failed. There may be an issue, but please try again.`,
      );
    } else if (error.message?.startsWith('invalid_grant (Code not valid)')) {
      response.redirect(
        `${config.FE_URL}/unauthenticated?msg=It looks like there was a hiccup during login. Please try again.`,
      );
    } else if (error.message?.includes('Database connection error')) {
      response.redirect(
        `${config.FE_URL}/unauthenticated?msg=The system is temporarily unavailable. Please try again in a few moments.`,
      );
    } else {
      response.redirect(
        `${config.FE_URL}/unauthenticated?msg=It looks like your login was not successful. Please try again and contact us if the issue persists.`,
      );
    }
  }

  @Get('me')
  @NoAuthorization()
  @Header('Cache-Control', 'no-store')
  async me(@ReqUser() session: GetSessionDataDto) {
    const userId = session?.id;

    try {
      // Validate user still exists and is active (this is the "deserialization" logic)
      const user = await this.authService.findActiveUserById(userId);

      if (!user || !user.isActive || !user.role) {
        throw new HttpException('User no longer valid', HttpStatus.UNAUTHORIZED);
      }
      return toGetSessionDataDto(session);
    } catch (error) {
      Logger.error(`Error validating user ${session}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Authentication failed', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('my-teams')
  @NoAuthorization()
  @Header('Cache-Control', 'no-store')
  async myTeams(
    @ReqUser() session: GetSessionDataDto,
    @AuthCache() privileges: AuthorizationCache,
  ) {
    if (privileges['team:read'] === true) {
      return toGetTeamDto(await this.teamsRepository.find());
    } else {
      return toGetTeamDto(session?.userTeamMemberships?.map((utm) => utm.team) ?? []);
    }
  }

  @Get('cache')
  @Authorize({
    privilege: 'me:read',
    subject: {
      id: '__filtered__',
    },
  })
  async getCacheAll(
    @Query('edfiTenantId') edfiTenantId: string | undefined,
    @Query('sbEnvironmentId') sbEnvironmentId: string | undefined,
    @AuthCache() cache: AuthorizationCache,
  ) {
    return this.privilegeCache(undefined, edfiTenantId, sbEnvironmentId, cache);
  }

  @Get('cache/:teamId')
  @Authorize({
    privilege: 'me:read',
    subject: {
      id: '__filtered__',
    },
  })
  async privilegeCache(
    @Param('teamId') teamId: string,
    @Query('edfiTenantId') edfiTenantId: string | undefined,
    @Query('sbEnvironmentId') sbEnvironmentId: string | undefined,
    @AuthCache() cache: AuthorizationCache,
  ) {
    return this.handleCache(teamId, cache, sbEnvironmentId, edfiTenantId);
  }

  private handleCache(
    teamId: string,
    cache: AuthorizationCache,
    sbEnvironmentId: string,
    edfiTenantId: string,
  ) {
    const result: Partial<AuthorizationCache> = {};
    if (teamId === undefined) {
      Object.keys(cache).forEach((privilege: PrivilegeCode) => {
        if (isGlobalPrivilege(privilege)) {
          result[privilege] = cache[privilege];
        }
      });
    }
    if (teamId !== undefined && sbEnvironmentId === undefined && edfiTenantId === undefined) {
      Object.keys(cache).forEach((privilege: PrivilegeCode) => {
        if (isBaseTeamPrivilege(privilege)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result[privilege] = cache[privilege] as any;
        }
      });
    }
    if (teamId !== undefined && sbEnvironmentId !== undefined && edfiTenantId === undefined) {
      Object.keys(cache).forEach((privilege: PrivilegeCode) => {
        if (isCachedBySbEnvironment(privilege) && sbEnvironmentId in cache[privilege]) {
          result[privilege] = cache[privilege][sbEnvironmentId];
        }
      });
    }
    if (teamId !== undefined && sbEnvironmentId === undefined && edfiTenantId !== undefined) {
      Object.keys(cache).forEach((privilege: PrivilegeCode) => {
        if (isCachedByEdfiTenant(privilege) && edfiTenantId in cache[privilege]) {
          result[privilege] = cache[privilege][edfiTenantId];
        }
      });
    }
    return result;
  }

  @Get('/post-logout')
  @Public()
  async postLogout(@Res() response: Response) {
    return response.redirect(config.FE_URL);
  }

  @Post('/logout')
  @Public()
  async logout(@Req() request: Request, @Res() response: Response) {
    this.throwOnBearerToken({ request, route: 'logout' });

    // Read the login provider before destroying the session
    const { oidcId, oidcIssuer, idToken } = request.session;
    // The Action row is written after the response, when the session no longer exists
    setAuditOidcIssuer(request, oidcIssuer);
    // Record before the session (and request.user) is destroyed. An anonymous
    // logout is still recorded, with a null actor, so the attempt is visible.
    const actor = resolveActor(request);
    this.recordLoginEvent(AuditEventType.Logout, request, oidcIssuer, {
      actorUsername: actor?.username ?? null,
      actorType: actor?.type ?? null,
    });

    try {
      // Destroy the local session first
      await new Promise<void>((resolve, reject) => {
        request.session.destroy((err) => {
          if (err) {
            Logger.error('Error destroying session:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Sessions created before provider tracking carry no oidcId; fall back
      // to the only registered provider when unambiguous
      const loginOidcId = oidcId ?? this.oidcProviderRegistry.getSoleOidcId();

      if (loginOidcId === undefined) {
        Logger.warn('No login provider tracked on session, skipping IdP logout');
        // Still confirm the local sign-out instead of dropping the user on the
        // app root with no explanation that their session ended.
        return response.redirect(
          `${config.FE_URL}/unauthenticated?msg=${encodeURIComponent(SIGNED_OUT_MESSAGE)}`,
        );
      }

      const endSessionUrl = this.oidcProviderRegistry.getEndSessionUrl(loginOidcId, idToken);

      if (endSessionUrl) {
        // Full RP-Initiated Logout against the provider the user logged in with
        return response.redirect(endSessionUrl);
      }

      // The provider does not support RP-Initiated Logout (no end_session_endpoint,
      // e.g. Google): local session is destroyed but the IdP session persists
      return response.redirect(
        `${config.FE_URL}/unauthenticated?msg=${encodeURIComponent(LOCAL_ONLY_LOGOUT_MESSAGE)}`,
      );
    } catch (error) {
      Logger.error('Error during logout process:', error);
      // Even if there's an error, still redirect to base URL
      return response.redirect(config.FE_URL);
    }
  }

  private validateRedirectUrl(redirect: string): string {
    // Default safe redirect
    const defaultRedirect = '/';

    if (!redirect || typeof redirect !== 'string') {
      return defaultRedirect;
    }

    // Allow only relative URLs that start with '/'
    if (redirect.startsWith('/') && !redirect.startsWith('//')) {
      // Additional validation to prevent protocol-relative URLs and malicious paths
      if (redirect.match(/^\/[a-zA-Z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/) && !/[<>]/.test(redirect)) {
        return redirect;
      }
    }

    // Allow whitelisted absolute URLs (frontend URL from config)
    const allowedHosts = config.WHITELISTED_REDIRECTS || [];

    try {
      const url = new URL(redirect);
      const baseUrl = `${url.protocol}//${url.host}`;

      if (allowedHosts.includes(baseUrl)) {
        return redirect;
      }
    } catch (_error) {
      // Invalid URL format
    }

    // Return default redirect for any invalid or non-whitelisted URLs
    return defaultRedirect;
  }
}
