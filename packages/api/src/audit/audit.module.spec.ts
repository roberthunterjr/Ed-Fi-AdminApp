import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLog } from '@edanalytics/models-server';
import { DataSource } from 'typeorm';
import { AuditEvent } from './audit-event';
import { AuditEventRecorder } from './audit-event.recorder';
import { AuditLogWriter } from './audit-log.writer';
import { auditProviders, isAuditEnabled } from './audit.module';

describe('AuditModule', () => {
  it('shares one queue between recorder and writer', async () => {
    const repo = { insert: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...auditProviders,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    const recorder = moduleRef.get(AuditEventRecorder);
    const writer = moduleRef.get(AuditLogWriter);
    expect(recorder).toBeDefined();
    expect(writer).toBeDefined();

    recorder.record({
      actorUsername: 'alice',
      httpUrl: '/x?y=1',
    } as unknown as AuditEvent);
    await writer.flush();

    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert.mock.calls[0][0]).toHaveLength(1);
  });

  describe('isAuditEnabled', () => {
    it.each([
      [undefined, true],
      [true, true],
      ['true', true],
      [false, false],
      ['false', false],
      ['FALSE', false],
      [' False ', false],
      ['TRUE', true],
      ['1', true],
      ['yes', true],
      ['', true],
    ])('%p -> %p', (value, expected) => {
      expect(isAuditEnabled(value)).toBe(expected);
    });
  });
});
