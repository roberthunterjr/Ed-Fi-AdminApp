import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Edorg, EdfiTenant, Ods, SbSyncQueue } from '@edanalytics/models-server';
import {
  GetApplicationDtoV3,
  Ids,
  PostInstanceDtoV3,
  PostProfileDtoV3,
  PutApplicationFormDtoV3,
  PutProfileDtoV3,
} from '@edanalytics/models';
import { Repository } from 'typeorm';
import { AdminApiControllerV3 } from './admin-api.v3.controller';
import { AdminApiServiceV3 } from './admin-api.v3.service';
import { CustomHttpException, ValidationHttpException } from '../../../../utils';
import { IntegrationAppsTeamService } from '../../../../integration-apps-team/integration-apps-team.service';
import { ENV_SYNC_CHNL, ODS_MANAGE_CHNL } from '../../../../sb-sync/sb-sync.module';
import { IJobQueueService } from '../../../../sb-sync/job-queue/job-queue.interface';

describe('AdminApiControllerV3 - exportClaimset', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { exportClaimset: jest.Mock };

  const mockEdfiTenant = {
    id: 1,
    sbEnvironment: { envLabel: 'Test Env' },
  } as unknown as EdfiTenant;

  beforeEach(() => {
    mockSbService = {
      exportClaimset: jest.fn().mockResolvedValue({
        name: 'Test Claimset',
        resourceClaims: [],
      }),
    };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      null as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>,
    );
  });

  it('exports claimsets when validIds is true (superuser access)', async () => {
    const validIds: Ids = true;
    const result = await controller.exportClaimset(1, 1, mockEdfiTenant, ['1', '2'], validIds);
    expect(mockSbService.exportClaimset).toHaveBeenCalledTimes(2);
    expect(mockSbService.exportClaimset).toHaveBeenCalledWith(mockEdfiTenant, 1);
    expect(mockSbService.exportClaimset).toHaveBeenCalledWith(mockEdfiTenant, 2);
    expect(result).toBeDefined();
  });

  it('throws ForbiddenException when one requested ID is outside the authorized set', async () => {
    const validIds: Ids = new Set([1]);
    await expect(
      controller.exportClaimset(1, 1, mockEdfiTenant, ['1', '2'], validIds),
    ).rejects.toThrow(new ForbiddenException('Access denied to claimset ID: 2'));
    expect(mockSbService.exportClaimset).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for a non-integer string ID', async () => {
    const validIds: Ids = true;
    await expect(
      controller.exportClaimset(1, 1, mockEdfiTenant, ['abc'], validIds),
    ).rejects.toThrow(new BadRequestException('Invalid claimset ID: abc'));
    expect(mockSbService.exportClaimset).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when no id is provided (undefined)', async () => {
    const validIds: Ids = true;
    await expect(
      controller.exportClaimset(1, 1, mockEdfiTenant, '', validIds),
    ).rejects.toThrow(new BadRequestException('At least one claimset ID must be provided'));
    expect(mockSbService.exportClaimset).not.toHaveBeenCalled();
  });
});

describe('AdminApiControllerV3 - getDataStores', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { getDataStores: jest.Mock };

  const mockEdfiTenant = { id: 1 } as unknown as EdfiTenant;

  beforeEach(() => {
    mockSbService = {
      getDataStores: jest.fn().mockResolvedValue([
        { id: 1, name: 'Ods1', dataStoreType: 'Ods' },
        { id: 2, name: 'Ods2', dataStoreType: 'Ods' },
      ]),
    };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      null as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>,
    );
  });

  it('filters data stores by the authorized ID set', async () => {
    const validIds: Ids = new Set([1]);
    const result = await controller.getDataStores(1, 1, mockEdfiTenant, validIds);
    expect(mockSbService.getDataStores).toHaveBeenCalledWith(mockEdfiTenant);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('returns all data stores when validIds is true (superuser access)', async () => {
    const validIds: Ids = true;
    const result = await controller.getDataStores(1, 1, mockEdfiTenant, validIds);
    expect(result).toHaveLength(2);
  });
});

