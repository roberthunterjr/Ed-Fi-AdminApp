import { Repository } from 'typeorm';
import {
  AreaCatalog,
  CatalogVersion,
  ScenarioCatalog,
  StepCatalog,
  StepParameterCatalog,
} from '@edanalytics/models-server';
import { CatalogQueryService } from './catalog-query.service';

const mockRepo = <T>(rows: Partial<T>[] = []) =>
  ({ find: jest.fn().mockResolvedValue(rows) }) as unknown as jest.Mocked<Repository<T>>;

const area = (areaId: number, catalogVersionId = 1): Partial<AreaCatalog> => ({
  areaId,
  catalogVersionId,
  name: `Area${areaId}`,
  displayName: `Area ${areaId}`,
  displayOrder: areaId,
  isEnabled: true,
});

const scenario = (scenarioId: number, areaId: number): Partial<ScenarioCatalog> => ({
  scenarioId,
  areaId,
  name: `Scenario${scenarioId}`,
  displayName: `Scenario ${scenarioId}`,
  displayOrder: scenarioId,
  isEnabled: true,
});

const step = (stepId: number, scenarioId: number): Partial<StepCatalog> => ({
  stepId,
  scenarioId,
  stepName: `Step${stepId}`,
  displayName: `Step ${stepId}`,
  stepType: 'CREATE',
  displayOrder: stepId,
  isEnabled: true,
});

const parameter = (parameterId: number, stepId: number): Partial<StepParameterCatalog> => ({
  parameterId,
  stepId,
  type: 'input',
  name: `param${parameterId}`,
  description: null,
});

const build = (repos: {
  versions?: Partial<CatalogVersion>[];
  areas?: Partial<AreaCatalog>[];
  scenarios?: Partial<ScenarioCatalog>[];
  steps?: Partial<StepCatalog>[];
  parameters?: Partial<StepParameterCatalog>[];
}) => {
  const versionRepo = mockRepo<CatalogVersion>(repos.versions);
  const areaRepo = mockRepo<AreaCatalog>(repos.areas);
  const scenarioRepo = mockRepo<ScenarioCatalog>(repos.scenarios);
  const stepRepo = mockRepo<StepCatalog>(repos.steps);
  const parameterRepo = mockRepo<StepParameterCatalog>(repos.parameters);
  const service = new CatalogQueryService(
    versionRepo,
    areaRepo,
    scenarioRepo,
    stepRepo,
    parameterRepo,
  );
  return { service, versionRepo, areaRepo, scenarioRepo, stepRepo, parameterRepo };
};

describe('CatalogQueryService', () => {
  describe('findCatalogVersions', () => {
    it('returns every catalog version, newest first', async () => {
      const versions = [{ catalogVersionId: 2 }, { catalogVersionId: 1 }];
      const { service, versionRepo } = build({ versions });

      await expect(service.findCatalogVersions()).resolves.toEqual(versions);
      expect(versionRepo.find).toHaveBeenCalledWith({ order: { catalogVersionId: 'DESC' } });
    });
  });

  describe('findAreasWithScenarios', () => {
    it('groups enabled scenarios under their area, preserving order', async () => {
      const { service } = build({
        areas: [area(1), area(2)],
        scenarios: [scenario(10, 1), scenario(20, 2), scenario(11, 1)],
      });

      const result = await service.findAreasWithScenarios(1);

      expect(result.map((a) => a.areaId)).toEqual([1, 2]);
      expect(result[0].scenarios.map((s) => s.scenarioId)).toEqual([10, 11]);
      expect(result[1].scenarios.map((s) => s.scenarioId)).toEqual([20]);
    });

    it('filters areas and scenarios by catalogVersionId and isEnabled when given', async () => {
      const { service, areaRepo, scenarioRepo } = build({ areas: [area(1)] });

      await service.findAreasWithScenarios(5);

      expect(areaRepo.find).toHaveBeenCalledWith({
        where: { isEnabled: true, catalogVersionId: 5 },
        order: { displayOrder: 'ASC', areaId: 'ASC' },
      });
      expect(scenarioRepo.find).toHaveBeenCalledWith({
        where: { isEnabled: true, area: { isEnabled: true, catalogVersionId: 5 } },
        order: { displayOrder: 'ASC', scenarioId: 'ASC' },
      });
    });

    it('does not filter by catalog version when catalogVersionId is omitted', async () => {
      const { service, areaRepo, scenarioRepo } = build({ areas: [area(1, 1), area(2, 2)] });

      await service.findAreasWithScenarios();

      expect(areaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isEnabled: true } }),
      );
      expect(scenarioRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isEnabled: true, area: { isEnabled: true } } }),
      );
    });

    it('returns an area with no scenarios as an empty list', async () => {
      const { service } = build({ areas: [area(1)], scenarios: [] });

      const result = await service.findAreasWithScenarios(1);

      expect(result).toEqual([expect.objectContaining({ areaId: 1, scenarios: [] })]);
    });

    it('returns an empty list and skips the scenario query when no areas match', async () => {
      const { service, scenarioRepo } = build({ areas: [] });

      await expect(service.findAreasWithScenarios(999)).resolves.toEqual([]);
      expect(scenarioRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findStepsWithParameters', () => {
    it('attaches each step its parameters, preserving order', async () => {
      const { service } = build({
        steps: [step(1, 7), step(2, 7)],
        parameters: [parameter(100, 1), parameter(200, 2), parameter(101, 1)],
      });

      const result = await service.findStepsWithParameters(7);

      expect(result.map((s) => s.stepId)).toEqual([1, 2]);
      expect(result[0].parameters.map((p) => p.parameterId)).toEqual([100, 101]);
      expect(result[1].parameters.map((p) => p.parameterId)).toEqual([200]);
    });

    it('filters steps and parameters by scenarioId and the enabled hierarchy when given', async () => {
      const { service, stepRepo, parameterRepo } = build({ steps: [step(1, 7)] });

      await service.findStepsWithParameters(7);

      const enabledParents = { isEnabled: true, area: { isEnabled: true } };
      expect(stepRepo.find).toHaveBeenCalledWith({
        where: { isEnabled: true, scenarioId: 7, scenario: enabledParents },
        order: { displayOrder: 'ASC', stepId: 'ASC' },
      });
      expect(parameterRepo.find).toHaveBeenCalledWith({
        where: { step: { isEnabled: true, scenarioId: 7, scenario: enabledParents } },
        order: { parameterId: 'ASC' },
      });
    });

    it('does not filter by scenario when scenarioId is omitted', async () => {
      const { service, stepRepo } = build({ steps: [step(1, 7), step(2, 8)] });

      const result = await service.findStepsWithParameters();

      expect(stepRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isEnabled: true,
            scenario: { isEnabled: true, area: { isEnabled: true } },
          },
        }),
      );
      expect(result.map((s) => s.stepId)).toEqual([1, 2]);
    });

    it('returns an empty list and skips the parameter query when no steps match', async () => {
      const { service, parameterRepo } = build({ steps: [] });

      await expect(service.findStepsWithParameters(999)).resolves.toEqual([]);
      expect(parameterRepo.find).not.toHaveBeenCalled();
    });
  });
});
