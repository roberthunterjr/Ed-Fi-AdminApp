import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { ValidationHttpException } from '../utils';
import { CertificationStepRunsService } from './certification-step-runs.service';

describe('CertificationStepRunsService.findStepRuns', () => {
  let scenarioRepository: { findOne: jest.Mock };
  let processRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let processScenarioRepository: { findOne: jest.Mock };
  let stepRunRepository: { find: jest.Mock; findOne: jest.Mock };
  let stepErrorRepository: { find: jest.Mock };
  let service: CertificationStepRunsService;

  const find = (
    overrides: Partial<Parameters<CertificationStepRunsService['findStepRuns']>[0]> = {},
  ) =>
    service.findStepRuns({
      edfiTenantId: 10,
      odsId: 5,
      sisVersion: 'v5',
      scenarioId: 20,
      ...overrides,
    });

  beforeEach(() => {
    scenarioRepository = {
      findOne: jest.fn().mockResolvedValue({
        scenarioId: 20,
        area: {
          catalogVersionId: 3,
          catalogVersion: { catalogVersionId: 3, dataStandardVersion: 'v5' },
        },
      }),
    };
    processRepository = {
      findOne: jest.fn().mockResolvedValue({ certificationProcessId: 7 }),
      create: jest.fn(),
      save: jest.fn(),
    };
    processScenarioRepository = { findOne: jest.fn().mockResolvedValue({ status: 'failed' }) };
    stepRunRepository = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
    stepErrorRepository = { find: jest.fn().mockResolvedValue([]) };
    service = new CertificationStepRunsService(
      scenarioRepository as never,
      processRepository as never,
      processScenarioRepository as never,
      stepRunRepository as never,
      stepErrorRepository as never,
    );
  });

  it("keys the process on the requested scenario's catalog version, the same one runStep uses", async () => {
    await find();

    expect(scenarioRepository.findOne).toHaveBeenCalledWith({
      where: { scenarioId: 20 },
      relations: { area: { catalogVersion: true } },
    });
    expect(processRepository.findOne).toHaveBeenCalledWith({
      where: { edfiTenantId: 10, odsId: 5, catalogVersionId: 3 },
    });
  });

  it('returns no steps when the scenario does not exist', async () => {
    scenarioRepository.findOne.mockResolvedValue(null);

    await expect(find()).resolves.toEqual({ scenarioStatus: null, steps: [] });
    expect(processRepository.findOne).not.toHaveBeenCalled();
  });

  it("returns no steps when the scenario belongs to another SIS version's catalog", async () => {
    scenarioRepository.findOne.mockResolvedValue({
      scenarioId: 20,
      area: {
        catalogVersionId: 9,
        catalogVersion: { catalogVersionId: 9, dataStandardVersion: 'v4' },
      },
    });

    await expect(find()).resolves.toEqual({ scenarioStatus: null, steps: [] });
    expect(processRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns no steps when the process does not exist, without creating one', async () => {
    processRepository.findOne.mockResolvedValue(null);

    await expect(find()).resolves.toEqual({ scenarioStatus: null, steps: [] });
    expect(processRepository.create).not.toHaveBeenCalled();
    expect(processRepository.save).not.toHaveBeenCalled();
    expect(stepRunRepository.find).not.toHaveBeenCalled();
  });

  it('looks the process up with IsNull() when no ODS is chosen', async () => {
    await find({ odsId: null });

    expect(processRepository.findOne).toHaveBeenCalledWith({
      where: { edfiTenantId: 10, odsId: IsNull(), catalogVersionId: 3 },
    });
  });

  it('looks the process up by the chosen ODS', async () => {
    await find();

    expect(processRepository.findOne).toHaveBeenCalledWith({
      where: { edfiTenantId: 10, odsId: 5, catalogVersionId: 3 },
    });
  });

  it('returns saved steps with inputs, ISO ranAt and mapped errors', async () => {
    stepRunRepository.find.mockResolvedValue([
      {
        stepRunId: 55,
        stepId: 101,
        status: 'failed',
        runAt: new Date('2026-10-15T15:00:00.000Z'),
        inputs: { studentUniqueId: 'S1' },
        responseStatus: 404,
      },
      {
        stepRunId: 56,
        stepId: 102,
        status: 'success',
        runAt: new Date('2026-10-15T15:05:00.000Z'),
        inputs: null,
        responseStatus: null,
      },
    ]);
    stepErrorRepository.find.mockResolvedValue([
      {
        stepRunId: 55,
        kind: 'exception',
        field: null,
        expected: null,
        observed: 'The API returned HTTP 404 Not Found.',
        message: 'No Student found',
      },
      {
        stepRunId: 55,
        kind: 'assertion',
        field: 'middleName',
        expected: 'Text, not empty',
        observed: null,
        message: null,
      },
    ]);

    await expect(find()).resolves.toEqual({
      scenarioStatus: 'failed',
      steps: [
        {
          stepId: 101,
          status: 'failed',
          ranAt: '2026-10-15T15:00:00.000Z',
          inputs: { studentUniqueId: 'S1' },
          responseStatus: 404,
          errors: [
            {
              kind: 'exception',
              field: null,
              expected: null,
              observed: 'The API returned HTTP 404 Not Found.',
              message: 'No Student found',
            },
            {
              kind: 'assertion',
              field: 'middleName',
              expected: 'Text, not empty',
              observed: null,
              message: null,
            },
          ],
        },
        {
          stepId: 102,
          status: 'success',
          ranAt: '2026-10-15T15:05:00.000Z',
          inputs: null,
          responseStatus: null,
          errors: [],
        },
      ],
    });
    expect(stepRunRepository.find).toHaveBeenCalledWith({
      where: { certificationProcessId: 7, scenarioId: 20 },
    });
    expect(stepErrorRepository.find).toHaveBeenCalledWith({
      where: { stepRunId: In([55, 56]) },
      order: { errorId: 'ASC' },
    });
    expect(processScenarioRepository.findOne).toHaveBeenCalledWith({
      where: { certificationProcessId: 7, scenarioId: 20 },
    });
  });

  it('returns a null scenario status and skips the error lookup when no step of the scenario ran', async () => {
    processScenarioRepository.findOne.mockResolvedValue(null);

    await expect(find()).resolves.toEqual({ scenarioStatus: null, steps: [] });
    expect(stepErrorRepository.find).not.toHaveBeenCalled();
  });

  it('rejects an unsupported SIS version', async () => {
    await expect(find({ sisVersion: 'v4' })).rejects.toBeInstanceOf(ValidationHttpException);
    expect(scenarioRepository.findOne).not.toHaveBeenCalled();
  });
});

describe('CertificationStepRunsService.findStepSnapshot', () => {
  let stepRunRepository: { findOne: jest.Mock };
  let service: CertificationStepRunsService;

  const findSnapshot = () =>
    service.findStepSnapshot({ edfiTenantId: 10, odsId: 5, sisVersion: 'v5', stepId: 101 });

  beforeEach(() => {
    stepRunRepository = { findOne: jest.fn() };
    service = new CertificationStepRunsService(
      {} as never,
      {} as never,
      {} as never,
      stepRunRepository as never,
      {} as never,
    );
  });

  it("reads only this tenant and ODS's run of the step, selecting the hidden snapshot column", async () => {
    stepRunRepository.findOne.mockResolvedValue({ responseStatus: 200, responseSnapshot: null });

    await findSnapshot();

    expect(stepRunRepository.findOne).toHaveBeenCalledWith({
      where: { stepId: 101, certificationProcess: { edfiTenantId: 10, odsId: 5 } },
      select: { stepRunId: true, responseStatus: true, responseSnapshot: true },
    });
  });

  it('looks the run up with IsNull() when no ODS is chosen', async () => {
    stepRunRepository.findOne.mockResolvedValue({ responseStatus: null, responseSnapshot: null });

    await service.findStepSnapshot({
      edfiTenantId: 10,
      odsId: null,
      sisVersion: 'v5',
      stepId: 101,
    });

    expect(stepRunRepository.findOne.mock.calls[0][0].where.certificationProcess).toEqual({
      edfiTenantId: 10,
      odsId: IsNull(),
    });
  });

  it('returns a stored body', async () => {
    stepRunRepository.findOne.mockResolvedValue({
      responseStatus: 200,
      responseSnapshot: { state: 'body', body: '[]' },
    });

    await expect(findSnapshot()).resolves.toEqual({ state: 'body', body: '[]' });
  });

  it('returns the size of a body that was too large to keep', async () => {
    stepRunRepository.findOne.mockResolvedValue({
      responseStatus: 200,
      responseSnapshot: { state: 'tooLarge', sizeBytes: 81234 },
    });

    await expect(findSnapshot()).resolves.toEqual({ state: 'tooLarge', sizeBytes: 81234 });
  });

  it('returns none when the request was never sent', async () => {
    stepRunRepository.findOne.mockResolvedValue({ responseStatus: null, responseSnapshot: null });

    await expect(findSnapshot()).resolves.toEqual({ state: 'none' });
  });

  it('returns deleted when a response was received but its snapshot was cleared', async () => {
    stepRunRepository.findOne.mockResolvedValue({ responseStatus: 404, responseSnapshot: null });

    await expect(findSnapshot()).resolves.toEqual({ state: 'deleted' });
  });

  it('throws NotFound when the step never ran for this tenant and ODS', async () => {
    stepRunRepository.findOne.mockResolvedValue(null);

    await expect(findSnapshot()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unsupported SIS version', async () => {
    await expect(
      service.findStepSnapshot({ edfiTenantId: 10, odsId: 5, sisVersion: 'v4', stepId: 101 }),
    ).rejects.toBeInstanceOf(ValidationHttpException);
    expect(stepRunRepository.findOne).not.toHaveBeenCalled();
  });
});