describe('AdminApiControllerV3 - claimset validation call site', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { getClaimsetBasic: jest.Mock; getClaimset: jest.Mock };

  const mockEdfiTenant = {
    id: 1,
    sbEnvironment: { envLabel: 'Test Env' },
  } as unknown as EdfiTenant;

  beforeEach(() => {
    // Resolving as system-reserved makes both methods throw immediately
    // after the claimset validation step, before touching any of the
    // other collaborators (edorg repository, integration apps, etc.) —
    // enough to prove which claimset lookup was used, without needing to
    // mock the rest of either method's flow.
    mockSbService = {
      getClaimsetBasic: jest.fn().mockResolvedValue({ _isSystemReserved: true, name: 'Test' }),
      getClaimset: jest.fn(),
    };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      null as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>,
    );
  });

  it('putApplication validates the claimset via getClaimsetBasic, not the enriched getClaimset', async () => {
    const application = { claimsetId: 5 } as unknown as Parameters<
      AdminApiControllerV3['putApplication']
    >[4];

    await expect(
      controller.putApplication(1, 1, mockEdfiTenant, 1, application, true),
    ).rejects.toThrow(
      new ValidationHttpException({
        field: 'claimsetId',
        message: 'Cannot use system-reserved claimset',
      }),
    );
    expect(mockSbService.getClaimsetBasic).toHaveBeenCalledWith(mockEdfiTenant, 5);
    expect(mockSbService.getClaimset).not.toHaveBeenCalled();
  });

  it('postApplication validates the claimset via getClaimsetBasic, not the enriched getClaimset', async () => {
    const application = { claimsetId: 5 } as unknown as Parameters<
      AdminApiControllerV3['postApplication']
    >[5];

    await expect(
      controller.postApplication(
        1,
        1,
        mockEdfiTenant,
        {} as unknown as Parameters<AdminApiControllerV3['postApplication']>[3],
        undefined,
        application,
        true,
      ),
    ).rejects.toThrow(
      new ValidationHttpException({
        field: 'claimsetId',
        message: 'Cannot use system-reserved claimset',
      }),
    );
    expect(mockSbService.getClaimsetBasic).toHaveBeenCalledWith(mockEdfiTenant, 5);
    expect(mockSbService.getClaimset).not.toHaveBeenCalled();
  });
});

describe('AdminApiControllerV3 - postProfile', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { postProfile: jest.Mock };

  const mockEdfiTenant = {
    id: 1,
    sbEnvironment: { envLabel: 'Test Env' },
  } as unknown as EdfiTenant;

  const mockProfile: PostProfileDtoV3 = { name: 'Test Profile', definition: '<Profile />' };

  const makeAxiosError = (data: unknown) => ({
    isAxiosError: true,
    message: 'Request failed with status code 400',
    response: { status: 400, data },
  });

  beforeEach(() => {
    mockSbService = {
      postProfile: jest.fn(),
    };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      null as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>,
    );
  });

  it('throws ValidationHttpException for a duplicate profile name', async () => {
    mockSbService.postProfile.mockRejectedValue(
      makeAxiosError({
        title: 'Validation failed',
        status: 400,
        errors: { Name: ['this name already exists'] },
      }),
    );

    await expect(controller.postProfile(1, 1, mockEdfiTenant, mockProfile)).rejects.toThrow(
      new ValidationHttpException({
        field: 'name',
        message: 'A profile with this name already exists. Please choose a different name.',
      }),
    );
  });

  it('throws ValidationHttpException for an invalid XML definition', async () => {
    const definitionError = 'List of possible elements expected: Foo.';
    mockSbService.postProfile.mockRejectedValue(
      makeAxiosError({
        title: 'Validation failed',
        status: 400,
        errors: { Definition: [definitionError] },
      }),
    );

    await expect(controller.postProfile(1, 1, mockEdfiTenant, mockProfile)).rejects.toThrow(
      new ValidationHttpException({
        field: 'definition',
        message: `Invalid XML format for definition: ${definitionError}`,
      }),
    );
  });

  it('throws CustomHttpException for a generic validation error', async () => {
    const errorData = {
      title: 'Validation failed',
      status: 400,
      errors: { Other: ['something else went wrong'] },
    };
    mockSbService.postProfile.mockRejectedValue(makeAxiosError(errorData));

    await expect(controller.postProfile(1, 1, mockEdfiTenant, mockProfile)).rejects.toThrow(
      new CustomHttpException(
        {
          title: 'Validation error',
          type: 'Error',
          data: errorData,
        },
        400,
      ),
    );
  });

  it('rethrows the original error when it is not an axios validation error', async () => {
    const otherError = new Error('boom');
    mockSbService.postProfile.mockRejectedValue(otherError);

    await expect(controller.postProfile(1, 1, mockEdfiTenant, mockProfile)).rejects.toThrow(
      otherError,
    );
  });
});

