import 'reflect-metadata';
import {
  toCertificationAreaDto,
  toCertificationCatalogVersionDto,
  toCertificationStepDto,
} from './certification-catalog.dto';

describe('toCertificationCatalogVersionDto', () => {
  it('drops importedAt and keeps the version fields', () => {
    const dto = toCertificationCatalogVersionDto({
      catalogVersionId: 1,
      artifactVersion: '2.1.0',
      dataStandardVersion: 'v5',
      importedAt: new Date('2026-10-01T00:00:00Z'),
      isActive: true,
    } as never);
    expect(dto).toEqual({
      catalogVersionId: 1,
      artifactVersion: '2.1.0',
      dataStandardVersion: 'v5',
      isActive: true,
    });
  });
});

describe('toCertificationAreaDto', () => {
  it('keeps nested scenarios and drops isEnabled', () => {
    const dto = toCertificationAreaDto({
      areaId: 3,
      catalogVersionId: 1,
      name: 'StudentEnrollment',
      displayName: 'Student Enrollment',
      displayOrder: 1,
      isEnabled: true,
      scenarios: [
        {
          scenarioId: 7,
          areaId: 3,
          name: '01-FirstStudent',
          displayName: '01 - 1st Student is valid',
          displayOrder: 1,
          isEnabled: true,
        },
      ],
    } as never);
    expect(JSON.parse(JSON.stringify(dto))).toEqual({
      areaId: 3,
      catalogVersionId: 1,
      name: 'StudentEnrollment',
      displayName: 'Student Enrollment',
      displayOrder: 1,
      scenarios: [
        {
          scenarioId: 7,
          areaId: 3,
          name: '01-FirstStudent',
          displayName: '01 - 1st Student is valid',
          displayOrder: 1,
        },
      ],
    });
  });
});

describe('toCertificationStepDto', () => {
  it('keeps nested parameters and drops isEnabled and stepId on parameters', () => {
    const dto = toCertificationStepDto({
      stepId: 11,
      scenarioId: 7,
      stepName: 'Create Student',
      displayName: 'Create Student',
      stepType: 'CREATE',
      displayOrder: 1,
      isEnabled: true,
      parameters: [
        { parameterId: 21, stepId: 11, type: 'input', name: 'studentUniqueId', description: null },
      ],
    } as never);
    expect(JSON.parse(JSON.stringify(dto))).toEqual({
      stepId: 11,
      scenarioId: 7,
      stepName: 'Create Student',
      displayName: 'Create Student',
      stepType: 'CREATE',
      displayOrder: 1,
      parameters: [{ parameterId: 21, type: 'input', name: 'studentUniqueId', description: null }],
    });
  });
});
