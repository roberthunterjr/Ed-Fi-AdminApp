import { SetMetadata } from '@nestjs/common';
import type { EntityTarget } from 'typeorm';

export const AUDIT_DELETE_METADATA = 'audit:delete';

export type AuditDeleteMetadata = { entity: EntityTarget<unknown>; idParam: string };

/** Marks a delete handler so the entity is snapshotted before the handler runs. */
export const AuditDelete = (entity: EntityTarget<unknown>, idParam: string): MethodDecorator =>
  SetMetadata<string, AuditDeleteMetadata>(AUDIT_DELETE_METADATA, { entity, idParam });
