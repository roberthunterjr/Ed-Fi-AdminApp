import { EdfiTenant, Ods } from '@edanalytics/models-server';
import type { Type } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminApiServiceV1 } from '../teams/edfi-tenants/starting-blocks/v1/admin-api.v1.service';
import { AdminApiServiceV2 } from '../teams/edfi-tenants/starting-blocks/v2/admin-api.v2.service';
import { AdminApiServiceV3 } from '../teams/edfi-tenants/starting-blocks/v3/admin-api.v3.service';
import type { AdminApiSnapshotLoader } from './audit-admin-api-delete.decorator';
import { getDeleteSnapshotBuilder } from './delete-snapshot.registry';

/**
 * Delete snapshots for Admin API resources, which live in the Admin API rather than the local
 * database. Each builder is an allowlist: it keeps names and business keys only, and never reads
 * contact details, API client keys or secrets, profile definitions or claim set resource claims.
 */

type SnapshotBuilder<T> = (target: T) => Record<string, unknown>;

const fromService =
  <S, T>(
    service: Type<S>,
    get: (service: S, edfiTenant: EdfiTenant, id: number) => Promise<T>,
    build: SnapshotBuilder<T>,
  ): AdminApiSnapshotLoader =>
  async ({ moduleRef, edfiTenant, id }) =>
    build(await get(moduleRef.get(service, { strict: false }), edfiTenant, id));

// Vendors keep the company name only: contact name and email are personal data.
const vendor: SnapshotBuilder<{ company?: string | null }> = (v) => ({
  company: v.company ?? null,
});

const application: SnapshotBuilder<{
  applicationName?: string | null;
  claimSetName?: string | null;
  educationOrganizationIds?: number[] | null;
}> = (a) => ({
  applicationName: a.applicationName ?? null,
  claimSetName: a.claimSetName ?? null,
  educationOrganizationIds: a.educationOrganizationIds ?? null,
});

// API clients keep the name only: the key is a credential.
const apiClient: SnapshotBuilder<{ name?: string | null }> = (c) => ({ name: c.name ?? null });

const claimset: SnapshotBuilder<{ name?: string | null }> = (c) => ({ name: c.name ?? null });

const profile: SnapshotBuilder<{ name?: string | null }> = (p) => ({ name: p.name ?? null });

/**
 * Instance deletes are keyed by `instanceManageId`, which only the local ODS row knows, so this
 * reuses the Ods snapshot instead of asking the Admin API.
 */
const instance: AdminApiSnapshotLoader = async ({ moduleRef, edfiTenant, id }) => {
  const ods = await moduleRef
    .get(DataSource, { strict: false })
    .manager.findOneBy(Ods, { edfiTenantId: edfiTenant.id, instanceManageId: id });
  const build = getDeleteSnapshotBuilder(Ods);
  return ods && build ? build(Object.assign(ods, { edfiTenant })) : undefined;
};

export const adminApiDeleteSnapshots = {
  v1: {
    vendor: fromService(AdminApiServiceV1, (s, t, id) => s.getVendor(t, id), vendor),
    application: fromService(
      AdminApiServiceV1,
      (s, t, id) => s.getApplication(t, id),
      (a) => application({ ...a, educationOrganizationIds: a._educationOrganizationIds }),
    ),
    claimset: fromService(AdminApiServiceV1, (s, t, id) => s.getClaimset(t, id), claimset),
  },
  v2: {
    vendor: fromService(AdminApiServiceV2, (s, t, id) => s.getVendor(t, id), vendor),
    application: fromService(AdminApiServiceV2, (s, t, id) => s.getApplication(t, id), application),
    apiClient: fromService(AdminApiServiceV2, (s, t, id) => s.getApiClient(t, id), apiClient),
    claimset: fromService(AdminApiServiceV2, (s, t, id) => s.getClaimsetBasic(t, id), claimset),
    instance,
    profile: fromService(AdminApiServiceV2, (s, t, id) => s.getProfile(t, id), profile),
  },
  v3: {
    vendor: fromService(AdminApiServiceV3, (s, t, id) => s.getVendor(t, id), vendor),
    application: fromService(AdminApiServiceV3, (s, t, id) => s.getApplication(t, id), application),
    apiClient: fromService(AdminApiServiceV3, (s, t, id) => s.getApiClient(t, id), apiClient),
    claimset: fromService(AdminApiServiceV3, (s, t, id) => s.getClaimsetBasic(t, id), claimset),
    instance,
    profile: fromService(AdminApiServiceV3, (s, t, id) => s.getProfile(t, id), profile),
  },
};
