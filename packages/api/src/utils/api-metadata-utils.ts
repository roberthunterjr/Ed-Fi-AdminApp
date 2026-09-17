import { Logger } from '@nestjs/common';
import { PostSbEnvironmentDto, OdsApiMeta } from '@edanalytics/models';
import axios from 'axios';
import { ValidationHttpException } from './customExceptions';
import config from 'config';
import {
  fetchAdminApiTenancy,
  translateTenancyError,
  AdminApiInfoWithUrls,
  TenancyResult,
} from './admin-api-tenancy';

const logger = new Logger('api-metadata-utils');

/**
 * Shape of the Admin API root/info endpoint response.
 * Only the fields consumed by this module are modeled here. Extends
 * `AdminApiInfoWithUrls` (the subset `fetchAdminApiTenancy()` needs) rather
 * than redeclaring the same `specificationVersion`/`urls` fields.
 */
export interface AdminApiInfo extends AdminApiInfoWithUrls {
  version?: string;
}

/**
 * Determines the API version (v1 or v2) from Admin API metadata version string
 */
export const determineVersionFromAdminApiMetadata = (adminApiVersion: string): 'v1' | 'v2' => {
  try {
    // Admin API version format: "1.1", "2.0", etc.
    const majorVersion = parseInt(adminApiVersion.split('.')[0], 10);

    if (majorVersion >= 2) {
      return 'v2';
    } else {
      return 'v1';
    }
  } catch (error) {
    logger.warn('Failed to parse Admin API version, defaulting to v1:', error);
    return 'v1';
  }
};

/**
 * Determines the tenant mode from ODS API metadata alone (URL pattern detection)
 * Does not use Admin API info, ensuring ODS mode is independent.
 *
 * @param odsApiMeta ODS API metadata containing version and URL information
 * @returns 'MultiTenant' or 'SingleTenant'
 */
export const determineTenantModeFromOdsMetadata = (
  odsApiMeta: OdsApiMeta
): 'MultiTenant' | 'SingleTenant' => {
  try {
    const urls = odsApiMeta.urls;

    if (!urls) {
      logger.warn('No URLs found in ODS API metadata');
      throw new ValidationHttpException({
        field: 'odsApiDiscoveryUrl',
        message: `ODS API metadata does not contain valid URLs.`,
      });
    }

    // Determine tenant mode based on the presence of specific URL segment
    if (urls.dataManagementApi.includes('tenantIdentifier')) {
      logger.log('Determined MultiTenant mode from ODS API URL pattern');
      return 'MultiTenant';
    } else {
      logger.log('Determined SingleTenant mode from ODS API URL pattern');
      return 'SingleTenant';
    }
  } catch (error) {
    logger.warn('Error determining tenant mode from ODS metadata:', error);
    throw new ValidationHttpException({
      field: 'odsApiDiscoveryUrl',
      message: `Unable to determine tenant mode from ODS API metadata.`,
    });
  }
};

/**
 * Extracts the tenant mode from a tenancy result returned by
 * fetchAdminApiTenancy(). Returns undefined when Admin API does not expose a
 * tenancy endpoint (V1, or a build predating the `urls` block), so callers
 * fall back to ODS URL-pattern inference.
 */
export const getAdminApiTenantMode = (
  tenancy?: TenancyResult
): 'MultiTenant' | 'SingleTenant' | undefined => {
  if (tenancy?.supported) {
    logger.log(`Using tenant mode from Admin API tenancy endpoint: ${tenancy.mode}`);
    return tenancy.mode;
  }
  return undefined;
};

/**
 * Determines the tenant mode (MultiTenant or SingleTenant)
 * Prioritizes Admin API's explicit tenancy signal, falls back to ODS API URL pattern detection
 *
 * @param odsApiMeta ODS API metadata containing version and URL information
 * @param tenancy Optional tenancy result from fetchAdminApiTenancy()
 * @returns 'MultiTenant' or 'SingleTenant'
 */
