import { ServiceUnavailableException } from '@nestjs/common';
import { HEADERS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { SbEnvironmentEdfiTenantInterceptor } from '../app/sb-environment-edfi-tenant.interceptor';
import { AUTHORIZE_KEY } from '../auth/authorization/authorize.decorator';
import { CertificationSupportInterceptor } from './certification-support.interceptor';
import { CertificationController } from './certification.controller';

describe('CertificationController', () => {
  const sbEnvironment = { id: 1 } as never;
  const edfiTenant = { id: 10, name: 'tenant1' } as never;
  const body = { odsId: 5, token: 't', inputs: { studentUniqueId: 'S1' } };

  it('resolves the environment, then refuses unsupported data models', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, CertificationController)).toEqual([
      SbEnvironmentEdfiTenantInterceptor,
      CertificationSupportInterceptor,
    ]);
  });

  it('passes the route, tenant and body to the service and serializes the result', async () => {
    const service = {
      runStep: jest.fn().mockResolvedValue({
        stepId: 101,
        status: 'success',
        ranAt: '2026-10-12T20:00:00.000Z',
        scenarioStatus: 'inprogress',
        errors: [],
      }),
    };
    const controller = new CertificationController(service as never, {} as never);
    const res = { setHeader: jest.fn() };

    const result = await controller.runStep(
      sbEnvironment,
      edfiTenant,
      'v5',
      101,
      body,
      res as never,
    );

    expect(service.runStep).toHaveBeenCalledWith({
      sbEnvironment,
      edfiTenant,
      sisVersion: 'v5',
      stepId: 101,
      odsId: 5,
      token: 't',
      inputs: { studentUniqueId: 'S1' },
    });
    expect(result).toEqual({
      stepId: 101,
      status: 'success',
      ranAt: '2026-10-12T20:00:00.000Z',
      scenarioStatus: 'inprogress',
      errors: [],
    });
  });

  it('adds Retry-After when the service is temporarily unavailable', async () => {
    const service = {
      runStep: jest.fn().mockRejectedValue(new ServiceUnavailableException('busy')),
    };
    const controller = new CertificationController(service as never, {} as never);
    const res = { setHeader: jest.fn() };

    await expect(
      controller.runStep(sbEnvironment, edfiTenant, 'v5', 101, body, res as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('is guarded by sb-environment:update on the environment', () => {
    expect(Reflect.getMetadata(AUTHORIZE_KEY, CertificationController.prototype.runStep)).toEqual({
      privilege: 'sb-environment:update',
      subject: { id: 'sbEnvironmentId' },
    });
  });

  describe('getStepRuns', () => {
    const stepRuns = { scenarioStatus: null, steps: [] };

    it('passes the tenant, version, scenario and ODS to the step-runs service', async () => {
      const stepRunsService = { findStepRuns: jest.fn().mockResolvedValue(stepRuns) };
      const controller = new CertificationController({} as never, stepRunsService as never);

      await expect(controller.getStepRuns(edfiTenant, 'v5', 52, 5)).resolves.toEqual(stepRuns);
      expect(stepRunsService.findStepRuns).toHaveBeenCalledWith({
        edfiTenantId: 10,
        odsId: 5,
        sisVersion: 'v5',
        scenarioId: 52,
      });
    });

    it('passes a null ODS when none is chosen', async () => {
      const stepRunsService = { findStepRuns: jest.fn().mockResolvedValue(stepRuns) };
      const controller = new CertificationController({} as never, stepRunsService as never);

      await controller.getStepRuns(edfiTenant, 'v5', 52, undefined);
      expect(stepRunsService.findStepRuns).toHaveBeenCalledWith(
        expect.objectContaining({ odsId: null }),
      );
    });

    it('is guarded by sb-environment:read on the environment', () => {
      expect(
        Reflect.getMetadata(AUTHORIZE_KEY, CertificationController.prototype.getStepRuns),
      ).toEqual({
        privilege: 'sb-environment:read',
        subject: { id: 'sbEnvironmentId' },
      });
    });
  });

  describe('getStepSnapshot', () => {
    const snapshot = { state: 'none' };

    it('passes the tenant, version, step and ODS to the step-runs service', async () => {
      const stepRunsService = { findStepSnapshot: jest.fn().mockResolvedValue(snapshot) };
      const controller = new CertificationController({} as never, stepRunsService as never);

      await expect(controller.getStepSnapshot(edfiTenant, 'v5', 101, 5)).resolves.toEqual(snapshot);
      expect(stepRunsService.findStepSnapshot).toHaveBeenCalledWith({
        edfiTenantId: 10,
        odsId: 5,
        sisVersion: 'v5',
        stepId: 101,
      });
    });

    it('passes a null ODS when none is chosen', async () => {
      const stepRunsService = { findStepSnapshot: jest.fn().mockResolvedValue(snapshot) };
      const controller = new CertificationController({} as never, stepRunsService as never);

      await controller.getStepSnapshot(edfiTenant, 'v5', 101, undefined);
      expect(stepRunsService.findStepSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ odsId: null }),
      );
    });

    it('tells browsers and proxies not to keep the decrypted response', () => {
      expect(
        Reflect.getMetadata(HEADERS_METADATA, CertificationController.prototype.getStepSnapshot),
      ).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
    });

    it('is guarded like the step results it belongs to', () => {
      expect(
        Reflect.getMetadata(AUTHORIZE_KEY, CertificationController.prototype.getStepSnapshot),
      ).toEqual(Reflect.getMetadata(AUTHORIZE_KEY, CertificationController.prototype.getStepRuns));
    });
  });
});
