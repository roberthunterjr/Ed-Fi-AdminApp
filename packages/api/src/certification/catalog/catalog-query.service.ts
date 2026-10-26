import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AreaCatalog,
  CatalogVersion,
  ScenarioCatalog,
  StepCatalog,
  StepParameterCatalog,
} from '@edanalytics/models-server';

export type AreaWithScenarios = AreaCatalog & { scenarios: ScenarioCatalog[] };
export type StepWithParameters = StepCatalog & { parameters: StepParameterCatalog[] };

/**
 * Read-only queries over the certification catalog synced by CatalogService.
 * Disabled areas, scenarios and steps (and anything beneath them) are excluded.
 * Children are filtered through their parent relations rather than an `IN (...)`
 * list of ids, so an unfiltered request stays within MSSQL's parameter limit.
 */
@Injectable()
export class CatalogQueryService {
  constructor(
    @InjectRepository(CatalogVersion)
    private readonly catalogVersionRepo: Repository<CatalogVersion>,
    @InjectRepository(AreaCatalog)
    private readonly areaRepo: Repository<AreaCatalog>,
    @InjectRepository(ScenarioCatalog)
    private readonly scenarioRepo: Repository<ScenarioCatalog>,
    @InjectRepository(StepCatalog)
    private readonly stepRepo: Repository<StepCatalog>,
    @InjectRepository(StepParameterCatalog)
    private readonly parameterRepo: Repository<StepParameterCatalog>,
  ) {}

  findCatalogVersions(): Promise<CatalogVersion[]> {
    return this.catalogVersionRepo.find({ order: { catalogVersionId: 'DESC' } });
  }

  async findAreasWithScenarios(catalogVersionId?: number): Promise<AreaWithScenarios[]> {
    const areaWhere = {
      isEnabled: true,
      ...(catalogVersionId !== undefined && { catalogVersionId }),
    };

    const areas = await this.areaRepo.find({
      where: areaWhere,
      order: { displayOrder: 'ASC', areaId: 'ASC' },
    });
    if (areas.length === 0) return [];

    const scenarios = await this.scenarioRepo.find({
      where: { isEnabled: true, area: areaWhere },
      order: { displayOrder: 'ASC', scenarioId: 'ASC' },
    });

    const byArea = groupBy(scenarios, (s) => s.areaId);
    return areas.map((area) => ({ ...area, scenarios: byArea.get(area.areaId) ?? [] }));
  }

  async findStepsWithParameters(scenarioId?: number): Promise<StepWithParameters[]> {
    const stepWhere = {
      isEnabled: true,
      ...(scenarioId !== undefined && { scenarioId }),
      scenario: { isEnabled: true, area: { isEnabled: true } },
    };

    const steps = await this.stepRepo.find({
      where: stepWhere,
      order: { displayOrder: 'ASC', stepId: 'ASC' },
    });
    if (steps.length === 0) return [];

    const parameters = await this.parameterRepo.find({
      where: { step: stepWhere },
      order: { parameterId: 'ASC' },
    });

    const byStep = groupBy(parameters, (p) => p.stepId);
    return steps.map((step) => ({ ...step, parameters: byStep.get(step.stepId) ?? [] }));
  }
}

const groupBy = <T>(rows: T[], key: (row: T) => number): Map<number, T[]> => {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
};
