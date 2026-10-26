import { DataSource, EntitySchema } from 'typeorm';
import { Subject } from 'typeorm/persistence/Subject';
import { SubjectChangedColumnsComputer } from 'typeorm/persistence/SubjectChangedColumnsComputer';
import { encryptedJsonTransformer } from './encrypted-json.transformer';

const KEY = 'a'.repeat(64);

describe('encryptedJsonTransformer', () => {
  const original = global.DB_SECRETS_ENCRYPTION;
  afterEach(() => {
    global.DB_SECRETS_ENCRYPTION = original;
  });

  it('round-trips a value without storing it in plain text', () => {
    global.DB_SECRETS_ENCRYPTION = { KEY, IV: '' };
    const value = { state: 'body', body: 'x' };

    const stored = encryptedJsonTransformer.to(value);

    expect(stored).not.toContain('"body"');
    expect(encryptedJsonTransformer.from(stored)).toEqual(value);
  });

  it('refuses to write without the encryption key', () => {
    delete global.DB_SECRETS_ENCRYPTION;

    expect(() => encryptedJsonTransformer.to({ state: 'body', body: 'x' })).toThrow(
      'DB_SECRETS_ENCRYPTION not defined',
    );
  });

  it('keeps null as null both ways', () => {
    global.DB_SECRETS_ENCRYPTION = { KEY, IV: '' };

    expect(encryptedJsonTransformer.to(null)).toBeNull();
    expect(encryptedJsonTransformer.from(null)).toBeNull();
  });
});

/**
 * save() compares the new entity with the row it reloads, and that reload leaves out
 * select: false columns. The comparison runs both values through the transformer, so a
 * missing stored value must stay distinguishable from a null written on purpose.
 */
describe('encryptedJsonTransformer in TypeORM change detection', () => {
  const original = global.DB_SECRETS_ENCRYPTION;
  afterEach(() => {
    global.DB_SECRETS_ENCRYPTION = original;
  });

  const changedColumns = async (entity: object, databaseEntity: object) => {
    global.DB_SECRETS_ENCRYPTION = { KEY, IV: '' };
    const step = new EntitySchema({
      name: 'Step',
      columns: {
        stepRunId: { type: 'int', primary: true, generated: true },
        responseStatus: { type: 'int', nullable: true },
        responseSnapshot: {
          type: 'text',
          nullable: true,
          select: false,
          transformer: encryptedJsonTransformer,
        },
      },
    });
    const dataSource = new DataSource({ type: 'postgres', entities: [step] });
    // Builds entity metadata without connecting; protected, but it's what initialize() runs.
    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const subject = new Subject({
      metadata: dataSource.getMetadata('Step'),
      entity,
      canBeUpdated: true,
    });
    subject.databaseEntity = databaseEntity;
    subject.databaseEntityLoaded = true;
    new SubjectChangedColumnsComputer().compute([subject]);
    return subject.diffColumns.map((column) => column.propertyName);
  };

  // The stored snapshot is absent from the reloaded row: it's select: false.
  const reloadedRow = { stepRunId: 1, responseStatus: 200 };

  it('writes a null snapshot over a stored one when a re-run sent nothing', async () => {
    expect(
      await changedColumns(
        { stepRunId: 1, responseStatus: null, responseSnapshot: null },
        reloadedRow,
      ),
    ).toEqual(['responseStatus', 'responseSnapshot']);
  });

  it('writes a new snapshot', async () => {
    expect(
      await changedColumns(
        { stepRunId: 1, responseStatus: 404, responseSnapshot: { state: 'body', body: 'x' } },
        reloadedRow,
      ),
    ).toEqual(['responseStatus', 'responseSnapshot']);
  });

  it('leaves the stored snapshot alone when the entity never loaded it', async () => {
    expect(await changedColumns({ stepRunId: 1, responseStatus: 404 }, reloadedRow)).toEqual([
      'responseStatus',
    ]);
  });
});
