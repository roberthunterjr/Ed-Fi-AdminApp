import { Expose, Type } from 'class-transformer';
import type { ISbSyncQueue, OdsManageJobData, PgBossJobState } from '../interfaces';
import { makeSerializer } from '../utils/make-serializer';

// This is a Get DTO that should not have whitespace trimmed
export class SbSyncQueueDto implements ISbSyncQueue {
  @Expose()
  id: string;
  @Expose()
  type: 'SbEnvironment' | 'EdfiTenant' | 'OdsManage';
  @Expose()
  name: string | 'resource no longer exists';
  @Expose()
  sbEnvironmentId: number | null;
  @Expose()
  edfiTenantId: number | null;
  @Expose()
  dataText: string;
  @Expose()
  data:
    | { sbEnvironmentId: number; edfiTenantId?: undefined }
    | { sbEnvironmentId?: undefined; edfiTenantId: number }
    | OdsManageJobData;
  @Expose()
  state: PgBossJobState;
  @Expose()
  @Type(() => Date)
  createdon: Date;
  @Expose()
  @Type(() => Date)
  completedon: Date;
  @Expose()
  output: object;
  @Expose()
  hasChanges: boolean | null | undefined;

  get displayName() {
    return this.name;
  }

  get completedOnNumber() {
    return this.completedon ? Number(this.completedon) : undefined;
  }
  get createdOnNumber() {
    return this.createdon ? Number(this.createdon) : undefined;
  }

  get durationNumber() {
    return this.completedOnNumber !== undefined && this.createdOnNumber !== undefined
      ? this.completedOnNumber - this.createdOnNumber
      : undefined;
  }
}
export const toSbSyncQueueDto = makeSerializer<
  SbSyncQueueDto,
  Omit<SbSyncQueueDto, 'createdOnNumber' | 'completedOnNumber' | 'displayName' | 'durationNumber'>
>(SbSyncQueueDto);

export class SyncQueuePaginatedResults {
  @Expose()
  @Type(() => SbSyncQueueDto)
  data: SbSyncQueueDto[];
  @Expose()
  rowCount: number;
}
export const toSyncQueuePaginatedResults = makeSerializer(SyncQueuePaginatedResults);
export class SbSyncQueueFacetedValuesDto {
  /** unique */
  @Expose()
  type: ('SbEnvironment' | 'EdfiTenant' | 'OdsManage')[];
  /** unique */
  @Expose()
  dataText: (string | 'resource no longer exists')[];
  /** unique */
  @Expose()
  state: PgBossJobState[];
  /** unique */
  @Expose()
  hasChanges: (boolean | null | undefined)[];

  /** min/max */
  @Expose()
  @Type(() => Date)
  createdon: [Date | null, Date | null];
  /** min/max */
  @Expose()
  @Type(() => Date)
  completedon: [Date | null, Date | null];
}
export const toSbSyncQueueFacetedValuesDto = makeSerializer(SbSyncQueueFacetedValuesDto);

/** Response of creating a datastore (ODS instance). `syncQueue` is the queued `ods-manage` job, when Admin API returned a job id. */
export class PostInstanceResponseDto {
  @Expose()
  id: number;
  @Expose()
  @Type(() => SbSyncQueueDto)
  syncQueue?: SbSyncQueueDto;
}

/** Response of deleting a datastore (ODS instance). `syncQueue` is the queued `ods-manage` job, when Admin API returned a job id. */
export class DeleteInstanceResponseDto {
  @Expose()
  @Type(() => SbSyncQueueDto)
  syncQueue?: SbSyncQueueDto;
}
