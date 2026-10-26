import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AreaCatalog,
  CatalogVersion,
  ScenarioCatalog,
  StepCatalog,
  StepParameterCatalog,
} from '@edanalytics/models-server';
import { CatalogQueryService } from './catalog-query.service';
import { CatalogService } from './catalog.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatalogVersion,
      AreaCatalog,
      ScenarioCatalog,
      StepCatalog,
      StepParameterCatalog,
    ]),
  ],
  providers: [CatalogService, CatalogQueryService],
  exports: [CatalogService, CatalogQueryService],
})
export class CatalogModule {}
