import { EdfiTenant } from '@edanalytics/models-server';
import { SetMetadata } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

export const AUDIT_ADMIN_API_DELETE_METADATA = 'audit:admin-api-delete';

export type AdminApiSnapshotContext = { moduleRef: ModuleRef; edfiTenant: EdfiTenant; id: number };

/** Loads the Admin API resource about to be deleted and returns its allowlisted snapshot. */
export type AdminApiSnapshotLoader = (
  ctx: AdminApiSnapshotContext,
) => Promise<Record<string, unknown> | undefined>;

export type AuditAdminApiDeleteMetadata = { idParam: string; load: AdminApiSnapshotLoader };

/**
 * Marks an Admin API delete handler so the resource is snapshotted before the handler runs. The
 * controller must also use AuditAdminApiDeleteInterceptor, after the interceptor that sets
 * `req.edfiTenant`.
 */
export const AuditAdminApiDelete = (
  idParam: string,
  load: AdminApiSnapshotLoader,
): MethodDecorator =>
  SetMetadata<string, AuditAdminApiDeleteMetadata>(AUDIT_ADMIN_API_DELETE_METADATA, {
    idParam,
    load,
  });
