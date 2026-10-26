import 'reflect-metadata';
import { EntityManager, In, Repository } from 'typeorm';
import { CertificationProcess, EdfiTenant, Edorg, Ods } from '@edanalytics/models-server';
import {
  computeOdsListDeltas,
  persistSyncDeleteOds,
  persistSyncTenant,
  SyncableOds,
} from './sync-ods';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTenant = (overrides: Partial<EdfiTenant> = {}): EdfiTenant =>
  ({ id: 1, sbEnvironmentId: 10, name: 'default', ...overrides } as EdfiTenant);

const makeOds = (overrides: Partial<Ods>): Ods => ({
  id: undefined,
  dbName: 'ods_db',
  odsInstanceId: null,
  odsInstanceName: null,
  edfiTenantId: 1,
  sbEnvironmentId: 10,
  ...overrides,
} as unknown as Ods);

const makeEntityManager = (createdOds: Partial<Ods> = {}): jest.Mocked<EntityManager> => {
  const odsRepo = {
    create: jest.fn((data) => ({ ...data, ...createdOds })),
  } as unknown as jest.Mocked<Repository<Ods>>;
  return {
    getRepository: jest.fn().mockReturnValue(odsRepo),
  } as unknown as jest.Mocked<EntityManager>;
};

// ---------------------------------------------------------------------------
// computeOdsListDeltas — id-based path (V2 / non-SB V1 from form)
// ---------------------------------------------------------------------------

