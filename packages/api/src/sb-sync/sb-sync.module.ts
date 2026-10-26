import { Module } from '@nestjs/common';
import { SbSyncController } from './sb-sync.controller';

export const SYNC_SCHEDULER_CHNL = 'sbe-sync-scheduler';
export const ENV_SYNC_CHNL = 'sbe-sync';
export const TENANT_SYNC_CHNL = 'edfi-tenant-sync';
export const ODS_MANAGE_CHNL = 'ods-manage';

@Module({
  controllers: [SbSyncController],
})
export class SbSyncModule {}
