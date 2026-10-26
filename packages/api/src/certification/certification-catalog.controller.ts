import {
  toCertificationAreaDto,
  toCertificationCatalogVersionDto,
  toCertificationStepDto,
} from '@edanalytics/models';
import { Controller, Get, Param, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { SbEnvironmentEdfiTenantInterceptor } from '../app/sb-environment-edfi-tenant.interceptor';
import { Authorize } from '../auth/authorization';
import { CatalogQueryService } from './catalog/catalog-query.service';
import { CertificationSupportInterceptor } from './certification-support.interceptor';

/**
 * Read-only access to the certification catalog synced from the artifact.
 * The catalog is not tenant-specific, so routes are scoped to the environment only.
 * The environment ID is still validated (400) and resolved (404) so an unknown
 * environment doesn't return the catalog, and an environment below Ed-Fi Data Model
 * 5.0.0 is refused (400).
 */
@ApiTags('Certification')
@UseInterceptors(SbEnvironmentEdfiTenantInterceptor, CertificationSupportInterceptor)
@Controller('sb-environments/:sbEnvironmentId/certification')
export class CertificationCatalogController {
  constructor(private readonly catalogQueryService: CatalogQueryService) {}

  @Get('catalog-versions')
  @Authorize({ privilege: 'sb-environment:read', subject: { id: 'sbEnvironmentId' } })
  async getCatalogVersions(@Param('sbEnvironmentId', new ParseIntPipe()) _sbEnvironmentId: number) {
    return toCertificationCatalogVersionDto(await this.catalogQueryService.findCatalogVersions());
  }

  @Get('scenarios')
  @ApiQuery({ name: 'catalogVersionId', required: false, type: Number })
  @Authorize({ privilege: 'sb-environment:read', subject: { id: 'sbEnvironmentId' } })
  async getScenarios(
    @Param('sbEnvironmentId', new ParseIntPipe()) _sbEnvironmentId: number,
    @Query('catalogVersionId', new ParseIntPipe({ optional: true })) catalogVersionId?: number,
  ) {
    return toCertificationAreaDto(
      await this.catalogQueryService.findAreasWithScenarios(catalogVersionId),
    );
  }

  @Get('steps')
  @ApiQuery({ name: 'scenarioId', required: false, type: Number })
  @Authorize({ privilege: 'sb-environment:read', subject: { id: 'sbEnvironmentId' } })
  async getSteps(
    @Param('sbEnvironmentId', new ParseIntPipe()) _sbEnvironmentId: number,
    @Query('scenarioId', new ParseIntPipe({ optional: true })) scenarioId?: number,
  ) {
    return toCertificationStepDto(
      await this.catalogQueryService.findStepsWithParameters(scenarioId),
    );
  }
}
