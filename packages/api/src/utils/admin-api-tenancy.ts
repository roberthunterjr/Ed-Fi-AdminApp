import { Logger } from '@nestjs/common';
import axios from 'axios';
import config from 'config';
import { ValidationHttpException } from './customExceptions';

const logger = new Logger('admin-api-tenancy');

/**
 * The `urls` block on Admin API's Information response (`GET /`).
 * `tenancy` is an empty string for V1, which has no tenancy endpoint.
 */
export interface AdminApiUrls {
  openApiMetadata?: string;
  tenancy?: string;
}

export interface AdminApiInfoWithUrls {
  specificationVersion?: string;
  urls?: AdminApiUrls;
}

/**
 * MISCONFIGURED: Admin API answered 503 with a parsable body — `MultiTenancy`
 * is on with no tenants configured. Its message names the appsettings fix and
 * is safe to show the operator verbatim.
 *
 * UNAVAILABLE: the tenant list could not be determined for any other reason.
 * Blocks identically, but the response text is logged rather than displayed.
 */
export type TenancyFailureKind = 'MISCONFIGURED' | 'UNAVAILABLE';

export class AdminApiTenancyError extends Error {
  readonly kind: TenancyFailureKind;
  /** Admin API's own message. Only ever populated for MISCONFIGURED. */
  readonly detail?: string;

  constructor(kind: TenancyFailureKind, message: string, detail?: string) {
    super(message);
    this.name = 'AdminApiTenancyError';
    this.kind = kind;
    this.detail = detail;
  }
}

export type TenancyResult =
  | { supported: false }
  | { supported: true; tenants: string[]; mode: 'MultiTenant' | 'SingleTenant' };

interface TenancyEndpointResponse {
  tenants?: string[];
}

/**
 * Reads Admin API's 503 body, which differs by specification version:
 * V3 returns problem details (`detail`), V2 returns `{ message }`.
 * Returns undefined when the body is not a parsable JSON object — a bare 503
 * from a reverse proxy or a stopped container, which is not the
 * misconfiguration case.
 */
const parseErrorDetail = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const { detail, message } = data as { detail?: unknown; message?: unknown };
  if (typeof detail === 'string' && detail.length > 0) {
    return detail;
  }
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  return undefined;
};

/** True when both URLs share scheme and host (and port, if given). Unparsable URLs never match. */
const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

/**
 * Fetches the tenant list from Admin API's tenancy endpoint.
 *
 * The endpoint address comes from `urls.tenancy` on the Information response
 * rather than being constructed from the specification version, so host and
 * prefix differences the client cannot infer are handled by Admin API itself.
 * `urls.tenancy` is server-supplied and this call is anonymous, so — to avoid
 * a compromised or MITM'd Admin API redirecting an outbound request wherever
 * it likes (SSRF) — the tenancy URL's origin is required to match the
 * originally-configured `adminApiUrl`, and the request never follows
 * redirects.
 *
 * Tenant mode is derived from the array: non-empty means MultiTenant, empty
 * means SingleTenant. That derivation is only safe because Admin API answers
 * 503 when `MultiTenancy` is on with no tenants configured, so an empty array
 * from a *successful* call cannot mean "misconfigured".
 *
 * No error is ever reported as single-tenant — a failure throws.
 */