export const determineTenantModeFromMetadata = (
  odsApiMeta: OdsApiMeta,
  tenancy?: TenancyResult
): 'MultiTenant' | 'SingleTenant' => {
  // Priority 1: Admin API's explicit tenancy signal
  const adminMode = getAdminApiTenantMode(tenancy);
  if (adminMode !== undefined) {
    return adminMode;
  }

  // Priority 2: Fall back to ODS API URL pattern detection
  return determineTenantModeFromOdsMetadata(odsApiMeta);
};

/**
 * When Admin API info was fetched, validates that it agrees with the ODS API
 * on tenant mode (throws `ValidationHttpException` on mismatch); a no-op
 * otherwise. Shared by the two environment-create call sites
 * (`SbEnvironmentsEdFiService.create()` and
 * `SbEnvironmentsGlobalController.checkEdFiVersionAndTenantMode()`) that
 * otherwise duplicated this exact compatibility-check-and-log sequence.
 *
 * Deliberately does not also determine/return tenant mode: callers must
 * assign tenant mode (`determineTenantModeFromMetadata()`) before calling
 * this, since a mismatch throw must not prevent that assignment — the
 * Admin API signal is authoritative even when the two APIs disagree.
 */
export const checkTenantModeCompatibility = (
  odsApiMeta: OdsApiMeta,
  hasAdminApiInfo: boolean,
  tenancy: TenancyResult | undefined
): void => {
  if (!hasAdminApiInfo) return;

  const adminTenantMode = getAdminApiTenantMode(tenancy);
  if (adminTenantMode !== undefined) {
    const odsTenantMode = determineTenantModeFromMetadata(odsApiMeta);
    validateTenantModeCompatibility(odsTenantMode, adminTenantMode);
  } else {
    logger.log('Admin API does not expose a tenancy endpoint, skipping tenant mode compatibility check');
  }
};

/**
 * Fetches ODS API metadata from the discovery URL
 */
export const fetchOdsApiMetadata = async (createSbEnvironmentDto: PostSbEnvironmentDto) => {
  const odsApiDiscoveryUrl = createSbEnvironmentDto.odsApiDiscoveryUrl;
  try {
    const response = await axios.get(odsApiDiscoveryUrl, {
      headers: {
        Accept: 'application/json',
      },
      timeout: config.EDFI_URLS_TIMEOUT_MS, // Timeout from config
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch ODS API metadata: ${response.statusText}`);
    }
    // Optionally validate the response contains expected discovery document structure
    const odsApiMetaResponse = response.data;
    return odsApiMetaResponse;
  } catch (error) {
    if (isTimeoutError(error)) {
      logger.warn(`Timeout error fetching ODS API metadata from ${odsApiDiscoveryUrl}:`, error);
      throw new ValidationHttpException({
        field: 'odsApiDiscoveryUrl',
        message: `Connection to Ed-Fi API Discovery URL timed out. Please ensure the URL is correct and the server is reachable.`,
      });
    }
    else {
      logger.warn(`Error fetching ODS API metadata from ${odsApiDiscoveryUrl}:`, error);
      throw new ValidationHttpException({
        field: 'odsApiDiscoveryUrl',
        message: `Failed to connect to Ed-Fi API Discovery URL. Please check the URL and ensure it is valid.`,
      });
    }
  }
};

/**
 * Fetches Admin API Info from the root endpoint.
 * Returns the raw response which includes version, specificationVersion, and urls.
 * The urls.tenancy field contains the URL of the tenancy endpoint (empty string for v1).
 * To retrieve the actual tenant list, pass this result to fetchAdminApiTenancy().
 */
export const fetchAdminApiInfo = async (adminApiUrl: string): Promise<AdminApiInfo> => {
  if (!adminApiUrl) {
    throw new ValidationHttpException({
      field: 'adminApiUrl',
      message: 'Management API Discovery URL is required',
    });
  }

  try {
    const response = await axios.get(adminApiUrl, {
      headers: {
        Accept: 'application/json',
      },
      timeout: config.EDFI_URLS_TIMEOUT_MS,
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch Admin API info: ${response.statusText}`);
    }
    return response.data;
  } catch (error) {
    if (isTimeoutError(error)) {
      logger.warn(`Timeout error fetching Admin API info from ${adminApiUrl}:`, error);
      throw new ValidationHttpException({
        field: 'adminApiUrl',
        message: `Connection to Management API Discovery URL timed out. Please ensure the URL is correct and the server is reachable.`,
      });
    } else {
      logger.warn(`Error fetching Admin API info from ${adminApiUrl}:`, error);
      throw new ValidationHttpException({
        field: 'adminApiUrl',
        message: `Failed to connect to Management API Discovery URL. Please check the URL and ensure it is valid.`,
      });
    }
  }
};

