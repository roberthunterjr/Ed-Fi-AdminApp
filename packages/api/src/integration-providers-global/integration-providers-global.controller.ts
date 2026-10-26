import {
  PutIntegrationProviderDto,
  PostIntegrationProviderDto,
  toGetIntegrationProviderDto,
  GetSessionDataDto,
} from '@edanalytics/models';
import { addUserCreating, addUserModifying, IntegrationAppDetailed, IntegrationProvider, Ownership } from '@edanalytics/models-server';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditDelete } from '../audit/audit-delete.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ValidationHttpException, throwNotFound, withoutId } from '../utils';
import { Authorize } from '../auth/authorization';
import { ReqUser } from '../auth/helpers/user.decorator';

@ApiTags('IntegrationProvider - Global')
@Controller()
export class IntegrationProvidersGlobalController {
  constructor(
    @InjectRepository(IntegrationProvider)
    private integrationProvidersRepository: Repository<IntegrationProvider>,
    @InjectRepository(IntegrationAppDetailed)
    private integrationAppsDetailedRepository: Repository<IntegrationAppDetailed>,
    @InjectRepository(Ownership)
    private ownershipsViewRepository: Repository<Ownership>
  ) {}

  async getOneIntegrationAppCount(integrationProviderId: number) {
    return await this.integrationAppsDetailedRepository.count({
      where: { integrationProviderId },
    });
  }

  async getManyIntegrationAppCounts() {
    const appCounts = await this.integrationAppsDetailedRepository
      .createQueryBuilder('app')
      .select('app.integrationProviderId, COUNT(app.id) AS "appCount"')
      .groupBy('app.integrationProviderId')
      .getRawMany();

    return appCounts.reduce((object, { integrationProviderId, appCount }) => {
      object[integrationProviderId] = Number(appCount);
      return object;
    }, {});
  }

  @Post()
  @Authorize({
    privilege: 'integration-provider:create',
    subject: { id: '__filtered__' },
  })
  async create(
    @Body() createIntegrationProviderDto: PostIntegrationProviderDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    try {
      return toGetIntegrationProviderDto(
        await this.integrationProvidersRepository.save(
          this.integrationProvidersRepository.create(addUserCreating(withoutId(createIntegrationProviderDto), user))
        )
      );
    } catch (error) {
      console.log('error', error);
      if (error?.code === '23505') {
        throw new ValidationHttpException({
          field: 'name',
          message: 'Integration provider with that name already exists',
        });
      }
      throw error;
    }
  }

  async findOne(id: number) {
    const integrationProvider = await this.integrationProvidersRepository
      .findOneByOrFail({ id })
      .catch(throwNotFound);
    const integrationAppCount = await this.getOneIntegrationAppCount(integrationProvider.id);
    integrationProvider.appCount = integrationAppCount;
    return integrationProvider;
  }

  @Get()
  @Authorize({
    privilege: 'integration-provider:read',
    subject: { id: '__filtered__' },
  })
  async find(@Query('id') id?: number, @Query('teamId') teamId?: number) {
    if (id) {
      return toGetIntegrationProviderDto(await this.findOne(id));
    }

    if (teamId) {
      const ownerships = await this.ownershipsViewRepository.find({
        where: { teamId, integrationProviderId: Not(IsNull()) },
      });
      const providerIds = ownerships.map((ownership) => ownership.integrationProviderId);
      return toGetIntegrationProviderDto(
        await this.integrationProvidersRepository.find({ where: { id: In(providerIds) } })
      );
    }

    const appCounts = await this.getManyIntegrationAppCounts();
    const integrationProviders = await this.integrationProvidersRepository.find();
    integrationProviders.forEach((provider) => {
      provider.appCount = appCounts[provider.id] || 0;
    });

    return toGetIntegrationProviderDto(integrationProviders);
  }

  @Put(':id')
  @Authorize({
    privilege: 'integration-provider:update',
    subject: { id: '__filtered__' },
  })
  async update(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() updateIntegrationProviderDto: PutIntegrationProviderDto,
    @ReqUser() user: GetSessionDataDto
  ) {
    const old = await this.findOne(id);
    return toGetIntegrationProviderDto(
      await this.integrationProvidersRepository.save({
        ...old,
        ...addUserModifying(updateIntegrationProviderDto, user),
      })
    );
  }

  @Delete(':id')
  @AuditDelete(IntegrationProvider, 'id')
  @Authorize({
    privilege: 'integration-provider:delete',
    subject: { id: '__filtered__' },
  })
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    const old = await this.findOne(id).catch(throwNotFound);
    const integrationAppCount = await this.getOneIntegrationAppCount(old.id);
    if (integrationAppCount > 0) {
      throw new HttpException(
        'This Integration Provider has associated applications and cannot be deleted',
        400
      );
    }
    await this.integrationProvidersRepository.remove(old);
    return undefined;
  }
}
