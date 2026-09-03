import { AddEdorgDtoV2 } from '@edanalytics/models';
import { EdfiTenant, Edorg, SbEnvironment, regarding } from '@edanalytics/models-server';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomHttpException, ValidationHttpException } from '../../../utils';
import { StartingBlocksServiceV2 } from '../starting-blocks';

@Injectable()
export class EdorgsService {
  constructor(
    @InjectRepository(Edorg)
    private edorgsRepository: Repository<Edorg>,
    private sbServiceV2: StartingBlocksServiceV2
  ) {}

  findAll(edfiTenantId: EdfiTenant['id']) {
    return this.edorgsRepository.findBy({ edfiTenantId });
  }

  findOne(id: number) {
    return this.edorgsRepository.findOneBy({ id });
  }

  async add(sbEnvironment: SbEnvironment, edfiTenant: EdfiTenant, dto: AddEdorgDtoV2) {
    const addResult = await this.sbServiceV2.createEdorg(sbEnvironment, edfiTenant, dto);

    if (addResult.status === 'ALREADY_EXISTS') {
      throw new ValidationHttpException({
        field: 'EdOrgId',
        message: 'Education organization already exists in ODS',
      });
    }
    if (addResult.status === 'NO_CONFIG') {
      throw new CustomHttpException(
        {
          title: 'Bad system configuration',
          message: 'Check function ARNs or report this error.',
          type: 'Error',
          regarding: regarding(edfiTenant),
        },
        500
      );
    }
    if (addResult.status !== 'SUCCESS') {
      throw new CustomHttpException(
        {
          title: 'Failed to add education organization',
          message: addResult.data?.errorMessage,
          type: 'Error',
          regarding: regarding(edfiTenant),
        },
        500
      );
    }
    return undefined;
  }

  async remove(
    sbEnvironment: SbEnvironment,
    edfiTenant: EdfiTenant,
    odsName: string,
    educationOrganizationId: string
  ) {
    const addResult = await this.sbServiceV2.deleteEdorg(
      sbEnvironment,
      edfiTenant,
      odsName,
      educationOrganizationId
    );

    if (addResult.status !== 'SUCCESS') {
      throw new CustomHttpException(
        {
          title: 'Failed to remove education organization',
          message: addResult.data?.errorMessage,
          type: 'Error',
          regarding: regarding(edfiTenant),
        },
        500
      );
    }
    return undefined;
  }
}
