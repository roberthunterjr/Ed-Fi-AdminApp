import 'reflect-metadata';
import { AUTHORIZE_KEY } from '../../../auth/authorization/authorize.decorator';
import { OdssController } from './odss.controller';
import { OdssService } from './odss.service';

describe('OdssController job endpoints', () => {
  const subject = { teamId: 'teamId', edfiTenantId: 'edfiTenantId', id: '__filtered__' };

  it('jobs/create/:jobId requires team.sb-environment.edfi-tenant:create-ods', () => {
    const meta = Reflect.getMetadata(AUTHORIZE_KEY, OdssController.prototype.getCreateJob);
    expect(meta.privilege).toBe('team.sb-environment.edfi-tenant:create-ods');
    expect(meta.subject).toEqual(subject);
  });

  it('jobs/delete/:jobId requires team.sb-environment.edfi-tenant:delete-ods', () => {
    const meta = Reflect.getMetadata(AUTHORIZE_KEY, OdssController.prototype.getDeleteJob);
    expect(meta.privilege).toBe('team.sb-environment.edfi-tenant:delete-ods');
    expect(meta.subject).toEqual(subject);
  });
});

describe('OdssController job endpoints response shape', () => {
  const row = {
    id: 'job-1',
    type: 'OdsManageJob',
    name: 'env',
    sbEnvironmentId: 2,
    edfiTenantId: 3,
    dataText: 'x',
    hasChanges: null,
    state: 'failed',
    createdon: new Date('2026-01-01T00:00:00Z'),
    completedon: new Date('2026-01-01T00:00:05Z'),
    data: {
      sbEnvironmentId: 2,
      edfiTenantId: 3,
      adminApiJobId: 'api-1',
      operation: 'create',
      odsName: 'my-ods',
      odsId: null,
    },
    output: { message: 'Database name already exists', stack: 'Error: at secret/path.ts:1' },
  };
  const findOdsManageJob = jest.fn();
  const controller = new OdssController(
    { findOdsManageJob } as unknown as OdssService,
    undefined as never,
    undefined as never
  );

  beforeEach(() => findOdsManageJob.mockReset().mockResolvedValue(row));

  it.each([
    ['getCreateJob', 'create'],
    ['getDeleteJob', 'delete'],
  ] as const)('%s returns only the narrowed job fields without the stack', async (method, op) => {
    const result = await controller[method]('job-1', 1, 3);

    expect(findOdsManageJob).toHaveBeenCalledWith(3, 'job-1', op);
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      id: 'job-1',
      state: 'failed',
      createdon: '2026-01-01T00:00:00.000Z',
      completedon: '2026-01-01T00:00:05.000Z',
      data: row.data,
      output: { message: 'Database name already exists' },
    });
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('returns output null when the job has no message yet', async () => {
    findOdsManageJob.mockResolvedValue({ ...row, state: 'active', completedon: null, output: null });
    const result = await controller.getCreateJob('job-1', 1, 3);
    expect(result.output).toBeNull();
    expect(result.completedon).toBeNull();
  });
});