describe('AdminApiControllerV3 - postInstance', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { postInstance: jest.Mock };
  let mockOdsRepository: { save: jest.Mock };
  let mockJobQueue: { send: jest.Mock };
  let mockQueueRepository: { findOneBy: jest.Mock };

  const mockEdfiTenant = { id: 1, sbEnvironment: { envLabel: 'Test Env' } } as unknown as EdfiTenant;
  const mockInstance = {
    name: 'My DB Instance',
    databaseTemplate: 'Minimal',
  } as unknown as PostInstanceDtoV3;
  const makeAxiosError = (data: unknown) => ({
    isAxiosError: true,
    message: 'Request failed with status code 400',
    response: { status: 400, data },
  });

  beforeEach(() => {
    mockSbService = { postInstance: jest.fn() };
    mockOdsRepository = { save: jest.fn() };
    mockJobQueue = { send: jest.fn() };
    mockQueueRepository = { findOneBy: jest.fn() };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      mockOdsRepository as unknown as Repository<Ods>,
      mockJobQueue as unknown as IJobQueueService,
      mockQueueRepository as unknown as Repository<SbSyncQueue>,
    );
  });

  it('creates local ODS row and enqueues sync after instance creation', async () => {
    mockSbService.postInstance.mockResolvedValue({ id: 55 });
    mockOdsRepository.save.mockResolvedValue({ id: 901 });
    mockJobQueue.send.mockResolvedValue('job-123');

    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).resolves.toEqual({
      id: 901,
    });
    expect(mockSbService.postInstance).toHaveBeenCalledWith(mockEdfiTenant, mockInstance);
    expect(mockOdsRepository.save).toHaveBeenCalledWith({
      edfiTenantId: mockEdfiTenant.id,
      sbEnvironmentId: mockEdfiTenant.sbEnvironmentId,
      odsInstanceId: 55,
      dbName: mockInstance.name,
      odsInstanceName: mockInstance.name,
      instanceType: mockInstance.databaseTemplate,
      databaseTemplate: mockInstance.databaseTemplate,
      status: 'PendingCreate',
    });
    expect(mockJobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: mockEdfiTenant.sbEnvironmentId },
      { expireInHours: 2 }
    );
  });

  it('queues ods-manage job with operation create and returns syncQueue', async () => {
    const edfiTenant = { id: 1, sbEnvironmentId: 2 } as unknown as EdfiTenant;
    mockSbService.postInstance.mockResolvedValue({ id: 55, jobId: 'CreateInstanceJob-7_abc' });
    mockOdsRepository.save.mockResolvedValue({ id: 901 });
    mockJobQueue.send.mockResolvedValueOnce('sync-1').mockResolvedValueOnce('manage-1');
    mockQueueRepository.findOneBy.mockResolvedValue({ id: 'manage-1', state: 'created', type: 'OdsManage' });

    const result = await controller.postInstance(1, 1, edfiTenant, { ...mockInstance, name: 'my-ods' });

    expect(mockJobQueue.send).toHaveBeenCalledWith(
      ODS_MANAGE_CHNL,
      {
        sbEnvironmentId: 2,
        edfiTenantId: 1,
        adminApiJobId: 'CreateInstanceJob-7_abc',
        operation: 'create',
        odsName: 'my-ods',
        odsId: 901,
      },
      { expireInSeconds: 7200, retryLimit: 0 }
    );
    expect(result.id).toBe(901);
    expect(result.syncQueue).toMatchObject({ id: 'manage-1', state: 'created' });
  });

  it('returns { id } when queueing the ods-manage job fails', async () => {
    mockSbService.postInstance.mockResolvedValue({ id: 55, jobId: 'CreateInstanceJob-7_abc' });
    mockOdsRepository.save.mockResolvedValue({ id: 901 });
    mockJobQueue.send.mockImplementation((channel: string) =>
      channel === ODS_MANAGE_CHNL ? Promise.reject(new Error('queue down')) : Promise.resolve('sync-1')
    );

    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).resolves.toEqual({
      id: 901,
    });
  });

  it('without jobId returns { id } and queues no ods-manage job', async () => {
    mockSbService.postInstance.mockResolvedValue({ id: 55, jobId: undefined });
    mockOdsRepository.save.mockResolvedValue({ id: 901 });
    mockJobQueue.send.mockResolvedValue('sync-1');

    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).resolves.toEqual({
      id: 901,
    });
    expect(mockJobQueue.send).toHaveBeenCalledTimes(1);
    expect(mockJobQueue.send.mock.calls[0][0]).toBe(ENV_SYNC_CHNL);
  });

  it('still maps Admin API name validation error to ValidationHttpException and queues nothing', async () => {
    mockSbService.postInstance.mockRejectedValue(
      makeAxiosError({ title: 'Validation failed', status: 400, errors: { Name: ['name is required'] } })
    );
    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).rejects.toThrow(
      new ValidationHttpException({ field: 'name', message: 'name is required' })
    );
    expect(mockJobQueue.send).not.toHaveBeenCalled();
  });

  it('throws ValidationHttpException for name validation errors', async () => {
    mockSbService.postInstance.mockRejectedValue(
      makeAxiosError({ title: 'Validation failed', status: 400, errors: { Name: ['name is required'] } })
    );
    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).rejects.toThrow(
      new ValidationHttpException({ field: 'name', message: 'name is required' })
    );
  });

  it('throws ValidationHttpException for databaseTemplate validation errors', async () => {
    mockSbService.postInstance.mockRejectedValue(
      makeAxiosError({ title: 'Validation failed', status: 400, errors: { DatabaseTemplate: ['database template is required'] } })
    );
    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).rejects.toThrow(
      new ValidationHttpException({ field: 'databaseTemplate', message: 'database template is required' })
    );
  });

  it('throws CustomHttpException for other validation errors', async () => {
    const errorData = { title: 'Validation failed', status: 400, errors: { Other: ['something else went wrong'] } };
    mockSbService.postInstance.mockRejectedValue(makeAxiosError(errorData));
    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).rejects.toThrow(
      new CustomHttpException({ title: 'Validation error', type: 'Error', data: errorData }, 400)
    );
  });

  it('rethrows non-validation errors', async () => {
    const otherError = new Error('boom');
    mockSbService.postInstance.mockRejectedValue(otherError);
    await expect(controller.postInstance(1, 1, mockEdfiTenant, mockInstance)).rejects.toThrow(otherError);
  });
});