/**
 * Resolves the tenant names an Admin API-backed environment should sync: fetches
 * Admin API's info and tenancy endpoints and returns the discovered tenant list,
 * or `['default']` when Admin API is genuinely single-tenant or exposes no
 * tenancy endpoint. Shared by the v2 and v3 `getTenants()` implementations,
 * which otherwise duplicated this exact fetch-and-branch sequence.
 *
 * A failed tenancy lookup throws rather than reaching the `['default']`
 * fallback — see `fetchAdminApiTenancy()`'s contract: no error is ever
 * interpreted as single-tenant.
 */
export const resolveTenantNames = async (adminApiUrl: string): Promise<string[]> => {
  const adminApiInfo = await fetchAdminApiInfo(adminApiUrl);
  const tenancy = await fetchAdminApiTenancy(adminApiInfo, adminApiUrl);

  if (tenancy.supported && tenancy.tenants.length > 0) {
    logger.log(
      `Multi-tenant mode detected with ${tenancy.tenants.length} tenants: ${tenancy.tenants.join(', ')}`
    );
    return tenancy.tenants;
  }

  // Logged distinctly rather than collapsed into one message: "not supported" (no
  // tenancy endpoint — genuinely single-tenant, expected) and "supported but empty"
  // (the endpoint answered with zero tenants — could be a stale/misrouted proxy or a
  // real mode drift) are different enough signals that an operator scanning logs
  // should be able to tell them apart.
  if (tenancy.supported) {
    logger.log('Tenancy endpoint reported zero tenants; using default tenant');
  } else {
    logger.log('Admin API does not support tenancy; using default tenant');
  }
  return ['default'];
};

/**
 * Validates the Management API Discovery URL.
 * @param adminApiUrl The URL to validate.
 * @param odsApiDiscoveryUrl The ODS API URL for version comparison (optional if odsApiMeta provided).
 * @returns The fetched Admin API metadata, plus the `TenancyResult` this function already fetched
 * for its own tenant-mode compatibility check — callers deriving tenant mode should reuse `tenancy`
 * rather than calling `fetchAdminApiTenancy()` again for the same environment.
 */

