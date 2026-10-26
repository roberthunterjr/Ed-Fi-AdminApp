import { Expose, Type } from 'class-transformer';
import type { OdsManageJobData, PgBossJobState } from '../interfaces';
import { makeSerializer } from '../utils/make-serializer';

/**
 * Team-facing view of an `ods-manage` job (a datastore create/delete tracked from Admin API).
 * Deliberately narrower than `SbSyncQueueDto`: it never exposes server stack traces.
 */
export class OdsManageJobDto {
  @Expose()
  id: string;
  @Expose()
  state: PgBossJobState;
  @Expose()
  @Type(() => Date)
  createdon: Date;
  @Expose()
  @Type(() => Date)
  completedon: Date | null;
  @Expose()
  data: OdsManageJobData;
  /** Admin API's error message (on failure) or completion message. */
  @Expose()
  output: { message: string } | null;
}

const serializeOdsManageJobDto = makeSerializer<OdsManageJobDto, OdsManageJobDto>(OdsManageJobDto);

type OdsManageJobSource = {
  id: string;
  state: PgBossJobState;
  createdon: Date;
  completedon?: Date | null;
  data: unknown;
  output?: unknown;
};

const pickMessage = (output: unknown): { message: string } | null => {
  const parsed = typeof output === 'string' ? safeJsonParse(output) : output;
  if (parsed && typeof parsed === 'object' && 'message' in parsed) {
    const message = (parsed as { message: unknown }).message;
    return message === undefined || message === null ? null : { message: String(message) };
  }
  return null;
};

/** JSON.parse that returns null instead of throwing (job data/output may arrive as text on MSSQL). */
export const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Maps a sync-queue row to the team-facing DTO, dropping everything but `output.message`. */
export const toOdsManageJobDto = (job: OdsManageJobSource): OdsManageJobDto =>
  serializeOdsManageJobDto({
    id: job.id,
    state: job.state,
    createdon: job.createdon,
    completedon: job.completedon ?? null,
    data: (typeof job.data === 'string' ? safeJsonParse(job.data) : job.data) as OdsManageJobData,
    output: pickMessage(job.output),
  });