describe('AdminApiControllerV3 - deleteInstance', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { deleteInstance: jest.Mock };
  let mockOdsRepository: { findOneBy: jest.Mock; save: jest.Mock };
  let mockJobQueue: { send: jest.Mock };
  let mockQueueRepository: { findOneBy: jest.Mock };

  const mockEdfiTenant = {
    id: 1,
    sbEnvironmentId: 2,
    sbEnvironment: { envLabel: 'Test Env' },
  } as unknown as EdfiTenant;

  beforeEach(() => {
    mockSbService = { deleteInstance: jest.fn().mockResolvedValue(undefined) };
    mockOdsRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 901, instanceManageId: 55, status: 'Created' }),
      save: jest.fn().mockResolvedValue({ id: 901, instanceManageId: 55, status: 'PendingDelete' }),
    };
    mockJobQueue = { send: jest.fn().mockResolvedValue('job-123') };
    mockQueueRepository = { findOneBy: jest.fn() };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      mockOdsRepository as unknown as Repository<Ods>,
      mockJobQueue as unknown as IJobQueueService,
      mockQueueRepository as unknown as Repository<SbSyncQueue>,
    );
  });

  it('finds local ODS, calls sbService delete, sets PendingDelete, and enqueues sync', async () => {
    const instanceManageId = 55;
    await expect(controller.deleteInstance(1, 1, mockEdfiTenant, instanceManageId)).resolves.toEqual({});
    expect(mockOdsRepository.findOneBy).toHaveBeenCalledWith({ edfiTenantId: mockEdfiTenant.id, instanceManageId });
    expect(mockSbService.deleteInstance).toHaveBeenCalledWith(mockEdfiTenant, instanceManageId);
    expect(mockOdsRepository.save).toHaveBeenCalledWith({ id: 901, instanceManageId: 55, status: 'PendingDelete' });
    expect(mockJobQueue.send).toHaveBeenCalledWith(
      ENV_SYNC_CHNL,
      { sbEnvironmentId: mockEdfiTenant.sbEnvironmentId },
      { expireInHours: 2 }
    );
  });

  it('throws BadRequestException when instanceManageId <= 0', async () => {
    await expect(controller.deleteInstance(1, 1, mockEdfiTenant, 0)).rejects.toThrow(
      new BadRequestException('instanceManageId must be greater than zero')
    );
    expect(mockOdsRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when local ODS is not found', async () => {
    mockOdsRepository.findOneBy.mockResolvedValue(null);
    await expect(controller.deleteInstance(1, 1, mockEdfiTenant, 55)).rejects.toThrow(
      new NotFoundException('ODS not found for instanceManageId')
    );
    expect(mockSbService.deleteInstance).not.toHaveBeenCalled();
  });

  it('queues ods-manage job with operation delete and returns syncQueue', async () => {
    mockSbService.deleteInstance.mockResolvedValue({ jobId: 'DeleteInstanceJob-8_xyz' });
    mockOdsRepository.findOneBy.mockResolvedValue({
      id: 901,
      instanceManageId: 55,
      status: 'Created',
      odsInstanceName: 'named-ods',
      dbName: 'db-name',
    });
    mockJobQueue.send.mockResolvedValueOnce('sync-1').mockResolvedValueOnce('manage-1');
    mockQueueRepository.findOneBy.mockResolvedValue({ id: 'manage-1', state: 'created', type: 'OdsManage' });

    const result = await controller.deleteInstance(1, 1, mockEdfiTenant, 55);

    expect(mockJobQueue.send).toHaveBeenCalledWith(
      ODS_MANAGE_CHNL,
      {
        sbEnvironmentId: 2,
        edfiTenantId: 1,
        adminApiJobId: 'DeleteInstanceJob-8_xyz',
        operation: 'delete',
        odsName: 'named-ods',
        odsId: 901,
      },
      { expireInSeconds: 7200, retryLimit: 0 }
    );
    expect(result.syncQueue).toMatchObject({ id: 'manage-1', state: 'created' });
  });

  it('returns {} when queueing the ods-manage job fails', async () => {
    mockSbService.deleteInstance.mockResolvedValue({ jobId: 'DeleteInstanceJob-8_xyz' });
    mockJobQueue.send.mockImplementation((channel: string) =>
      channel === ODS_MANAGE_CHNL ? Promise.reject(new Error('queue down')) : Promise.resolve('sync-1')
    );

    await expect(controller.deleteInstance(1, 1, mockEdfiTenant, 55)).resolves.toEqual({});
  });

  it('without jobId returns {} and queues no ods-manage job', async () => {
    mockSbService.deleteInstance.mockResolvedValue({ jobId: undefined });
    await expect(controller.deleteInstance(1, 1, mockEdfiTenant, 55)).resolves.toEqual({});
    expect(mockJobQueue.send).toHaveBeenCalledTimes(1);
    expect(mockJobQueue.send.mock.calls[0][0]).toBe(ENV_SYNC_CHNL);
  });

  it("throws BadRequestException when the local ODS is not in 'Created' status", async () => {
    mockOdsRepository.findOneBy.mockResolvedValue({ id: 901, instanceManageId: 55, status: 'PendingDelete' });
    await expect(controller.deleteInstance(1, 1, mockEdfiTenant, 55)).rejects.toThrow(
      new BadRequestException("ODS must be in 'Created' status to delete by instanceManageId")
    );
    expect(mockSbService.deleteInstance).not.toHaveBeenCalled();
  });
});