export const fetchAdminApiTenancy = async (
  adminApiInfo: AdminApiInfoWithUrls,
  adminApiUrl?: string
): Promise<TenancyResult> => {
  const tenancyUrl = adminApiInfo?.urls?.tenancy;

  if (!tenancyUrl) {
    logger.log('Admin API does not advertise a tenancy endpoint; tenancy lookup skipped');
    return { supported: false };
  }

  if (adminApiUrl && !sameOrigin(tenancyUrl, adminApiUrl)) {
    logger.warn(
      `Refusing to call tenancy endpoint ${tenancyUrl}: its origin does not match the configured Admin API URL ${adminApiUrl}`
    );
    throw new AdminApiTenancyError(
      'UNAVAILABLE',
      'Could not determine tenancy for this Management API.'
    );
  }

  let data: TenancyEndpointResponse;
  try {
    const response = await axios.get<TenancyEndpointResponse>(tenancyUrl, {
      headers: { Accept: 'application/json' },
      timeout: config.EDFI_URLS_TIMEOUT_MS,
      maxRedirects: 0,
    });
    data = response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const body = (error as { response?: { data?: unknown } })?.response?.data;

    if (status === 404) {
      logger.log(`Tenancy endpoint ${tenancyUrl} returned 404; tenancy lookup skipped`);
      return { supported: false };
    }

    const detail = status === 503 ? parseErrorDetail(body) : undefined;
    if (detail) {
      logger.warn(`Admin API reported a tenancy misconfiguration: ${detail}`);
      throw new AdminApiTenancyError('MISCONFIGURED', detail, detail);
    }

    logger.warn(
      `Failed to read tenancy from ${tenancyUrl} (status ${status ?? 'none'}): ${JSON.stringify(body ?? (error as Error)?.message)}`
    );
    throw new AdminApiTenancyError(
      'UNAVAILABLE',
      'Could not determine tenancy for this Management API.'
    );
  }

  const rawTenants = data?.tenants;
  if (!Array.isArray(rawTenants) || !rawTenants.every((t) => typeof t === 'string')) {
    logger.warn(`Tenancy endpoint ${tenancyUrl} returned a malformed tenants field: ${JSON.stringify(rawTenants)}`);
    throw new AdminApiTenancyError(
      'UNAVAILABLE',
      'Could not determine tenancy for this Management API.'
    );
  }

  const tenants = rawTenants;
  const mode = tenants.length > 0 ? 'MultiTenant' : 'SingleTenant';
  logger.log(`Admin API tenancy: ${mode} (${tenants.length} tenant(s))`);
  return { supported: true, tenants, mode };
};

export interface TenancyFailureDetail {
  isMisconfigured: boolean;
  /** Admin API's own message, safe to show verbatim. Only set when `isMisconfigured`. */
  detail?: string;
}

/**
 * Extracts the caller-agnostic parts of a tenancy failure: whether it's a
 * MISCONFIGURED appsettings problem (Admin API's own `detail`, safe to show
 * verbatim) or any other UNAVAILABLE failure (caller supplies its own
 * wording). Centralizes the `kind` branch that `translateTenancyError()` and
 * `adminapi-sync.service.ts` previously reimplemented independently with
 * matching-by-convention string literals.
 */
export const describeTenancyFailure = (error: AdminApiTenancyError): TenancyFailureDetail => {
  const isMisconfigured = error.kind === 'MISCONFIGURED';
  return {
    isMisconfigured,
    detail: isMisconfigured ? (error.detail ?? error.message) : undefined,
  };
};

/**
 * Translates a failure raised by `fetchAdminApiTenancy` into the
 * `ValidationHttpException` shape both environment-creation validation call
 * sites (`sb-environments-edfi.services.ts` and
 * `sb-environments-global.controller.ts`) surface to the client, and throws
 * it. Anything that is not an `AdminApiTenancyError` is re-thrown unchanged —
 * this function only translates the tenancy-specific failure shape.
 *
 * `MISCONFIGURED` surfaces Admin API's own message verbatim; `UNAVAILABLE`
 * uses neutral wording that never repeats the underlying failure text.
 *
 * Always throws rather than returning — the `never` return type makes that
 * the caller's responsibility to rely on, not just a convention every call
 * site happens to follow with its own `throw`.
 */
export const translateTenancyError = (error: unknown): never => {
  if (error instanceof AdminApiTenancyError) {
    const { isMisconfigured, detail } = describeTenancyFailure(error);
    throw new ValidationHttpException({
      field: 'adminApiUrl',
      message: isMisconfigured
        ? (detail as string)
        : `Could not determine tenancy for this Management API. Please ensure it is running and reachable.`,
    });
  }
  throw error;
};