describe('computeOdsListDeltas — id-based ODS (non-SB V1 / V2)', () => {
  const tenant = makeTenant();

  it('inserts a new ODS when no existing ODS match by odsInstanceId', () => {
    const incoming: SyncableOds[] = [{ id: 5, name: 'ODS Five', dbName: 'ods_five', edorgs: [] }];
    const existing: Ods[] = [];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, existing, tenant, em);

    expect(result.insert).toHaveLength(1);
    expect(result.insert[0]).toMatchObject({ dbName: 'ods_five', odsInstanceId: 5, odsInstanceName: 'ODS Five' });
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('updates an existing ODS when dbName changes', () => {
    const existingOds = makeOds({ id: 1, odsInstanceId: 5, odsInstanceName: 'Old Name', dbName: 'old_db' });
    const incoming: SyncableOds[] = [{ id: 5, name: 'Old Name', dbName: 'new_db' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.update).toHaveLength(1);
    expect(result.update[0].dbName).toBe('new_db');
    expect(result.insert).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('updates an existing ODS when name changes', () => {
    const existingOds = makeOds({ id: 1, odsInstanceId: 5, odsInstanceName: 'Old Name', dbName: 'ods_db' });
    const incoming: SyncableOds[] = [{ id: 5, name: 'New Name', dbName: 'ods_db' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.update).toHaveLength(1);
    expect(result.update[0].odsInstanceName).toBe('New Name');
  });

  it('produces no delta when ODS is unchanged', () => {
    const existingOds = makeOds({ id: 1, odsInstanceId: 5, odsInstanceName: 'Same Name', dbName: 'ods_db' });
    const incoming: SyncableOds[] = [{ id: 5, name: 'Same Name', dbName: 'ods_db' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.insert).toHaveLength(0);
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('marks existing ODS for deletion when not present in incoming list', () => {
    const existingOds = makeOds({ id: 7, odsInstanceId: 99, odsInstanceName: 'Gone', dbName: 'gone_db' });
    const incoming: SyncableOds[] = [];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.delete).toContain(7);
  });

  it('updates an existing ODS when status changes', () => {
    const existingOds = makeOds({ id: 1, odsInstanceId: 5, odsInstanceName: 'ODS', dbName: 'ods_db', status: 'active' });
    const incoming: SyncableOds[] = [{ id: 5, name: 'ODS', dbName: 'ods_db', status: 'inactive' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.update).toHaveLength(1);
    expect(result.update[0].status).toBe('inactive');
    expect(result.insert).toHaveLength(0);
  });

  it('updates an existing ODS when databaseTemplate changes', () => {
    const existingOds = makeOds({ id: 1, odsInstanceId: 5, odsInstanceName: 'ODS', dbName: 'ods_db', databaseTemplate: 'template_a' });
    const incoming: SyncableOds[] = [{ id: 5, name: 'ODS', dbName: 'ods_db', databaseTemplate: 'template_b' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.update).toHaveLength(1);
    expect(result.update[0].databaseTemplate).toBe('template_b');
  });

  it('updates an existing ODS when databaseName changes', () => {
    const existingOds = makeOds({ id: 1, odsInstanceId: 5, odsInstanceName: 'ODS', dbName: 'ods_db', databaseName: 'db_old' });
    const incoming: SyncableOds[] = [{ id: 5, name: 'ODS', dbName: 'ods_db', databaseName: 'db_new' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.update).toHaveLength(1);
    expect(result.update[0].databaseName).toBe('db_new');
  });

  it('produces no delta when all new fields are unchanged', () => {
    const existingOds = makeOds({
      id: 1, odsInstanceId: 5, odsInstanceName: 'ODS', dbName: 'ods_db',
      status: 'active', databaseTemplate: 'template_a', databaseName: 'db_one',
    });
    const incoming: SyncableOds[] = [{
      id: 5, name: 'ODS', dbName: 'ods_db',
      status: 'active', databaseTemplate: 'template_a', databaseName: 'db_one',
    }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.insert).toHaveLength(0);
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('produces no delta when existing fields are null and incoming fields are undefined', () => {
    const existingOds = makeOds({
      id: 1, odsInstanceId: 5, odsInstanceName: 'ODS', dbName: 'ods_db',
      status: null, databaseTemplate: null, databaseName: null, instanceManageId: null,
    });
    const incoming: SyncableOds[] = [{ id: 5, name: 'ODS', dbName: 'ods_db' }]; // fields absent
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.insert).toHaveLength(0);
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('updates an existing ODS when instanceManageId changes', () => {
    const existingOds = makeOds({
      id: 1, odsInstanceId: 5, odsInstanceName: 'ODS', dbName: 'ods_db', instanceManageId: 100,
    });
    const incoming: SyncableOds[] = [{ id: 5, name: 'ODS', dbName: 'ods_db', instanceManageId: 200 }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.update).toHaveLength(1);
    expect(result.update[0].instanceManageId).toBe(200);
    expect(result.insert).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeOdsListDeltas — dbName-based path (SB V1 Lambda — no odsInstanceId)
// ---------------------------------------------------------------------------

describe('computeOdsListDeltas — dbName-based ODS (SB V1 Lambda)', () => {
  const tenant = makeTenant();

  it('inserts a new ODS when id is null and no existing record matches by dbName', () => {
    const incoming: SyncableOds[] = [{ id: null, name: null, dbName: 'ods_alpha', edorgs: [] }];
    const existing: Ods[] = [];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, existing, tenant, em);

    expect(result.insert).toHaveLength(1);
    expect(result.insert[0]).toMatchObject({ dbName: 'ods_alpha', odsInstanceId: null });
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('does NOT delete an existing null-id ODS that is still present in incoming list', () => {
    const existingOds = makeOds({ id: 3, odsInstanceId: null, odsInstanceName: null, dbName: 'ods_alpha' });
    const incoming: SyncableOds[] = [{ id: null, name: null, dbName: 'ods_alpha' }];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.delete).not.toContain(3);
    expect(result.insert).toHaveLength(0);
  });

  it('marks an existing null-id ODS for deletion when it is no longer in incoming list', () => {
    const existingOds = makeOds({ id: 3, odsInstanceId: null, odsInstanceName: null, dbName: 'ods_old' });
    const incoming: SyncableOds[] = [];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.delete).toContain(3);
  });

  it('deletes an existing id-based ODS when there is no incoming counterpart', () => {
    // An existing ODS row that has an odsInstanceId but no matching incoming entry
    // should be marked for deletion — it is stale and the API no longer reports it.
    const existingOds = makeOds({ id: 42, odsInstanceId: 7, odsInstanceName: 'Keep Me', dbName: 'keep_db' });
    const incoming: SyncableOds[] = [];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    // No incoming counterpart → should be deleted
    expect(result.delete).toContain(42);
  });

  it('handles mixed id-based and null-id ODS in the same call', () => {
    const existingIdBased = makeOds({ id: 10, odsInstanceId: 1, odsInstanceName: 'Named', dbName: 'id_db' });
    const existingDbBased = makeOds({ id: 20, odsInstanceId: null, odsInstanceName: null, dbName: 'db_only' });

    const incoming: SyncableOds[] = [
      { id: 1, name: 'Named', dbName: 'id_db' },   // id-based — unchanged
      { id: null, name: null, dbName: 'db_only' },  // dbName-based — unchanged
    ];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingIdBased, existingDbBased], tenant, em);

    expect(result.insert).toHaveLength(0);
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('produces no delta when existing fields are null and incoming fields are undefined (dbName path)', () => {
    const existingOds = makeOds({
      id: 3, odsInstanceId: null, odsInstanceName: null, dbName: 'ods_alpha',
      status: null, databaseTemplate: null, databaseName: null, instanceManageId: null,
    });
    const incoming: SyncableOds[] = [{ id: null, name: null, dbName: 'ods_alpha' }]; // new fields absent
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [existingOds], tenant, em);

    expect(result.insert).toHaveLength(0);
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('computeOdsListDeltas — edge cases', () => {
  it('handles empty incoming and empty existing lists gracefully', () => {
    const result = computeOdsListDeltas([], [], makeTenant(), makeEntityManager());
    expect(result.insert).toHaveLength(0);
    expect(result.update).toHaveLength(0);
    expect(result.delete).toHaveLength(0);
  });

  it('inserts multiple ODS of the same type correctly', () => {
    const incoming: SyncableOds[] = [
      { id: 1, name: 'ODS A', dbName: 'ods_a' },
      { id: 2, name: 'ODS B', dbName: 'ods_b' },
    ];
    const em = makeEntityManager();

    const result = computeOdsListDeltas(incoming, [], makeTenant(), em);

    expect(result.insert).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// MSSQL: certification_process.odsId does not cascade, so processes go first
// ---------------------------------------------------------------------------

const makeRecordingEntityManager = (odsRows: Partial<Ods>[] = []) => {
  const repos: Record<string, Record<string, jest.Mock>> = {
    [Ods.name]: {
      find: jest.fn().mockResolvedValue(odsRows),
      save: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
    },
    [Edorg.name]: {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    },
    [CertificationProcess.name]: { delete: jest.fn().mockResolvedValue({ affected: 1 }) },
  };
  const em = {
    getRepository: jest.fn((entity: { name: string }) => repos[entity.name]),
  } as unknown as EntityManager;
  return { em, repos };
};

const calledBefore = (first: jest.Mock, second: jest.Mock) =>
  first.mock.invocationCallOrder[0] < second.mock.invocationCallOrder[0];

describe('persistSyncTenant - removed ODS', () => {
  it('deletes the removed ODS certification processes before the ODS rows', async () => {
    const { em, repos } = makeRecordingEntityManager([
      makeOds({ id: 42, odsInstanceId: 7 }),
      makeOds({ id: 43, odsInstanceId: 8 }),
    ]);

    await persistSyncTenant({
      em,
      edfiTenant: makeTenant(),
      odss: [{ id: 8, name: 'kept', dbName: 'ods_db' }],
    });

    expect(repos[CertificationProcess.name].delete).toHaveBeenCalledWith({ odsId: In([42]) });
    expect(repos[Ods.name].delete).toHaveBeenCalledWith([42]);
    expect(calledBefore(repos[CertificationProcess.name].delete, repos[Ods.name].delete)).toBe(
      true,
    );
  });

  it('leaves certification processes alone when no ODS is removed', async () => {
    const { em, repos } = makeRecordingEntityManager([makeOds({ id: 43, odsInstanceId: 8 })]);

    await persistSyncTenant({
      em,
      edfiTenant: makeTenant(),
      odss: [{ id: 8, name: 'kept', dbName: 'ods_db' }],
    });

    expect(repos[CertificationProcess.name].delete).not.toHaveBeenCalled();
  });
});

describe('persistSyncDeleteOds', () => {
  it('deletes the ODS certification processes before the ODS row', async () => {
    const { em, repos } = makeRecordingEntityManager();

    await persistSyncDeleteOds({
      em,
      edfiTenant: makeTenant(),
      ods: makeOds({ id: 42 }),
    });

    expect(repos[CertificationProcess.name].delete).toHaveBeenCalledWith({ odsId: In([42]) });
    expect(calledBefore(repos[CertificationProcess.name].delete, repos[Ods.name].delete)).toBe(
      true,
    );
  });
});