describe('AdminApiControllerV3 - deleteApiClient last-credential guard', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: {
    getApiClient: jest.Mock;
    getApplication: jest.Mock;
    getApiClients: jest.Mock;
    deleteApiClient: jest.Mock;
  };

  const mockEdfiTenant = { id: 1, sbEnvironmentId: 2 } as unknown as EdfiTenant;
  const validIds: Ids = true;

  beforeEach(() => {
    mockSbService = {
      getApiClient: jest.fn().mockResolvedValue({ id: 4, applicationId: 7 }),
      getApplication: jest.fn().mockResolvedValue({
        id: 7,
        educationOrganizationIds: [255901107],
        dataStoreIds: [1],
      }),
      getApiClients: jest.fn(),
      deleteApiClient: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      null as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>
    );
  });

  it('deletes the credential when the Application has more than one', async () => {
    mockSbService.getApiClients.mockResolvedValue([{ id: 4 }, { id: 5 }]);

    await controller.deleteApiClient(3, 1, mockEdfiTenant, 4, validIds);

    expect(mockSbService.getApiClients).toHaveBeenCalledWith(mockEdfiTenant, 7);
    expect(mockSbService.deleteApiClient).toHaveBeenCalledWith(mockEdfiTenant, 4);
  });

  it('rejects with 409 when it is the Application\'s only credential', async () => {
    mockSbService.getApiClients.mockResolvedValue([{ id: 4 }]);

    await expect(
      controller.deleteApiClient(3, 1, mockEdfiTenant, 4, validIds)
    ).rejects.toMatchObject({ status: 409 });
  });

  // The credential-count lookup must stay AFTER the edorg authorization check,
  // so an unauthorized caller cannot use the guard as an oracle for how many
  // credentials an Application has. `validIds = true` short-circuits `checkId`,
  // so the tests above never enter the 403 branch — this one pins the ordering.
  it('rejects with 403 before looking up the credential count when unauthorized', async () => {
    mockSbService.getApiClients.mockResolvedValue([{ id: 4 }]);
    const unauthorized: Ids = new Set<number | string>();

    await expect(
      controller.deleteApiClient(3, 1, mockEdfiTenant, 4, unauthorized)
    ).rejects.toMatchObject({ status: 403 });

    expect(mockSbService.getApiClients).not.toHaveBeenCalled();
    expect(mockSbService.deleteApiClient).not.toHaveBeenCalled();
  });

  // The production guard is `<= 1`, not `=== 1`. An Application with zero
  // credentials should be unreachable through Admin App (AC-616 blocks
  // deleting the last one), but the design doc records it as a real state for
  // Applications orphaned before that guard existed.
  it('rejects with 409 when the Application has no credentials at all', async () => {
    mockSbService.getApiClients.mockResolvedValue([]);

    await expect(
      controller.deleteApiClient(3, 1, mockEdfiTenant, 4, validIds)
    ).rejects.toMatchObject({ status: 409 });

    expect(mockSbService.deleteApiClient).not.toHaveBeenCalled();
  });

  it('does not forward the delete to AdminApi when it rejects', async () => {
    mockSbService.getApiClients.mockResolvedValue([{ id: 4 }]);

    await expect(
      controller.deleteApiClient(3, 1, mockEdfiTenant, 4, validIds)
    ).rejects.toBeInstanceOf(CustomHttpException);
    expect(mockSbService.deleteApiClient).not.toHaveBeenCalled();
  });
});

