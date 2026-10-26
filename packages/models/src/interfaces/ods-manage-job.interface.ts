export interface OdsManageJobData {
  sbEnvironmentId: number;
  edfiTenantId: number;
  adminApiJobId: string;
  operation: 'create' | 'delete';
  odsName: string;
  /** Local Ods.id when known */
  odsId: number | null;
}
