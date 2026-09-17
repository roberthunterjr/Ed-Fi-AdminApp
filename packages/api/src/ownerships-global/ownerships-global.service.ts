import {
  GetUserDto,
  OWNERSHIP_RESOURCE_TYPE,
  PostOwnershipDto,
  PutOwnershipDto,
} from '@edanalytics/models';
import { Ownership } from '@edanalytics/models-server';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import _ from 'lodash';
import { AuthService } from '../auth/auth.service';
import { applyDtoUpdates, throwNotFound } from '../utils';
import { ValidationHttpException } from '../utils/customExceptions';

@Injectable()
export class OwnershipsGlobalService {
  constructor(
    @InjectRepository(Ownership)
    private ownershipsRepository: Repository<Ownership>,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,

    @Inject(AuthService) private readonly authService: AuthService,
  ) {}
  async create(createOwnershipDto: PostOwnershipDto) {
    // TypeORM 1.1.0 throws when a `where` field is `undefined` instead of ignoring it
    // (prior versions silently dropped it). The resource-id fields below are optional
    // depending on `type`, so we must omit the absent ones rather than pass `undefined`.
    const where = _.omitBy(
      {
        teamId: createOwnershipDto.teamId,
        edorgId: createOwnershipDto.edorgId,
        odsId: createOwnershipDto.odsId,
        edfiTenantId: createOwnershipDto.edfiTenantId,
        sbEnvironmentId: createOwnershipDto.sbEnvironmentId,
        integrationProviderId: createOwnershipDto.integrationProviderId,
      },
      _.isUndefined,
    );
    const isRedundant = !!(await this.ownershipsRepository.findBy(where)).length;

    if (isRedundant) {
      throw new ValidationHttpException({
        field: 'teamId',
        message:
          'An ownership already exists for this team\u2013resource combination. To minimize confusion we disallow duplication.',
      });
    }
    const type = createOwnershipDto.type;

    const out = await this.ownershipsRepository.save({
      sbEnvironmentId:
        type === OWNERSHIP_RESOURCE_TYPE.sbEnvironment
          ? createOwnershipDto.sbEnvironmentId
          : undefined,
      edfiTenantId:
        type === OWNERSHIP_RESOURCE_TYPE.edfiTenant ? createOwnershipDto.edfiTenantId : undefined,
      odsId: type === OWNERSHIP_RESOURCE_TYPE.ods ? createOwnershipDto.odsId : undefined,
      edorgId: type === OWNERSHIP_RESOURCE_TYPE.edorg ? createOwnershipDto.edorgId : undefined,
      integrationProviderId:
        type === OWNERSHIP_RESOURCE_TYPE.integrationProvider
          ? createOwnershipDto.integrationProviderId
          : undefined,

      createdById: createOwnershipDto.createdById,
      teamId: createOwnershipDto.teamId,
      roleId: createOwnershipDto.roleId,
    });
    this.authService.reloadTeamOwnershipCache(createOwnershipDto.teamId);
    return out;
  }

  async findOne(id: number) {
    return this.ownershipsRepository.findOneByOrFail({ id });
  }

  async update(id: number, updateOwnershipDto: PutOwnershipDto) {
    const old = await this.findOne(id).catch(throwNotFound);
    const updated = applyDtoUpdates(old, updateOwnershipDto, ['roleId', 'modifiedById']);
    const out = await this.ownershipsRepository.save(updated);
    this.authService.reloadTeamOwnershipCache(old.teamId);
    return out;
  }

  async remove(id: number, _user: GetUserDto) {
    const old = await this.findOne(id).catch(throwNotFound);
    await this.ownershipsRepository.remove(old);
    this.authService.reloadTeamOwnershipCache(old.teamId);
    return undefined;
  }
}