// AC-630: ADMINAPI-1484 removes dataStoreIds from the Application-level write
// schema on Admin API — data-store assignment is now an apiClient concern.
// putApplication must stop forwarding dataStoreIds to Admin API, and since the
// client no longer submits it, the ODS used for edorg lookup/validation must
// come from the application's existing (unchanged) record instead.
describe('AdminApiControllerV3 - putApplication ODS handling', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: {
    getClaimsetBasic: jest.Mock;
    getApplication: jest.Mock;
    putApplication: jest.Mock;
  };
  let mockEdorgRepository: { findBy: jest.Mock };
  let mockOdsRepository: { findOneBy: jest.Mock };
  let mockIntegrationAppsTeamService: { findOne: jest.Mock };

  const mockEdfiTenant = { id: 1, sbEnvironmentId: 2 } as unknown as EdfiTenant;
  const validIds: Ids = true;

  const existingApplication = {
    id: 9,
    applicationName: 'Existing App',
    educationOrganizationIds: [255901107],
    dataStoreIds: [42],
  } as unknown as GetApplicationDtoV3;

  const requestBody = {
    id: 9,
    applicationName: 'Existing App',
    vendorId: 1,
    claimsetId: 5,
    educationOrganizationIds: [255901107],
    profileIds: [],
  } as unknown as PutApplicationFormDtoV3;

  beforeEach(() => {
    mockSbService = {
      getClaimsetBasic: jest.fn().mockResolvedValue({ _isSystemReserved: false, name: 'Claimset' }),
      getApplication: jest.fn().mockResolvedValue(existingApplication),
      putApplication: jest.fn().mockResolvedValue(undefined),
    };
    mockEdorgRepository = {
      findBy: jest.fn().mockResolvedValue([{ educationOrganizationId: 255901107, odsInstanceId: 42 }]),
    };
    mockOdsRepository = { findOneBy: jest.fn().mockResolvedValue({ id: 7 }) };
    mockIntegrationAppsTeamService = { findOne: jest.fn().mockResolvedValue(null) };

    controller = new AdminApiControllerV3(
      mockIntegrationAppsTeamService as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      mockEdorgRepository as unknown as Repository<Edorg>,
      mockOdsRepository as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>,
    );
  });

  it('derives the ODS instance(s) from the existing application record, not from the request body', async () => {
    await controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds);

    const [callArg] = mockEdorgRepository.findBy.mock.calls[0];
    expect(callArg.odsInstanceId.value).toEqual([42]);
  });

  // Pre-existing (predates AC-630, confirmed on main at 946c2703): the guard
  // compared dto.educationOrganizationIds.length against availableEdorgs.length,
  // but dto.educationOrganizationIds is itself built from
  // availableEdorgs.map(...) — always equal length, so the guard could never
  // fire. A submitted edorg id that doesn't exist under any of the
  // application's data stores fell through to availableEdorgs[0].odsInstanceId
  // with an empty array, throwing an unhandled TypeError (500) instead of a
  // clean 400.
  it('throws a clean validation error (not an unhandled exception) when a submitted edorg does not exist under any of the application\'s data stores', async () => {
    mockEdorgRepository.findBy.mockResolvedValue([]);

    await expect(
      controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds),
    ).rejects.toThrow(
      new ValidationHttpException({
        field: 'edorgIds',
        message: 'One or more invalid education organization IDs',
      }),
    );
  });

  // An Application's dataStoreIds is the union across every one of its
  // credentials (GetDataStoreIdsByApplicationIdQuery on Admin API) — AC-569
  // made multi-credential, multi-store Applications real, so collapsing to
  // dataStoreIds[0] silently drops the other store(s) from edorg validation.
  it('looks up edorgs scoped to every one of the application\'s existing data stores, not just the first', async () => {
    const multiStoreExisting = {
      ...existingApplication,
      dataStoreIds: [42, 99],
    } as unknown as GetApplicationDtoV3;
    mockSbService.getApplication.mockResolvedValue(multiStoreExisting);

    await controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds);

    const [callArg] = mockEdorgRepository.findBy.mock.calls[0];
    expect(callArg.odsInstanceId.value).toEqual([42, 99]);
  });

  it('rejects the edit when the application has no associated data store (e.g. zero credentials)', async () => {
    const noStoreExisting = {
      ...existingApplication,
      dataStoreIds: [],
    } as unknown as GetApplicationDtoV3;
    mockSbService.getApplication.mockResolvedValue(noStoreExisting);

    await expect(
      controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds),
    ).rejects.toThrow(ValidationHttpException);
    expect(mockEdorgRepository.findBy).not.toHaveBeenCalled();
    expect(mockSbService.putApplication).not.toHaveBeenCalled();
  });

  // Editing an Application changes attributes shared across every one of its
  // credentials, regardless of which data store each credential points at —
  // so authorization must cover every existing store, not just the one the
  // submitted edorgs happen to belong to.
  it('rejects the edit when the editor is not authorized on every one of the application\'s existing data stores (not just dataStoreIds[0])', async () => {
    const multiStoreExisting = {
      ...existingApplication,
      // Empty so the pre-check above (line ~362, unmodified) trivially
      // passes regardless of validIds, isolating this test to the
      // post-lookup authorization check this fix touches.
      educationOrganizationIds: [],
      dataStoreIds: [42, 99],
    } as unknown as GetApplicationDtoV3;
    mockSbService.getApplication.mockResolvedValue(multiStoreExisting);
    mockEdorgRepository.findBy.mockResolvedValue([
      { educationOrganizationId: 255901107, odsInstanceId: 99 },
    ]);
    // Authorized for the submitted edorg under store 42 (dataStoreIds[0]) —
    // but not under store 99, which the application also has via another
    // credential. A check that only looked at dataStoreIds[0] would wrongly
    // accept this.
    const partialValidIds: Ids = new Set(['42-255901107']);

    await expect(
      controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, partialValidIds),
    ).rejects.toThrow(
      new ValidationHttpException({
        field: 'edorgIds',
        message: 'Not authorized on all education organizations',
      }),
    );
  });

  it('accepts the edit when the editor is authorized on every one of the application\'s existing data stores', async () => {
    const multiStoreExisting = {
      ...existingApplication,
      educationOrganizationIds: [],
      dataStoreIds: [42, 99],
    } as unknown as GetApplicationDtoV3;
    mockSbService.getApplication.mockResolvedValue(multiStoreExisting);
    mockEdorgRepository.findBy.mockResolvedValue([
      { educationOrganizationId: 255901107, odsInstanceId: 99 },
    ]);
    const fullValidIds: Ids = new Set(['99-255901107', '42-255901107']);

    await controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, fullValidIds);

    expect(mockSbService.putApplication).toHaveBeenCalled();
  });

  it('does not forward dataStoreIds to Admin API on the outgoing PUT payload', async () => {
    await controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds);

    const [, , sentDto] = mockSbService.putApplication.mock.calls[0];
    expect(sentDto).not.toHaveProperty('dataStoreIds');
  });

  // Admin API's EditApplicationRequest declares [JsonUnmappedMemberHandling.Disallow]
  // (ADMINAPI-1484) and has no ClaimSetId property (only ClaimSetName, a
  // different field) — claimsetId is used internally here to look up the
  // claimset by ID, but was leaking straight through into the outgoing PUT,
  // which Admin API now rejects with a 400 ("malformed JSON").
  it('does not forward extraneous request fields (e.g. claimsetId) to Admin API', async () => {
    await controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds);

    const [, , sentDto] = mockSbService.putApplication.mock.calls[0];
    expect(sentDto).not.toHaveProperty('claimsetId');
  });

  // EditApplicationRequest.Id is required (Admin API guards that it matches
  // the route id) — must survive whatever fixes the claimsetId leak above.
  it('still forwards the application id Admin API requires on the PUT body', async () => {
    await controller.putApplication(1, 1, mockEdfiTenant, 9, requestBody, validIds);

    const [, , sentDto] = mockSbService.putApplication.mock.calls[0];
    expect(sentDto).toHaveProperty('id', 9);
  });
});

