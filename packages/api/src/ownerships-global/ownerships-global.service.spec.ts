import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken, getRepositoryToken } from '@nestjs/typeorm';
import { Ownership } from '@edanalytics/models-server';
import { AuthService } from '../auth/auth.service';
import { OwnershipsGlobalService } from './ownerships-global.service';
import {
  GetUserDto,
  OWNERSHIP_RESOURCE_TYPE,
  PostOwnershipDto,
  PutOwnershipDto,
} from '@edanalytics/models';

const mockOwnership = { id: 1, teamId: 2, roleId: 3, edorgId: 10 };

const mockRepo = {
  save: jest.fn(async (entity) => ({ ...mockOwnership, ...entity, id: entity.id ?? 1 })),
  findOneByOrFail: jest.fn(async ({ id }) => {
    if (id === 1) return { ...mockOwnership };
    throw new Error('Not found');
  }),
  findBy: jest.fn(async () => []),
  remove: jest.fn(async () => undefined),
};

const mockAuthService = {
  reloadTeamOwnershipCache: jest.fn(),
};

describe('OwnershipsGlobalService', () => {
  let service: OwnershipsGlobalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnershipsGlobalService,
        { provide: getRepositoryToken(Ownership), useValue: mockRepo },
        { provide: getEntityManagerToken(), useValue: {} },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = module.get(OwnershipsGlobalService);
  });

  it('create() throws when duplicate ownership exists', async () => {
    mockRepo.findBy.mockResolvedValueOnce([mockOwnership]);
    const dto = {
      teamId: 2,
      edorgId: 10,
      type: OWNERSHIP_RESOURCE_TYPE.edorg,
      createdById: 1,
      roleId: 3,
    } as unknown as PostOwnershipDto;
    await expect(service.create(dto)).rejects.toThrow();
    // Regression guard for the TypeORM 1.1.0 "where" fix: the conflict check itself must
    // also build the where clause without `undefined` keys, not just the success path.
    expect(mockRepo.findBy).toHaveBeenCalledWith({ teamId: 2, edorgId: 10 });
  });

  it('create() saves a new ownership and reloads cache', async () => {
    const dto = {
      teamId: 2,
      edorgId: 10,
      type: OWNERSHIP_RESOURCE_TYPE.edorg,
      createdById: 1,
      roleId: 3,
      odsId: undefined,
      edfiTenantId: undefined,
      sbEnvironmentId: undefined,
      integrationProviderId: undefined,
    } as unknown as PostOwnershipDto;
    await service.create(dto);
    expect(mockRepo.findBy).toHaveBeenCalledWith({ teamId: 2, edorgId: 10 });
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockAuthService.reloadTeamOwnershipCache).toHaveBeenCalledWith(2);
  });

  // TypeORM 1.1.0 throws on an `undefined` value in a `where` clause. Ownership DTOs only
  // ever populate one of these five optional resource-id fields at a time (per `type`), so
  // each combination below regression-guards that the other four are omitted as keys
  // entirely -- not merely set to `undefined` -- and that the invariant "where is never
  // empty" holds (`teamId` is always present).
  it.each([
    ['edorgId', 10, OWNERSHIP_RESOURCE_TYPE.edorg],
    ['odsId', 20, OWNERSHIP_RESOURCE_TYPE.ods],
    ['edfiTenantId', 30, OWNERSHIP_RESOURCE_TYPE.edfiTenant],
    ['sbEnvironmentId', 40, OWNERSHIP_RESOURCE_TYPE.sbEnvironment],
    ['integrationProviderId', 50, OWNERSHIP_RESOURCE_TYPE.integrationProvider],
  ] as const)(
    'create() builds a where clause with only teamId + %s present (the other resource-id fields omitted, not undefined)',
    async (fieldName, fieldValue, type) => {
      const dto = {
        teamId: 2,
        type,
        createdById: 1,
        roleId: 3,
        [fieldName]: fieldValue,
      } as unknown as PostOwnershipDto;

      await service.create(dto);

      const where = (mockRepo.findBy as jest.Mock).mock.calls[0][0];
      expect(where).toEqual({ teamId: 2, [fieldName]: fieldValue });
      expect(Object.keys(where).sort()).toEqual(['teamId', fieldName].sort());
    },
  );

  it('create() omits all five optional resource-id fields when none are provided, leaving only teamId', async () => {
    const dto = {
      teamId: 2,
      type: OWNERSHIP_RESOURCE_TYPE.edorg,
      createdById: 1,
      roleId: 3,
    } as unknown as PostOwnershipDto;

    await service.create(dto);

    expect(mockRepo.findBy).toHaveBeenCalledWith({ teamId: 2 });
    const where = (mockRepo.findBy as jest.Mock).mock.calls[0][0];
    expect(Object.keys(where)).toEqual(['teamId']);
  });

  it('findOne() returns an ownership by id', async () => {
    const result = await service.findOne(1);
    expect(result).toMatchObject({ id: 1, teamId: 2 });
  });

  it('update() saves updated ownership and reloads cache', async () => {
    const dto: PutOwnershipDto = { id: 1, roleId: 5, modifiedById: 1 };
    await service.update(1, dto);
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockAuthService.reloadTeamOwnershipCache).toHaveBeenCalledWith(2);
  });

  it('remove() removes ownership and reloads cache', async () => {
    const result = await service.remove(1, { id: 99 } as unknown as GetUserDto);
    expect(mockRepo.remove).toHaveBeenCalled();
    expect(mockAuthService.reloadTeamOwnershipCache).toHaveBeenCalledWith(2);
    expect(result).toBeUndefined();
  });

  it('remove() throws NotFoundException when ownership not found', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    await expect(service.remove(999, { id: 1 } as unknown as GetUserDto)).rejects.toThrow(
      NotFoundException,
    );
  });
});
