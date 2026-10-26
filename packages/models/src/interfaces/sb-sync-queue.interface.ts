import { OdsManageJobData } from './ods-manage-job.interface';

export type PgBossJobState =
  | 'created'
  | 'retry'
  | 'active'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed';
export interface ISbSyncQueue {
  id: string;
  type: 'SbEnvironment' | 'EdfiTenant' | 'OdsManage';
  name: string | 'resource no longer exists';
  sbEnvironmentId: number | null;
  edfiTenantId: number | null;
  dataText: string;
  data: { sbEnvironmentId: number } | { edfiTenantId: number } | OdsManageJobData;
  state: PgBossJobState;
  createdon: Date;
  completedon: Date;
  output: object;
  hasChanges: boolean | null | undefined;
}
