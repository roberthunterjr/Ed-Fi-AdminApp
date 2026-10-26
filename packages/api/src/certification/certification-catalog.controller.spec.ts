import { INTERCEPTORS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ParseIntPipe } from '@nestjs/common';
import { SbEnvironmentEdfiTenantInterceptor } from '../app/sb-environment-edfi-tenant.interceptor';
import { AUTHORIZE_KEY } from '../auth/authorization/authorize.decorator';
import { CertificationCatalogController } from './certification-catalog.controller';
import { CertificationSupportInterceptor } from './certification-support.interceptor';

const build = () => {
  const service = {
    findCatalogVersions: jest.fn().mockResolvedValue([
      {
        catalogVersionId: 1,
        artifactVersion: '2.1.0',
        dataStandardVersion: 'v5',
        importedAt: new Date('2026-10-01T00:00:00Z'),
        isActive: true,
      },
    ]),
    findAreasWithScenarios: jest.fn().mockResolvedValue([
      {
        areaId: 3,
        catalogVersionId: 1,
        name: 'Area',
        displayName: 'Area',
        displayOrder: 1,
        isEnabled: true,
        scenarios: [
          {
            scenarioId: 7,
            areaId: 3,
            name: 'Scenario',
            displayName: 'Scenario',
            displayOrder: 1,
            isEnabled: true,
          },
        ],
      },
    ]),
    findStepsWithParameters: jest.fn().mockResolvedValue([
      {
        stepId: 11,
        scenarioId: 7,
        stepName: 'Step',
        displayName: 'Step',
        stepType: 'CREATE',
        displayOrder: 1,
        isEnabled: true,
        parameters: [{ parameterId: 21, stepId: 11, type: 'input', name: 'p', description: null }],
      },
    ]),
  };
  return { service, controller: new CertificationCatalogController(service as never) };
};

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('CertificationCatalogController', () => {
  it('returns catalog versions without importedAt', async () => {
    const { controller } = build();

    expect(plain(await controller.getCatalogVersions(1))).toEqual([
      { catalogVersionId: 1, artifactVersion: '2.1.0', dataStandardVersion: 'v5', isActive: true },
    ]);
  });

  it('passes catalogVersionId to the service and serializes areas with scenarios', async () => {
    const { controller, service } = build();

    const result = plain(await controller.getScenarios(1, 1));

    expect(service.findAreasWithScenarios).toHaveBeenCalledWith(1);
    expect(result[0]).not.toHaveProperty('isEnabled');
    expect(result[0].scenarios[0]).toEqual({
      scenarioId: 7,
      areaId: 3,
      name: 'Scenario',
      displayName: 'Scenario',
      displayOrder: 1,
    });
  });

  it('passes an omitted catalogVersionId through as undefined', async () => {
    const { controller, service } = build();

    await controller.getScenarios(1, undefined);

    expect(service.findAreasWithScenarios).toHaveBeenCalledWith(undefined);
  });

  it('passes scenarioId to the service and serializes steps with parameters', async () => {
    const { controller, service } = build();

    const result = plain(await controller.getSteps(1, 7));

    expect(service.findStepsWithParameters).toHaveBeenCalledWith(7);
    expect(result[0]).not.toHaveProperty('isEnabled');
    expect(result[0].parameters).toEqual([
      { parameterId: 21, type: 'input', name: 'p', description: null },
    ]);
  });

  it('passes an omitted scenarioId through as undefined', async () => {
    const { controller, service } = build();

    await controller.getSteps(1, undefined);

    expect(service.findStepsWithParameters).toHaveBeenCalledWith(undefined);
  });

  it.each(['getCatalogVersions', 'getScenarios', 'getSteps'] as const)(
    '%s is guarded by sb-environment:read on the environment',
    (handler) => {
      expect(
        Reflect.getMetadata(AUTHORIZE_KEY, CertificationCatalogController.prototype[handler]),
      ).toEqual({ privilege: 'sb-environment:read', subject: { id: 'sbEnvironmentId' } });
    },
  );

  it('resolves the environment (unknown -> 404), then refuses unsupported data models', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, CertificationCatalogController)).toEqual([
      SbEnvironmentEdfiTenantInterceptor,
      CertificationSupportInterceptor,
    ]);
  });

  it.each(['getCatalogVersions', 'getScenarios', 'getSteps'] as const)(
    '%s parses sbEnvironmentId as an integer',
    (handler) => {
      const args = Object.values(
        Reflect.getMetadata(ROUTE_ARGS_METADATA, CertificationCatalogController, handler) as Record<
          string,
          { data: unknown; pipes: unknown[] }
        >,
      );
      const param = args.find((arg) => arg.data === 'sbEnvironmentId');
      expect(param?.pipes).toEqual([expect.any(ParseIntPipe)]);
    },
  );
});
