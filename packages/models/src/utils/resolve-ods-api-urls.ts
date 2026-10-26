import { OdsApiMeta } from '../interfaces/sb-environment.interface';

export type ResolvedOdsApiUrls =
  | { status: 'resolved'; oauthUrl: string; resourceBaseUrl: string }
  | { status: 'context-routing'; placeholders: string[] }
  | { status: 'missing-urls' };

const TENANT_PLACEHOLDER = /\{tenantIdentifier\}/g;
const ANY_PLACEHOLDER = /\{[^}]+\}/g;

/**
 * Resolves the ODS/API URLs certification calls, from the URL templates in the
 * ODS/API discovery response (AC-673 §1). Multi-tenant templates carry
 * {tenantIdentifier}; any other placeholder means context-based routing, which
 * certification doesn't support yet.
 */
export const resolveOdsApiUrls = (
  urls: Pick<OdsApiMeta['urls'], 'oauth' | 'dataManagementApi'> | undefined,
  tenantName: string,
): ResolvedOdsApiUrls => {
  if (!urls?.oauth || !urls?.dataManagementApi) {
    return { status: 'missing-urls' };
  }
  const tenant = encodeURIComponent(tenantName);
  const oauthUrl = urls.oauth.replace(TENANT_PLACEHOLDER, tenant);
  const resourceBaseUrl = urls.dataManagementApi
    .replace(TENANT_PLACEHOLDER, tenant)
    .replace(/\/+$/, '');

  const placeholders = Array.from(
    new Set([
      ...(oauthUrl.match(ANY_PLACEHOLDER) ?? []),
      ...(resourceBaseUrl.match(ANY_PLACEHOLDER) ?? []),
    ]),
  );
  if (placeholders.length > 0) {
    return { status: 'context-routing', placeholders };
  }
  return { status: 'resolved', oauthUrl, resourceBaseUrl };
};
