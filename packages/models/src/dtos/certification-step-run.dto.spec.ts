import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  isSupportedSisVersion,
  PostCertificationStepRunDto,
  SUPPORTED_SIS_VERSIONS,
  toCertificationStepRunDto,
  toCertificationStepRunsDto,
  toCertificationStepSnapshotDto,
} from './certification-step-run.dto';

const missingMiddleName = {
  kind: 'assertion' as const,
  field: 'middleName',
  expected: 'Text, not empty',
  observed: 'Missing',
  message: 'expected undefined to be a string',
};

// Same transform options as the API's global ValidationPipe.
const toDto = (plain: object) =>
  plainToInstance(PostCertificationStepRunDto, plain, {
    excludeExtraneousValues: true,
    exposeUnsetFields: false,
  });

const invalidProperties = (plain: object) => validateSync(toDto(plain)).map((e) => e.property);

describe('certification step run DTOs', () => {
  it('supports only SIS v5 for now', () => {
    expect(SUPPORTED_SIS_VERSIONS).toEqual(['v5']);
    expect(isSupportedSisVersion('v5')).toBe(true);
    expect(isSupportedSisVersion('v4')).toBe(false);
  });

  it('accepts a valid body, keeps the inputs object and drops unknown keys', () => {
    const dto = toDto({
      odsId: '5',
      token: 'abc.DEF-123_~',
      inputs: { studentUniqueId: '604822' },
      extra: 'dropped',
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto).toEqual({ odsId: 5, token: 'abc.DEF-123_~', inputs: { studentUniqueId: '604822' } });
  });

  it.each(['', 'has space', 'line\nbreak', 'x'.repeat(4097)])('rejects token %j', (token) => {
    expect(invalidProperties({ token, inputs: {} })).toContain('token');
  });

  it('requires inputs to be an object', () => {
    expect(invalidProperties({ token: 't', inputs: 'nope' })).toContain('inputs');
  });

  it('serializes a run result with its errors', () => {
    const result = toCertificationStepRunDto({
      stepId: 3,
      status: 'failed',
      ranAt: '2026-10-12T20:00:00.000Z',
      scenarioStatus: 'failed',
      responseStatus: 200,
      errors: [missingMiddleName],
    });
    expect(result).toEqual({
      stepId: 3,
      status: 'failed',
      ranAt: '2026-10-12T20:00:00.000Z',
      scenarioStatus: 'failed',
      responseStatus: 200,
      errors: [missingMiddleName],
    });
  });

  it('serializes saved step runs, keeping inputs and dropping unknown fields', () => {
    const result = toCertificationStepRunsDto({
      scenarioStatus: 'failed',
      steps: [
        {
          stepId: 12,
          status: 'failed',
          ranAt: '2026-10-15T15:00:00.000Z',
          inputs: { studentUniqueId: '604822' },
          responseStatus: 404,
          errors: [{ ...missingMiddleName, extra: 1 }],
          stepRunId: 99,
        },
      ],
    } as never);
    expect(result).toEqual({
      scenarioStatus: 'failed',
      steps: [
        {
          stepId: 12,
          status: 'failed',
          ranAt: '2026-10-15T15:00:00.000Z',
          inputs: { studentUniqueId: '604822' },
          responseStatus: 404,
          errors: [missingMiddleName],
        },
      ],
    });
  });

  it('serializes a snapshot DTO with its state', () => {
    expect(toCertificationStepSnapshotDto({ state: 'tooLarge', sizeBytes: 81234 })).toEqual({
      state: 'tooLarge',
      sizeBytes: 81234,
    });
  });

  it('serializes an empty saved step-runs result', () => {
    expect(toCertificationStepRunsDto({ scenarioStatus: null, steps: [] })).toEqual({
      scenarioStatus: null,
      steps: [],
    });
  });
});