describe('AdminApiControllerV3 - putProfile', () => {
  let controller: AdminApiControllerV3;
  let mockSbService: { putProfile: jest.Mock };

  const mockEdfiTenant = {
    id: 1,
    sbEnvironment: { envLabel: 'Test Env' },
  } as unknown as EdfiTenant;

  beforeEach(() => {
    mockSbService = {
      putProfile: jest.fn().mockResolvedValue({ id: 42, name: 'Test Profile' }),
    };
    controller = new AdminApiControllerV3(
      null as unknown as IntegrationAppsTeamService,
      mockSbService as unknown as AdminApiServiceV3,
      null as unknown as Repository<Edorg>,
      null as unknown as Repository<Ods>,
      null as unknown as IJobQueueService,
      null as unknown as Repository<SbSyncQueue>,
    );
  });

  it('forwards the route profileId as the payload id when the transformed body has none', async () => {
    // The global ValidationPipe strips the unexposed `id` from the body (AC-642).
    const profile = { name: 'Test Profile', definition: '<Profile />' } as PutProfileDtoV3;

    await controller.putProfile(1, 1, mockEdfiTenant, 42, profile);

    expect(mockSbService.putProfile).toHaveBeenCalledWith(mockEdfiTenant, 42, {
      name: 'Test Profile',
      definition: '<Profile />',
      id: 42,
    });
  });

  it('uses the route profileId even if the body carries a different id', async () => {
    const profile = { id: 7, name: 'Test Profile', definition: '<Profile />' } as PutProfileDtoV3;

    await controller.putProfile(1, 1, mockEdfiTenant, 42, profile);

    const [, , sentProfile] = mockSbService.putProfile.mock.calls[0];
    expect(sentProfile).toHaveProperty('id', 42);
  });
});