export const validateAdminApiUrl = async (
  adminApiUrl: string,
  odsApiDiscoveryUrl: string
): Promise<AdminApiInfo & { tenancy?: TenancyResult }> => {
  try {
    // Fetch Admin API info (reuses shared fetch function)
    const metadata = await fetchAdminApiInfo(adminApiUrl);

    // Validate the version
    const adminApiVersion = metadata.version;
    if (!adminApiVersion) {
      throw new ValidationHttpException({
        field: 'adminApiUrl',
        message: `Management API Discovery URL does not contain a valid version.`,
      });
    }

    // Only perform version validation if we have ODS API information
    let odsMetadata: OdsApiMeta;
    if (odsApiDiscoveryUrl) {
      odsMetadata = await fetchOdsApiMetadata({ odsApiDiscoveryUrl } as PostSbEnvironmentDto);
    } else {
      throw new ValidationHttpException({
        field: 'adminApiUrl',
        message: `Please provide a valid Ed-Fi API Discovery URL to validate against.`,
      });
    }

    // const adminDetectedVersion = determineVersionFromAdminApiMetadata(adminApiVersion);
    const adminDetectedVersion = metadata.specificationVersion;
    
    // Extract version from metadata
    const odsDetectedVersion = odsMetadata.version;

    if (!odsDetectedVersion) {
      logger.warn('No version found in ODS API metadata');
      throw new ValidationHttpException({
        field: 'odsApiDiscoveryUrl',
        message: `ODS API metadata does not contain a valid version.`,
      });
    }

    // Parse the major version number correctly from semantic version string
    const majorOdsDetectedVersion = parseInt(odsDetectedVersion.split('.')[0], 10);

     if (Number.isNaN(majorOdsDetectedVersion)) {
       logger.warn(`Failed to parse ODS API version from metadata: ${odsDetectedVersion}`);
      throw new ValidationHttpException({
        field: 'odsApiDiscoveryUrl',
        message: `ODS API metadata does not contain a valid version.`,
      });
    }

    if (
      (majorOdsDetectedVersion >= 7 && adminDetectedVersion === 'v1') ||
      (majorOdsDetectedVersion < 7 && (adminDetectedVersion === 'v2' || adminDetectedVersion === 'v3'))
    ) {
      throw new ValidationHttpException({
        field: 'adminApiUrl',
        message: `Management API version (${adminDetectedVersion}) does not match Ed-Fi API version. Expected APIs to be compatible versions.`,
      });
    }

    // Validate tenant mode compatibility - only if Admin API exposes a tenancy endpoint
    const odsTenantMode = determineTenantModeFromOdsMetadata(odsMetadata);
    let tenancy: TenancyResult;
    try {
      tenancy = await fetchAdminApiTenancy(metadata, adminApiUrl);
    } catch (error) {
      throw translateTenancyError(error);
    }
    const adminTenantMode = getAdminApiTenantMode(tenancy);

    if (adminTenantMode !== undefined) {
      validateTenantModeCompatibility(odsTenantMode, adminTenantMode);
    } else {
      logger.log('Admin API does not expose a tenancy endpoint, skipping tenant mode compatibility check');
    }

    // Return the fetched metadata and tenancy result so callers can reuse them and avoid a duplicate network call
    return { ...metadata, tenancy };
  } catch (error) {
    logger.warn(`Error validating Management API Discovery URL ${adminApiUrl}:`, error.message);
    // Re-throw ValidationHttpException errors to preserve specific error messages
    if (error instanceof ValidationHttpException) {
      throw error;
    }

    // For unexpected errors, throw a generic validation exception
    throw new ValidationHttpException({
      field: 'adminApiUrl',
      message: `Failed to validate Management API Discovery URL. Please check the URL and ensure it is valid.`,
    });
  }
};

/**
 * Validates that ODS API and Admin API tenant modes are compatible
 * Both must be configured with the same tenant mode (both MultiTenant or both SingleTenant)
 *
 * @param odsApiTenantMode Tenant mode detected from ODS API
 * @param adminApiTenantMode Tenant mode detected from Admin API
 * @throws ValidationHttpException if tenant modes don't match
 */
export const validateTenantModeCompatibility = (
  odsApiTenantMode: 'MultiTenant' | 'SingleTenant',
  adminApiTenantMode: 'MultiTenant' | 'SingleTenant'
): void => {
  if (odsApiTenantMode !== adminApiTenantMode) {
    throw new ValidationHttpException({
      field: 'adminApiUrl',
      message: `Ed-Fi API and Management API URLs must both be configured with the same tenant mode (both MultiTenant or both SingleTenant). Currently: Ed-Fi API = ${odsApiTenantMode}, Management API = ${adminApiTenantMode}.`,
    });
  }
};

const isTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === 'ECONNABORTED' ||
    (typeof message === 'string' && message.toLowerCase().includes('timeout'))
  );
};

