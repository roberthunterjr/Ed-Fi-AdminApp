import { Expose, Type } from 'class-transformer';
import { makeSerializer } from '../utils/make-serializer';

/** Row of GET .../certification/catalog-versions. `importedAt` is intentionally not exposed. */
export class CertificationCatalogVersionDto {
  @Expose()
  catalogVersionId: number;

  @Expose()
  artifactVersion: string;

  @Expose()
  dataStandardVersion: string;

  @Expose()
  isActive: boolean;
}

export class CertificationScenarioDto {
  @Expose()
  scenarioId: number;

  @Expose()
  areaId: number;

  @Expose()
  name: string;

  @Expose()
  displayName: string | null;

  @Expose()
  displayOrder: number;
}

/** Row of GET .../certification/scenarios: an area with its enabled scenarios. */
export class CertificationAreaDto {
  @Expose()
  areaId: number;

  @Expose()
  catalogVersionId: number;

  @Expose()
  name: string;

  @Expose()
  displayName: string | null;

  @Expose()
  displayOrder: number;

  @Expose()
  @Type(() => CertificationScenarioDto)
  scenarios: CertificationScenarioDto[];
}

export class CertificationStepParameterDto {
  @Expose()
  parameterId: number;

  @Expose()
  type: string;

  @Expose()
  name: string;

  @Expose()
  description: string | null;
}

/** Row of GET .../certification/steps: a step with its parameters. */
export class CertificationStepDto {
  @Expose()
  stepId: number;

  @Expose()
  scenarioId: number;

  @Expose()
  stepName: string;

  @Expose()
  displayName: string | null;

  @Expose()
  stepType: string;

  @Expose()
  displayOrder: number;

  @Expose()
  @Type(() => CertificationStepParameterDto)
  parameters: CertificationStepParameterDto[];
}

export const toCertificationCatalogVersionDto = makeSerializer<
  CertificationCatalogVersionDto,
  CertificationCatalogVersionDto
>(CertificationCatalogVersionDto);

export const toCertificationAreaDto = makeSerializer<CertificationAreaDto, CertificationAreaDto>(
  CertificationAreaDto,
);

export const toCertificationStepDto = makeSerializer<CertificationStepDto, CertificationStepDto>(
  CertificationStepDto,
);
